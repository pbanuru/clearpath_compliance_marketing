import { useState } from 'react';
import { useMutation } from 'convex/react';
import { FiPlus, FiShield, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { severities, type Finding, type Policy, type ReviewDetail, type Version } from './model';
import { FindingCard } from './FindingCard';
import { DecisionRecord } from './DecisionRecord';
import { ReviewHistory } from './ReviewHistory';
import { Revision } from './Revision';
import { useFindingKeys } from './useFindingKeys';
import { evidenceNotice } from './evidence';

export function FindingsPanel({
  data,
  version,
  findings,
  selected,
  editable,
  policies,
  onSelect,
  onEdit,
  onAdd,
  onRevised,
}: {
  data: ReviewDetail;
  version: Version;
  findings: Finding[];
  selected?: Finding;
  editable: boolean;
  policies: Policy[];
  onSelect: (f: Finding) => void;
  onEdit: (f: Finding) => void;
  onAdd: () => void;
  onRevised: () => void;
}) {
  const [filter, setFilter] = useState<{
    version: Version['_id'];
    severity: Finding['severity'];
  }>();
  const selectedOutsideFilter =
    filter?.version === version._id && selected && selected.severity !== filter.severity;
  const activeFilter =
    filter?.version === version._id &&
    !selectedOutsideFilter &&
    findings.some((f) => f.severity === filter.severity)
      ? filter.severity
      : undefined;
  // Commit an external selection with its row already visible.
  if (selectedOutsideFilter) setFilter(undefined);
  function filterBySeverity(severity: Finding['severity']) {
    const next = activeFilter === severity ? undefined : { version: version._id, severity };
    setFilter(next);
    if (next && selected?.severity !== severity) {
      const first = findings.find((f) => f.severity === severity);
      if (first) onSelect(first);
    }
  }
  const ordered = (['required', 'recommended', 'needs_context'] as const).flatMap((severity) =>
    findings.filter((f) => f.severity === severity && (!activeFilter || severity === activeFilter)),
  );
  useFindingKeys(
    ordered,
    ordered.find((f) => f._id === selected?._id),
    editable,
    onSelect,
    onEdit,
  );
  const retry = useMutation(api.reviews.retryAnalysis);
  const [retrying, setRetrying] = useState(false),
    [error, setError] = useState('');
  const checking = ['queued', 'running'].includes(version.analysis.status);
  const incomplete = evidenceNotice(data, version);
  const reviewedAi = findings.some(
    (finding) =>
      finding.source === 'ai' &&
      (finding.status !== 'open' || data.events.some((e) => e.findingId === finding._id)),
  );
  const previous = data.findings.filter(
    (f) => f.version === version.number - 1 && (f.status === 'resolved' || f.status === 'accepted'),
  );
  return (
    <section className="cp-findings-panel" aria-label="Findings">
      <div className="cp-findings-scroll">
        {incomplete && (
          <p className="cp-evidence-notice" role="status">
            {incomplete}
          </p>
        )}
        <div className="cp-findings-heading">
          <h2>
            Findings <span className="cp-small">{findings.length}</span>
          </h2>
          {editable && (
            <button
              className="cp-icon"
              aria-label="Add finding"
              title="Add finding"
              onClick={onAdd}
            >
              <FiPlus />
            </button>
          )}
        </div>
        {findings.length > 0 && (
          <div className="cp-severity-counts" aria-label="Filter findings by severity">
            {(['required', 'recommended', 'needs_context'] as const).map((severity) => {
              const count = findings.filter((f) => f.severity === severity).length;
              return (
                count > 0 && (
                  <button
                    key={severity}
                    type="button"
                    aria-pressed={activeFilter === severity}
                    onClick={() => filterBySeverity(severity)}
                  >
                    {count} {severities[severity]}
                  </button>
                )
              );
            })}
          </div>
        )}
        <DecisionRecord data={data} number={version.number} />
        {data.review.status === 'changes_requested' &&
          version.number === data.review.currentVersion && (
            <Revision key={version.number} data={data} version={version} onSubmitted={onRevised} />
          )}
        {checking ? (
          <div className="cp-analysis-state" role="status">
            <FiShield size={30} />
            <h3>Checking the material…</h3>
            {version.analysis.status === 'queued' && <p>Check queued.</p>}
          </div>
        ) : (
          <>
            {(version.analysis.status === 'failed' ||
              !!version.analysis.extractionNotes?.length) && (
              <div className="cp-analysis-retry">
                {editable && (
                  <button
                    className="cp-button"
                    disabled={retrying || reviewedAi}
                    onClick={async () => {
                      setRetrying(true);
                      setError('');
                      try {
                        await retry({ reviewId: data.review._id });
                      } catch (cause) {
                        setError(errorMessage(cause, 'Unable to retry the check.'));
                      } finally {
                        setRetrying(false);
                      }
                    }}
                  >
                    <FiRefreshCw />
                    {retrying ? 'Retrying…' : 'Try again'}
                  </button>
                )}
                {editable && reviewedAi && (
                  <p>
                    Your finding edits and decisions are preserved. Retry is unavailable after
                    reviewing AI findings; continue reviewing the material by hand.
                  </p>
                )}
                {version.analysis.error && <p className="cp-small">{version.analysis.error}</p>}
                {error && <p role="alert">{error}</p>}
              </div>
            )}
            {previous.length > 0 && (
              <section className="cp-recheck">
                <h3>Changes from version {version.number - 1}</h3>
                {previous.map((f) => (
                  <div key={f._id}>
                    <span
                      className={`cp-pill ${f.status === 'resolved' ? 'status-approved' : 'required'}`}
                    >
                      {f.status === 'resolved'
                        ? `Resolved in version ${version.number}`
                        : version.analysis.status === 'succeeded'
                          ? 'Still present'
                          : 'Recheck pending'}
                    </span>
                    <strong>{f.title}</strong>
                    {f.recheckNote && <p>{f.recheckNote}</p>}
                    {version.responses.find((r) => r.findingId === f._id)?.text && (
                      <p className="cp-small">
                        Submitter: {version.responses.find((r) => r.findingId === f._id)?.text}
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}
            {!findings.length && version.analysis.status === 'succeeded' && (
              <div className="cp-no-issues">
                <FiCheckCircle size={25} />
                <h3>
                  {incomplete ? 'No issues found in the available evidence' : 'No issues found'}
                </h3>
              </div>
            )}
            {findings.length > 0 && (
              <div className="cp-finding-list">
                {ordered.map((finding) => (
                  <FindingCard
                    key={finding._id}
                    finding={finding}
                    selected={selected?._id === finding._id}
                    editable={editable}
                    policy={policies.find((p) => p.id === finding.policyId)}
                    onSelect={() => onSelect(finding)}
                    onEdit={() => onEdit(finding)}
                  />
                ))}
              </div>
            )}
            {version.analysis.summary && (
              <section className="cp-ai-summary" aria-label="Summary">
                <h3>
                  Summary
                  {version.assets.length > 1 ? ` across all ${version.assets.length} items` : ''}
                </h3>
                <p>{version.analysis.summary}</p>
              </section>
            )}
          </>
        )}
        <ReviewHistory data={data} />
      </div>
    </section>
  );
}
