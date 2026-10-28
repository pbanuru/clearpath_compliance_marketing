import { citesBottomOnlyDisclosure } from './coverage.mjs';

const severities = ['required', 'recommended', 'needs_context'];
const ratio = (n, d) => (d ? n / d : null);
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function iou(a, b) {
  if (!a || !b) return 0;
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection) || 0;
}
function contains(a, b) {
  return Boolean(
    a &&
    b &&
    (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())),
  );
}
function coverage(issue, finding) {
  const text = [finding.title, finding.explanation, finding.suggestedFix].join(' ');
  if (issue.covers === 'typicality')
    return /typical|representative|generally expect|results? (?:vary|not guaranteed)/i.test(text);
  if (issue.covers === 'consent') return /consent|permission|opt.in/i.test(text);
  return true;
}
export function match(issue, finding, assets) {
  if (issue.policyIds && !issue.policyIds.includes(finding.policyId)) return null;
  if (!coverage(issue, finding)) return null;
  if (
    issue.optional &&
    issue.severity &&
    !issue.matchAnySeverity &&
    finding.severity !== issue.severity
  )
    return null;
  if (!issue.anchors.length || issue.covers === 'typicality')
    return { methods: [issue.covers ?? 'no_anchor'], iou: null, quality: 0 };
  const location = finding.location;
  let citedDisclosure = null;
  if (
    issue.coverageRule === 'bottom-only-disclosure' &&
    (issue.coveragePolicyIds ?? []).includes(finding.policyId) &&
    citesBottomOnlyDisclosure(finding)
  ) {
    const assetId =
      location?.assetId ?? (Object.keys(assets).length === 1 ? Object.values(assets)[0] : null);
    const anchors = issue.anchors.filter((a) => assets[a.asset] === assetId);
    if (anchors.length)
      citedDisclosure = {
        methods: ['bottom_only_disclosure'],
        quality: 0,
        visual: anchors.some((a) => a.region),
        iou: anchors.some((a) => a.region)
          ? Math.max(...anchors.map((a) => iou(a.region, location?.region)))
          : null,
      };
  }
  if (!location) return citedDisclosure;
  const matches = issue.anchors.flatMap((anchor) => {
    if (location.assetId !== assets[anchor.asset]) return [];
    const samePage = !anchor.page || location.page === anchor.page;
    const overlap =
      anchor.region && location.region && samePage ? iou(anchor.region, location.region) : null;
    const methods = [];
    if (contains(anchor.quote, location.quote)) methods.push('quote');
    if (anchor.time && Number.isFinite(location.startSeconds)) {
      const end = location.endSeconds ?? location.startSeconds;
      if (location.startSeconds <= anchor.time.end && end >= anchor.time.start)
        methods.push('time');
    }
    if (overlap !== null && overlap >= 0.1) methods.push('region');
    if (!methods.length) return [];
    return [
      {
        methods,
        iou: overlap,
        visual: Boolean(anchor.region),
        quality: methods.length + (overlap ?? 0),
      },
    ];
  });
  return matches.sort((a, b) => b.quality - a.quality)[0] ?? citedDisclosure;
}
export function score(key, detail, assets, clean = false, otherRequiredAreFalsePositives = false) {
  const findings = detail.findings;
  const used = new Set();
  const issues = key.issues.map((issue) => {
    const matches = findings
      .flatMap((finding, index) => {
        const location = match(issue, finding, assets);
        if (!location) return [];
        used.add(index);
        return [{ index, findingId: finding._id, severity: finding.severity, ...location }];
      })
      .sort((a, b) => b.quality - a.quality || a.index - b.index);
    const primary = matches[0];
    const accepted = issue.acceptedSeverities ?? [issue.severity];
    return {
      ...issue,
      caught: matches.length > 0,
      matches,
      predictedSeverity: primary?.severity ?? 'missed',
      agreement: primary ? accepted.includes(primary.severity) : null,
      adjacent: primary ? (issue.adjacentSeverities ?? []).includes(primary.severity) : false,
    };
  });
  const required = issues.filter((issue) => !issue.optional && issue.severity === 'required');
  const caught = issues.filter((issue) => !issue.optional && issue.caught);
  const extras = findings.filter((_, index) => !used.has(index));
  const visualIoUs = issues
    .filter((issue) => !issue.optional)
    .flatMap((issue) => {
      if (!issue.caught || !issue.matches[0].visual) return [];
      // Quote matches without a predicted box count as zero localization accuracy.
      return [issue.matches[0].iou ?? 0];
    });
  const quoteFindings = findings.filter((finding) => typeof finding.quoteFound === 'boolean');
  const confusion = Object.fromEntries(
    severities.map((severity) => [
      severity,
      Object.fromEntries([...severities, 'missed'].map((predicted) => [predicted, 0])),
    ]),
  );
  for (const issue of issues.filter((issue) => !issue.optional))
    confusion[issue.severity][issue.predictedSeverity]++;
  return {
    issues,
    requiredCaught: required.filter((issue) => issue.caught).length,
    requiredTotal: required.length,
    requiredRecall: ratio(required.filter((issue) => issue.caught).length, required.length),
    requiredAtRequired: required.filter((issue) =>
      issue.matches.some((m) => m.severity === 'required'),
    ).length,
    severityAgreed: caught.filter((issue) => issue.agreement).length,
    severityCompared: caught.length,
    severityAgreement: ratio(caught.filter((issue) => issue.agreement).length, caught.length),
    adjacentAgreements: caught.filter((issue) => issue.adjacent).length,
    confusion,
    extras,
    clean,
    requiredFalsePositives: findings.filter(
      (finding, index) =>
        finding.severity === 'required' &&
        (clean ||
          (otherRequiredAreFalsePositives &&
            !issues.some(
              (issue) =>
                !issue.optional &&
                (issue.acceptedSeverities ?? [issue.severity]).includes('required') &&
                issue.matches.some((match) => match.index === index),
            ))),
    ),
    quoteFound: {
      found: quoteFindings.filter((f) => f.quoteFound).length,
      total: quoteFindings.length,
    },
    location: {
      meanIoU: mean(visualIoUs),
      visualIoUs,
      boxedMatches: issues.filter(
        (issue) =>
          !issue.optional &&
          issue.caught &&
          issue.anchors.some((anchor) => anchor.region) &&
          issue.matches[0].iou !== null,
      ).length,
    },
  };
}

