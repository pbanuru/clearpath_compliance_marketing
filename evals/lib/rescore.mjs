import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { score } from './score.mjs';
import { saveReport } from './report.mjs';

// Recalculate from saved raw responses and the report's frozen answer key.
// This operation has no Convex client and cannot schedule provider calls.
export async function rescore(directory) {
  const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
  for (const run of report.runs.filter((run) => run.finished)) {
    const detail = JSON.parse(
      await readFile(resolve(directory, `${run.caseId}-${run.number}.json`), 'utf8'),
    );
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
  await saveReport(report, directory);
  console.info(`Rescored saved responses without provider calls: ${directory}`);
}
