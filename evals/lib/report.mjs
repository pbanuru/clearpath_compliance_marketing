import { writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { aggregate } from './score.mjs';

const pct = (n) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);
const count = (n, d) => (d ? `${n}/${d} (${pct(n / d)})` : '—');
function summaryTable(report) {
  const lines = [
    '| Case | Runs | Required recall | Severity agreement | Adjacent | Extras (required) | Required FP (key) | Mean latency | Known cost |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [caseId, value] of Object.entries(report.byCase))
    lines.push(
      `| ${caseId} | ${value.completed}/${value.runs} | ${count(value.requiredCaught, value.requiredTotal)} | ` +
        `${count(value.severityAgreed, value.severityCompared)} | ${value.adjacentAgreements} | ` +
        `${value.extrasCount} (${value.extraRequiredCount}) | ${value.requiredFalsePositivesCount} | ` +
        `${value.meanLatencyMs === null ? '—' : `${(value.meanLatencyMs / 1000).toFixed(1)}s`} | ` +
        `$${value.knownCostUsd.toFixed(5)}${value.unknownCostCalls ? ` + ${value.unknownCostCalls} unknown` : ''} |`,
    );
  return lines.join('\n');
}
function markdown(report, basename) {
  const a = report.aggregate;
  const lines = [
    `# ClearPath first-read eval — ${report.startedAt} — answer key v${report.keyVersion ?? 1}`,
    '',
    `DEV: ${report.deployment}. Identity: ${report.identity.subject}. Git: ${report.gitHead}.`,
    `Completed ${a.completed}/${report.plannedRuns}; errors ${a.errors}. Paid provider attempts: ${report.callsUsed}/${report.callBudget} (first read ${a.analysisCalls}, quick check ${a.quickCheckCalls}, transcription ${a.transcriptionCalls}); capture spans ${a.captureCalls}.`,
    `Required recall: **${count(a.requiredCaught, a.requiredTotal)}**. Required issues at required severity: ${count(a.requiredAtRequired, a.requiredTotal)}.`,
    `Successful-analysis-only required recall: ${count(a.successfulRequiredCaught, a.successfulRequiredTotal)} (excludes infrastructure failures).`,
    `Severity agreement among caught issues: ${count(a.severityAgreed, a.severityCompared)}; adjacent: ${a.adjacentAgreements}.`,
    `quoteFound: ${count(a.quoteFound.found, a.quoteFound.total)}. Mean visual IoU: ${a.meanIoU === null ? '—' : a.meanIoU.toFixed(3)}.`,
    `Product source: ${report.product?.gitHead ?? 'not recorded'}.`,
    `Known estimated cost: $${a.knownCostUsd.toFixed(5)}; unknown-cost calls: ${a.unknownCostCalls}.`,
    `Extra required findings: ${a.extraRequiredCount}; required false positives under the key: ${a.requiredFalsePositivesCount} (clean cases: ${a.cleanRequiredFalsePositives}).`,
    '',
    summaryTable(report),
    '',
    '## Per-severity confusion (optional issues excluded)',
    '',
    '| Key severity | required | recommended | needs_context | missed |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const [severity, values] of Object.entries(a.confusion))
    lines.push(`| ${severity} | ${Object.values(values).join(' | ')} |`);
  lines.push(
    '',
    '## Per-run scores',
    '',
    '| Case/run | Required recall | Severity agreement | Extras | Latency | Cost |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const run of report.runs) {
    const s = run.score;
    lines.push(
      `| ${run.caseId}/${run.number} | ${s ? count(s.requiredCaught, s.requiredTotal) : '—'} | ` +
        `${s ? count(s.severityAgreed, s.severityCompared) : '—'} | ${s?.extras.length ?? '—'} | ` +
        `${run.latencyMs === undefined ? '—' : `${(run.latencyMs / 1000).toFixed(1)}s`} | ` +
        `$${(run.knownCostUsd ?? 0).toFixed(5)} |`,
    );
  }
  lines.push('', '## Missed required issues (full key records)', '');
  for (const run of report.runs)
    for (const issue of run.score?.issues ?? [])
      if (issue.severity === 'required' && !issue.optional && !issue.caught)
        lines.push(`- ${run.caseId}/${run.number}: ${JSON.stringify(issue)}`);
  lines.push('', '## Extra findings (full records; manual judgment required)', '');
  for (const run of report.runs)
    for (const finding of run.score?.extras ?? [])
      lines.push(`- ${run.caseId}/${run.number}: ${JSON.stringify(finding)}`);
  lines.push('', '## Required false positives under the key', '');
  for (const run of report.runs)
    for (const finding of run.score?.requiredFalsePositives ?? [])
      lines.push(`- ${run.caseId}/${run.number}: ${JSON.stringify(finding)}`);
  lines.push('', '## Errors verbatim', '');
  const errors = [...(report.errors ?? [])];
  for (const run of report.runs) {
    if (run.error) errors.push(`${run.caseId}/${run.number}\n${run.error}`);
    for (const span of run.spans ?? [])
      if (span.error)
        errors.push(
          `${run.caseId}/${run.number} ${span.operation} attempt ${span.attempt}\n${span.error}`,
        );
  }
  lines.push(
    errors.length
      ? `<pre>${errors.join('\n\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`
      : 'None.',
  );
  lines.push(
    '',
    `Raw findings, issue matches, per-case confusion, spans, provenance and optional observations are in ${basename}.json.`,
    'Recall measures detection at any severity. Clean cases have no recall denominator; required findings are false positives unless an optional key issue explicitly allows required severity.',
    'Costs are span rate estimates, not invoice amounts. Local hashes identify this checkout; deployed prompt code is not fetched by the CLI.',
    'See evals/README.md for matching, denominators, many-to-many matches, and localization rules.',
    '',
  );
  return lines.join('\n');
}
export async function saveReport(report, directory, basename = 'report') {
  report.updatedAt = new Date().toISOString();
  report.byCase = Object.fromEntries(
    report.caseIds.map((id) => [id, aggregate(report.runs.filter((run) => run.caseId === id))]),
  );
  report.aggregate = aggregate(report.runs);
  const temporary = resolve(directory, `${basename}.json.tmp`);
  await writeFile(temporary, `${JSON.stringify(report)}\n`);
  await rename(temporary, resolve(directory, `${basename}.json`));
  await writeFile(resolve(directory, `${basename}.md`), markdown(report, basename));
}