export function aggregate(runs) {
  const scores = runs.filter((run) => run.score).map((run) => run.score);
  const sum = (field) => scores.reduce((n, score) => n + score[field], 0);
  const successfulScores = runs
    .filter((run) => run.analysis?.status === 'succeeded' && run.score)
    .map((run) => run.score);
  const successfulRequiredCaught = successfulScores.reduce(
    (n, score) => n + score.requiredCaught,
    0,
  );
  const successfulRequiredTotal = successfulScores.reduce((n, score) => n + score.requiredTotal, 0);
  const confusion = Object.fromEntries(
    severities.map((severity) => [
      severity,
      Object.fromEntries(
        [...severities, 'missed'].map((predicted) => [
          predicted,
          scores.reduce((n, score) => n + score.confusion[severity][predicted], 0),
        ]),
      ),
    ]),
  );
  const requiredCaught = sum('requiredCaught'),
    requiredTotal = sum('requiredTotal');
  const severityAgreed = sum('severityAgreed'),
    severityCompared = sum('severityCompared');
  const visualIoUs = scores.flatMap((score) => score.location.visualIoUs);
  const quoteFound = scores.reduce(
    (result, score) => ({
      found: result.found + score.quoteFound.found,
      total: result.total + score.quoteFound.total,
    }),
    { found: 0, total: 0 },
  );
  return {
    runs: runs.length,
    completed: runs.filter((run) => run.analysis?.status === 'succeeded').length,
    scoredRuns: scores.length,
    errors: runs.filter((run) => run.error).length,
    requiredCaught,
    requiredTotal,
    successfulRequiredCaught,
    successfulRequiredTotal,
    successfulAnalysisRecall: ratio(successfulRequiredCaught, successfulRequiredTotal),
    requiredRecall: ratio(requiredCaught, requiredTotal),
    requiredAtRequired: sum('requiredAtRequired'),
    severityAgreed,
    severityCompared,
    severityAgreement: ratio(severityAgreed, severityCompared),
    adjacentAgreements: sum('adjacentAgreements'),
    confusion,
    quoteFound,
    quoteFoundRate: ratio(quoteFound.found, quoteFound.total),
    meanIoU: mean(visualIoUs),
    extrasCount: scores.reduce((n, score) => n + score.extras.length, 0),
    extraRequiredCount: scores.reduce(
      (n, score) => n + score.extras.filter((f) => f.severity === 'required').length,
      0,
    ),
    cleanRequiredFalsePositives: scores.reduce(
      (n, score) => n + (score.clean ? score.requiredFalsePositives.length : 0),
      0,
    ),
    requiredFalsePositivesCount: scores.reduce(
      (n, score) => n + score.requiredFalsePositives.length,
      0,
    ),
    meanLatencyMs: mean(runs.map((run) => run.latencyMs).filter(Number.isFinite)),
    providerLatencyMs: runs.reduce((n, run) => n + (run.providerLatencyMs ?? 0), 0),
    knownCostUsd: runs.reduce((n, run) => n + (run.knownCostUsd ?? 0), 0),
    unknownCostCalls: runs.reduce((n, run) => n + (run.unknownCostCalls ?? 0), 0),
    quickCheckCalls: runs.reduce(
      (n, run) => n + (run.spans ?? []).filter((s) => s.operation === 'quick_check').length,
      0,
    ),
    transcriptionCalls: runs.reduce(
      (n, run) => n + (run.spans ?? []).filter((s) => s.operation === 'transcription').length,
      0,
    ),
    captureCalls: runs.reduce(
      (n, run) => n + (run.spans ?? []).filter((s) => s.operation === 'page_capture').length,
      0,
    ),
    analysisCalls: runs.reduce(
      (n, run) => n + (run.spans ?? []).filter((s) => s.operation === 'review').length,
      0,
    ),
  };
}
