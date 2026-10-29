import { QuickCheckSummary } from './QuickCheckSummary';
import type { Finding, Version } from './model';
import { findingPolicyReferences } from './findingPolicyReferences';

export function ReviewQuickCheck({ version, findings }: { version: Version; findings: Finding[] }) {
  if (version.assets.every((asset) => asset.kind === 'document')) return null;
  const checking = ['queued', 'running'].includes(version.analysis.status);
  return (
    <QuickCheckSummary
      key={version._id}
      check={version.quickCheck}
      expanded={checking}
      loading={checking && !version.quickCheck}
      detailedFinished={version.analysis.status === 'succeeded'}
      findingPolicyIds={findings.flatMap((finding) =>
        findingPolicyReferences(finding).map((reference) => reference.key),
      )}
    />
  );
}
