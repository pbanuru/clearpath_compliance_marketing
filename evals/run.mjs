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
import { prepareWebpages } from './prepare-webpages.mjs';
import { productProvenance, paidAttempt, reserveAttempts, videoErrors } from './lib/product.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({
  options: {
    case: { type: 'string' },
    suite: { type: 'string' },
    budget: { type: 'string', default: '39' },
    'prepare-pages': { type: 'string' },
    'capture-source': { type: 'string' },
    'product-source': { type: 'string' },
    boxes: { type: 'string' },
    rescore: { type: 'string' },
    key: { type: 'string', default: 'saved' },
    runs: { type: 'string', default: '1' },
    resume: { type: 'string' },
  },
});
if (values.boxes) {
  await generateBoxes(values.boxes, values.case);
  process.exit(0);
}
if (values.rescore) {
  if (!['saved', 'current'].includes(values.key))
    throw new Error('--key must be saved or current.');
  await rescore(resolve(values.rescore), { currentKey: values.key === 'current' });
  process.exit(0);
}
if (values['prepare-pages']) {
  await prepareWebpages(values['prepare-pages'], values['capture-source']);
  process.exit(0);
}
const callBudget = Number(values.budget);
if (!Number.isSafeInteger(callBudget) || callBudget < 2)
  throw new Error('--budget must be a safe integer of at least 2 provider attempts.');
const repetitions = Number(values.runs);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30)
  throw new Error('--runs must be an integer between 1 and 30.');
const allCases = JSON.parse(await readFile(resolve(root, 'evals/cases/manifest.json'), 'utf8'));
const cases = allCases.filter(
  (c) =>
    (!values.case || c.id === values.case) &&
    (!values.suite || (c.suite ?? 'original') === values.suite),
);
// Finish independent cases before the video failure gate.
cases.sort((a, b) => Number(a.id === 'affiliate-video') - Number(b.id === 'affiliate-video'));
if (!cases.length) throw new Error(`Unknown case: ${values.case}`);
if (cases.length * repetitions > callBudget) throw new Error('Requested reviews exceed --budget.');
const directory = values.resume
  ? resolve(values.resume)
  : resolve(
      root,
      'evals/results',
      new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
    );
await mkdir(directory, { recursive: true });
const api = client(root);
const productRoot = resolve(values['product-source'] ?? root);
const product = await productProvenance(productRoot);
const keys = {};
const hashes = {};
async function hash(path) {
  const bytes = await readFile(resolve(root, path));
  return createHash('sha256').update(bytes).digest('hex');
}
for (const c of cases) {
  const keyPath = `evals/answer-key/${c.id}.json`;
  keys[c.id] = JSON.parse(await readFile(resolve(root, keyPath), 'utf8'));
  for (const path of [keyPath, ...c.assets.flatMap((a) => [a.path, ...(a.dependencies ?? [])])])
    hashes[path] = await hash(path);
}
const keyVersions = new Set(Object.values(keys).map((key) => key.version ?? 1));
if (keyVersions.size !== 1) throw new Error('Selected answer keys must share one version.');
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
    JSON.stringify(report.hashes) !== JSON.stringify(hashes) ||
    (report.product && JSON.stringify(report.product) !== JSON.stringify(product))
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
    product,
    caseIds: cases.map((c) => c.id),
    repetitions,
    plannedRuns: cases.length * repetitions,
    callBudget,
    callsUsed: 0,
    hashes,
    keys,
    keyVersion: keys[cases[0].id].version ?? 1,
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
  run.spans = await api.spans(run.reviewId, Object.values(run.assets));
  run.pipeline = {
    operations: [...new Set(run.spans.map((span) => span.operation))],
    models: [...new Set(run.spans.map((span) => span.model))],
    policyVersions: detail.versions.find((v) => v.number === 1).policyVersions,
  };
  run.knownCostUsd = run.spans.reduce((n, span) => n + (span.costUsd ?? 0), 0);
  run.unknownCostCalls = run.spans.filter((span) => span.costUsd === null).length;
  run.providerLatencyMs = run.spans.reduce((n, span) => n + span.durationMs, 0);
  if (!['succeeded', 'failed'].includes(run.analysis.status))
    throw new Error(
      'Analysis did not finish within 600 seconds; resume this directory to keep polling.',
    );
  run.latencyMs = run.analysis.finishedAt - run.analysis.startedAt;
  run.score = score(
    keys[run.caseId],
    detail,
    run.assets,
    run.clean,
    run.otherRequiredAreFalsePositives,
  );
  await writeFile(
    resolve(directory, `${run.caseId}-${run.number}.json`),
    `${JSON.stringify(detail)}\n`,
  );
  run.finished = true;
  if (run.analysis.error) run.error = run.analysis.error;
  if (run.caseId === 'affiliate-video') {
    run.extractionErrors = videoErrors(detail);
    if (run.extractionErrors.length) run.error = run.extractionErrors.join('\n');
  }
}
try {
  for (const c of cases)
    for (let number = 1; number <= repetitions; number++) {
      let run = report.runs.find((r) => r.caseId === c.id && r.number === number);
      if (run?.finished) {
        if (c.id === 'affiliate-video' && run.error)
          throw new Error(`Stopped after saved video failure: ${run.error}`);
        continue;
      }
      if (run?.ambiguousCreate)
        throw new Error(
          'Review creation outcome is unknown; inspect DEV before scheduling more paid calls.',
        );
      // The real pipeline retries once per operation: reserve worst-case attempts.
      const reserve = reserveAttempts(c);
      if (!run?.reviewId && report.callsUsed + reserve > report.callBudget)
        throw new Error(
          `Budget guard (${report.callBudget}): used ${report.callsUsed}, next run reserves ${reserve}.`,
        );
      if (!run) {
        run = {
          caseId: c.id,
          number,
          clean: Boolean(c.clean),
          otherRequiredAreFalsePositives: Boolean(c.otherRequiredAreFalsePositives),
          startedAt: new Date().toISOString(),
        };
        report.runs.push(run);
      }
      if (!run.assets)
        run.assets = await uploadCase(api, root, c, directory, `${c.id}-${number}`, productRoot);
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
      report.callsUsed = report.runs.reduce(
        (n, r) => n + (r.spans ?? []).filter(paidAttempt).length,
        0,
      );
      await saveReport(report, directory);
      console.info(
        `${c.id}/${number}: ${run.analysis.status}; required ${run.score.requiredCaught}/${run.score.requiredTotal}; ` +
          `extras ${run.score.extras.length}; $${run.knownCostUsd.toFixed(5)}; calls ${report.callsUsed}/${report.callBudget}`,
      );
      if (c.id === 'affiliate-video' && run.error)
        throw new Error(`Stopped after video failure: ${run.error}`);
    }
  report.finishedAt = new Date().toISOString();
  if (report.runs.some((run) => run.error)) process.exitCode = 1;
  report.productEnd = await productProvenance(productRoot);
  report.productChanged = JSON.stringify(report.product) !== JSON.stringify(report.productEnd);
  if (report.productChanged) report.errors.push('Product source changed during this eval.');
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
  report.callsUsed = report.runs.reduce(
    (n, r) => n + (r.spans ?? []).filter(paidAttempt).length,
    0,
  );
  await saveReport(report, directory);
}
