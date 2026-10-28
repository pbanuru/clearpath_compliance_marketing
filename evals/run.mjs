import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { client, deployment, identity } from './lib/convex.mjs';
import { uploadCase } from './lib/upload.mjs';
import { score } from './lib/score.mjs';
import { saveReport } from './lib/report.mjs';
import { generateBoxes } from './boxes.mjs';
import { rescore } from './lib/rescore.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({
  options: {
    case: { type: 'string' },
    boxes: { type: 'string' },
    rescore: { type: 'string' },
    runs: { type: 'string', default: '1' },
    resume: { type: 'string' },
  },
});
if (values.boxes) {
  await generateBoxes(values.boxes);
  process.exit(0);
}
if (values.rescore) {
  await rescore(resolve(values.rescore));
  process.exit(0);
}
const repetitions = Number(values.runs);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30)
  throw new Error('--runs must be an integer between 1 and 30.');
const allCases = JSON.parse(await readFile(resolve(root, 'evals/cases/manifest.json'), 'utf8'));
const cases = allCases.filter((c) => !values.case || c.id === values.case);
if (!cases.length) throw new Error(`Unknown case: ${values.case}`);
if (cases.length * repetitions > 30) throw new Error('At most 30 reviews per invocation.');
const directory = values.resume
  ? resolve(values.resume)
  : resolve(
      root,
      'evals/results',
      new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
    );
await mkdir(directory, { recursive: true });
const api = client(root);
const keys = {};
const hashes = {};
async function hash(path) {
  const bytes = await readFile(resolve(root, path));
  return createHash('sha256').update(bytes).digest('hex');
}
for (const c of cases) {
  const keyPath = `evals/answer-key/${c.id}.json`;
  keys[c.id] = JSON.parse(await readFile(resolve(root, keyPath), 'utf8'));
  for (const path of [keyPath, ...c.assets.map((a) => a.path)]) hashes[path] = await hash(path);
}
for (const name of (await readdir(resolve(root, 'backend/convex/review'))).filter((n) =>
  n.endsWith('.ts'),
))
  hashes[`backend/convex/review/${name}`] = await hash(`backend/convex/review/${name}`);
for (const path of [
  'evals/cases/manifest.json',
  'evals/cases/affiliate-video-timing.json',
  'expo/src/features/assets/media.ts',
  'expo/src/features/assets/videoCapture.ts',
])
  hashes[path] = await hash(path);
let report;
if (values.resume) {
  report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
  if (
    report.deployment !== deployment ||
    JSON.stringify(report.caseIds) !== JSON.stringify(cases.map((c) => c.id)) ||
    report.repetitions !== repetitions ||
    JSON.stringify(report.hashes) !== JSON.stringify(hashes)
  )
    throw new Error('Resume requires the same cases, runs, deployment, input and pipeline hashes.');
} else {
  report = {
    startedAt: new Date().toISOString(),
    deployment,
    identity,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    gitStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
    nodeVersion: process.version,
    caseIds: cases.map((c) => c.id),
    repetitions,
    plannedRuns: cases.length * repetitions,
    callBudget: 30,
    callsUsed: 0,
    hashes,
    keys,
    runs: [],
    errors: [],
    policiesStart: await api.run('policies:list', {}),
  };
}
console.info(`target: dev (${deployment}); eval identity ${identity.subject}`);
console.info(`Results: ${directory}`);
await saveReport(report, directory);
async function collect(run) {
  const deadline = Date.now() + 600000;
  let detail;
  while (Date.now() < deadline) {
    detail = await api.run('reviews:get', { reviewId: run.reviewId });
    const analysis = detail.versions.find((v) => v.number === 1).analysis;
    if (['succeeded', 'failed'].includes(analysis.status)) break;
    await setTimeout(3000);
  }
  run.analysis = detail.versions.find((v) => v.number === 1).analysis;
  run.spans = await api.spans(run.reviewId);
  run.knownCostUsd = run.spans.reduce((n, span) => n + (span.costUsd ?? 0), 0);
  run.unknownCostCalls = run.spans.filter((span) => span.costUsd === null).length;
  run.providerLatencyMs = run.spans.reduce((n, span) => n + span.durationMs, 0);
  if (!['succeeded', 'failed'].includes(run.analysis.status))
    throw new Error(
      'Analysis did not finish within 600 seconds; resume this directory to keep polling.',
    );
  run.latencyMs = run.analysis.finishedAt - run.analysis.startedAt;
  run.score = score(keys[run.caseId], detail, run.assets, run.clean);
  await writeFile(
    resolve(directory, `${run.caseId}-${run.number}.json`),
    `${JSON.stringify(detail)}\n`,
  );
  run.finished = true;
  if (run.analysis.error) run.error = run.analysis.error;
}
try {
  for (const c of cases)
    for (let number = 1; number <= repetitions; number++) {
      let run = report.runs.find((r) => r.caseId === c.id && r.number === number);
      if (run?.finished) continue;
      if (run?.ambiguousCreate)
        throw new Error(
          'Review creation outcome is unknown; inspect DEV before scheduling more paid calls.',
        );
      // The real pipeline retries once per operation: reserve worst-case attempts.
      const reserve = c.assets.some((a) => a.path.endsWith('.mp4')) ? 4 : 2;
      if (!run?.reviewId && report.callsUsed + reserve > report.callBudget)
        throw new Error(
          `30-call budget guard: used ${report.callsUsed}, next run reserves ${reserve}.`,
        );
      if (!run) {
        run = {
          caseId: c.id,
          number,
          clean: Boolean(c.clean),
          startedAt: new Date().toISOString(),
        };
        report.runs.push(run);
      }
      if (!run.assets) run.assets = await uploadCase(api, root, c, directory, `${c.id}-${number}`);
      await saveReport(report, directory);
      if (!run.reviewId) {
        // Persist before the mutation: an interrupted create must never silently create another review.
        run.ambiguousCreate = true;
        await saveReport(report, directory);
        run.reviewId = await api.run('reviews:create', {
          title: `${c.product.replaceAll('_', ' ')} ${c.channel.replaceAll('_', ' ')} submission`,
          product: c.product,
          channel: c.channel,
          jurisdictions: c.jurisdictions,
          ...(c.offerTerms ? { offerTerms: c.offerTerms } : {}),
          ...(c.notes ? { notes: c.notes } : {}),
          assetIds: Object.values(run.assets),
        });
        run.ambiguousCreate = false;
        await saveReport(report, directory);
      }
      delete run.error;
      try {
        await collect(run);
      } catch (error) {
        run.error = error.message;
        throw error;
      }
      report.callsUsed = report.runs.reduce((n, r) => n + (r.spans?.length ?? 0), 0);
      await saveReport(report, directory);
      console.info(
        `${c.id}/${number}: ${run.analysis.status}; required ${run.score.requiredCaught}/${run.score.requiredTotal}; ` +
          `extras ${run.score.extras.length}; $${run.knownCostUsd.toFixed(5)}; calls ${report.callsUsed}/30`,
      );
    }
  report.finishedAt = new Date().toISOString();
  report.policiesEnd = await api.run('policies:list', {});
  report.policiesChanged =
    JSON.stringify(report.policiesStart) !== JSON.stringify(report.policiesEnd);
  if (report.policiesChanged)
    report.errors.push(
      'DEV policies changed during this eval; runs may not share one policy version.',
    );
} catch (error) {
  report.errors.push(error.message);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.callsUsed = report.runs.reduce((n, r) => n + (r.spans?.length ?? 0), 0);
  await saveReport(report, directory);
}
