import { QuickCheckSummary } from './QuickCheckSummary';
import type { Finding, Version } from './model';

export function ReviewQuickCheck({ version, findings }: { version: Version; findings: Finding[] }) {
  const checking = ['queued', 'running'].includes(version.analysis.status);
  return (
    <QuickCheckSummary
      key={version._id}
      check={version.quickCheck}
      expanded={checking}
      loading={checking && !version.quickCheck}
      detailedFinished={version.analysis.status === 'succeeded'}
      findingPolicyIds={findings.map((f) => f.policyId)}
    />
  );
}
