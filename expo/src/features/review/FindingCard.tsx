import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { FiCheck, FiX, FiRotateCcw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { severities, type Finding, type Policy } from './model';
import { findingEvidence } from './findingEvidence';
import { FindingDetails } from './FindingDetails';
import { RuleReference } from './RuleReference';

export function FindingCard({
  finding,
  policy,
  selected,
  editable,
  onSelect,
  onEdit,
}: {
  finding: Finding;
  policy?: Policy;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const historical = useQuery(
    api.policies.version,
    selected && finding.policyVersion
      ? { key: finding.policyId, version: finding.policyVersion }
      : 'skip',
  );
  const rule = finding.policyVersion ? historical : policy;
  const setStatus = useMutation(api.findings.setStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choosingReason, setChoosingReason] = useState(false);
  async function triage(status: 'accepted' | 'dismissed' | 'open', reason?: string) {
    setBusy(true);
    setError('');
    try {
      await setStatus({ findingId: finding._id, status, reason });
      setChoosingReason(status === 'dismissed' && !reason);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to update finding.'));
    } finally {
      setBusy(false);
    }
  }
  const evidence = findingEvidence(finding);
  const state = { open: '', accepted: 'Accepted', dismissed: 'Not raised', resolved: 'Resolved' }[
    finding.status
  ];
  return (
    <article
      className={`cp-finding ${selected ? 'selected' : ''} is-${finding.status}`}
      id={`finding-${finding._id}`}
    >
      <button
        className="cp-finding-select"
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        aria-controls={selected ? `detail-${finding._id}` : undefined}
      >
        <span className={`cp-finding-evidence ${evidence.quoted ? 'quoted' : 'described'}`}>
          <span title={evidence.text}>
            {evidence.quoted ? `“${evidence.text}”` : evidence.text}
          </span>
          {!evidence.quoted && evidence.label && (
            <span className="cp-finding-location">{evidence.label}</span>
          )}
        </span>
        {!evidence.repeatsTitle && <span className="cp-finding-subtitle">{finding.title}</span>}
      </button>
      <div className="cp-finding-references">
        {policy && selected ? (
          <RuleReference
            title={`${rule?.title ?? policy.title}${finding.policyVersion ? ` · v${finding.policyVersion}` : ''}`}
            label={policy.source.label}
            excerpt={
              rule?.citation?.excerpt ??
              (policy.source.monitor.type === 'internal' ? rule?.check : undefined)
            }
            url={rule?.citation?.url ?? (finding.policyVersion ? null : policy.source.url)}
          />
        ) : (
          <span className="cp-finding-rule">{policy?.source.label ?? 'Reviewer judgment'}</span>
        )}
        <span className="cp-finding-status">
          <span>{severities[finding.severity]}</span>
          {finding.source === 'recheck' && <span>Recheck</span>}
          {state && (
            <span className="cp-finding-state">
              {finding.status === 'accepted' && <FiCheck aria-hidden="true" />} {state}
            </span>
          )}
        </span>
      </div>
      {selected && (
        <div id={`detail-${finding._id}`} className="cp-finding-detail">
          <FindingDetails
            finding={finding}
            citationError={
              historical === null ? 'Saved rule version is unavailable.' : rule?.citationError
            }
          />
          {editable && (
            <div className="cp-finding-actions">
              <button
                className="cp-button quiet"
                title="Accept finding (A)"
                aria-pressed={finding.status === 'accepted'}
                data-triage="accept"
                disabled={busy}
                onClick={() => void triage('accepted')}
              >
                Accept
              </button>
              <button
                className="cp-button quiet"
                title="Dismiss finding (D)"
                aria-pressed={finding.status === 'dismissed'}
                data-triage="dismiss"
                disabled={busy}
                onClick={() => void triage('dismissed')}
              >
                Dismiss
              </button>
              <button className="cp-button quiet" title="Edit finding (E)" onClick={onEdit}>
                Edit
              </button>
              {finding.status !== 'open' && (
                <button
                  className="cp-icon"
                  title="Reopen finding (U)"
                  aria-label="Reopen finding"
                  data-triage="reopen"
                  disabled={busy}
                  onClick={() => void triage('open')}
                >
                  <FiRotateCcw />
                </button>
              )}
            </div>
          )}
          {editable && finding.status === 'dismissed' && choosingReason && (
            <div className="cp-reason-chips" aria-label="Optional dismissal reason">
              <span>
                Reason <small>optional</small>
              </span>
              {['Not an issue', 'Already disclosed', 'Out of scope'].map((reason) => (
                <button
                  className="cp-button quiet"
                  key={reason}
                  disabled={busy}
                  onClick={() => void triage('dismissed', reason)}
                >
                  {reason}
                </button>
              ))}
              <button
                className="cp-icon"
                aria-label="Skip dismissal reason"
                onClick={() => setChoosingReason(false)}
              >
                <FiX />
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
