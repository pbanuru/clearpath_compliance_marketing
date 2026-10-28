import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { score } from './score.mjs';
import { saveReport } from './report.mjs';

// Saved-key rescoring preserves the original grading contract. Explicit current-
// key rescoring writes separate versioned reports and leaves the original intact.
// This module has no Convex client and cannot schedule provider calls.
export async function rescore(directory, { currentKey = false } = {}) {
  const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
  let basename = 'report';
  let cases;
  if (currentKey) {
    cases = JSON.parse(await readFile(new URL('../cases/manifest.json', import.meta.url), 'utf8'));
    report.originalKeyVersion = report.keyVersion ?? Object.values(report.keys)[0]?.version ?? 1;
    report.answerKeyHashes = {};
    for (const id of report.caseIds) {
      const bytes = await readFile(new URL(`../answer-key/${id}.json`, import.meta.url));
      report.keys[id] = JSON.parse(bytes);
      report.answerKeyHashes[id] = createHash('sha256').update(bytes).digest('hex');
    }
    const versions = new Set(Object.values(report.keys).map((key) => key.version ?? 1));
    if (versions.size !== 1) throw new Error('Current answer keys must share one version.');
    report.keyVersion = [...versions][0];
    basename = `report-key-v${report.keyVersion}`;
    report.regradedFrom = 'report.json';
  } else report.keyVersion ??= Object.values(report.keys)[0]?.version ?? 1;
  for (const run of report.runs.filter((run) => run.finished)) {
    const detail = JSON.parse(
      await readFile(resolve(directory, `${run.caseId}-${run.number}.json`), 'utf8'),
    );
    if (currentKey) {
      const testCase = cases.find((c) => c.id === run.caseId);
      if (!testCase) throw new Error(`Current case not found: ${run.caseId}`);
      run.clean = Boolean(testCase.clean);
      run.otherRequiredAreFalsePositives = Boolean(testCase.otherRequiredAreFalsePositives);
      run.evaluationNote = testCase.evaluationNote;
    }
    run.pipeline = {
      operations: [...new Set((run.spans ?? []).map((span) => span.operation))],
      models: [...new Set((run.spans ?? []).map((span) => span.model))],
      policyVersions: detail.versions.find((v) => v.number === 1).policyVersions,
    };
    run.score = score(
      report.keys[run.caseId],
      detail,
      run.assets,
      run.clean,
      run.otherRequiredAreFalsePositives,
    );
  }
  report.rescoredAt = new Date().toISOString();
  report.scorerSha256 = createHash('sha256')
    .update(await readFile(new URL('./score.mjs', import.meta.url)))
    .digest('hex');
  report.coverageSha256 = createHash('sha256')
    .update(await readFile(new URL('./coverage.mjs', import.meta.url)))
    .digest('hex');
  await saveReport(report, directory, basename);
  console.info(`Rescored saved responses without provider calls: ${directory}/${basename}.md`);
}
