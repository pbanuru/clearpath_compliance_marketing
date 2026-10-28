import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';

export function CampaignSummary({
  counts,
  compact = false,
}: {
  counts: Doc<'campaigns'>['counts'];
  compact?: boolean;
}) {
  const parts = [
    { key: 'approved', label: 'Approved' },
    { key: 'changes_requested', label: 'Changes requested' },
    { key: 'needs_review', label: 'Needs review' },
    { key: 'rejected', label: 'Rejected' },
  ] as const;
  const ready = counts.total > 0 && counts.approved === counts.total;
  return (
    <div className="cp-campaign-summary" data-compact={compact}>
      <div className="cp-campaign-readiness">
        <strong>
          {counts.approved} of {counts.total} approved
        </strong>
        {ready && <span className="cp-pill status-approved">Ready to launch</span>}
      </div>
      <div className="cp-campaign-bar" aria-hidden="true">
        {parts.map(
          ({ key }) =>
            counts[key] > 0 && <span key={key} data-status={key} style={{ flex: counts[key] }} />,
        )}
      </div>
      <div className="cp-campaign-legend">
        {parts.map(
          ({ key, label }) =>
            (!compact || counts[key] > 0) && (
              <span key={key}>
                {counts[key]} {label.toLowerCase()}
              </span>
            ),
        )}
        {compact && counts.total === 0 && <span>No submissions</span>}
      </div>
    </div>
  );
}
