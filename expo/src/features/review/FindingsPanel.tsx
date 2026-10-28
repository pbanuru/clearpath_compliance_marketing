import { useState } from 'react';
import { useMutation } from 'convex/react';
import { FiPlus, FiShield, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { severities, type Finding, type Policy, type ReviewDetail, type Version } from './model';
import { FindingCard } from './FindingCard';
import { DecisionBar } from './DecisionBar';
import { DecisionRecord } from './DecisionRecord';
import { ReviewHistory } from './ReviewHistory';
import { Revision } from './Revision';

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
  const retry = useMutation(api.reviews.retryAnalysis);
  const [retrying, setRetrying] = useState(false),
    [error, setError] = useState('');
  const checking = ['queued', 'running'].includes(version.analysis.status);
  const accepted = findings.filter((f) => f.status === 'accepted').length;
  const open = findings.filter((f) => f.status === 'open').length;
  const previous = data.findings.filter(
    (f) => f.version === version.number - 1 && (f.status === 'resolved' || f.status === 'accepted'),
  );
  return (
    <section className="cp-findings-panel" aria-label="Findings">
      <div className="cp-findings-scroll">
        <div className="cp-findings-heading">
          <h2>
            Findings <span className="cp-small">{findings.length}</span>
          </h2>
          {editable && (
            <button className="cp-button quiet" onClick={onAdd}>
              <FiPlus />
              Add finding
            </button>
          )}
        </div>
        <DecisionRecord data={data} number={version.number} />
        {data.review.status === 'changes_requested' &&
          version.number === data.review.currentVersion && (
            <Revision key={version.number} data={data} version={version} onSubmitted={onRevised} />
          )}
        {checking ? (
          <div className="cp-analysis-state" role="status">
            <FiShield size={30} />
            <h3>Checking the material…</h3>
            <p>
              {version.analysis.status === 'queued'
                ? 'Your check is queued. The material will appear here as it is reviewed.'
                : 'Reading the material and checking the applicable policies.'}
            </p>
            <span className="cp-small">You can leave this page. Your review will be here.</span>
          </div>
        ) : (
          <>
            {version.analysis.status === 'failed' && (
              <div className="cp-error">
                <strong>The AI check could not finish</strong>
                <p>{version.analysis.error}</p>
                {editable && (
                  <button
                    className="cp-button"
                    disabled={retrying}
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
                <p className="cp-small">
                  You can still review the material and add findings by hand.
                </p>
                {error && <p role="alert">{error}</p>}
              </div>
            )}
            {version.analysis.summary && (
              <div className="cp-ai-summary">
                <span className="cp-eyebrow">AI FIRST READ</span>
                <p>{version.analysis.summary}</p>
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
                <h3>No issues found</h3>
                <p className="cp-small">Review the material, then record your decision.</p>
              </div>
            )}
            {(['required', 'recommended', 'needs_context'] as const).map((severity) => {
              const group = findings.filter((f) => f.severity === severity);
              return (
                group.length > 0 && (
                  <section key={severity} className="cp-finding-group">
                    <h3 className="cp-group-label">
                      {severities[severity]} <span>{group.length}</span>
                    </h3>
                    {group.map((finding) => (
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
                  </section>
                )
              );
            })}
          </>
        )}
        <ReviewHistory data={data} />
      </div>
      {editable && (
        <DecisionBar
          key={version.number}
          reviewId={data.review._id}
          version={version.number}
          accepted={accepted}
          open={open}
        />
      )}
    </section>
  );
}
