import { useState } from 'react';
import { useMutation } from 'convex/react';
import { FiCheck, FiX, FiRotateCcw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { severities, locationLabel, type Finding, type Policy } from './model';
import { FindingDetails } from './FindingDetails';

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
  const state = {
    open: 'Not reviewed',
    accepted: 'Accepted',
    dismissed: 'Not raised',
    resolved: 'Resolved',
  }[finding.status];
  return (
    <article
      className={`cp-finding ${selected ? 'selected' : ''} is-${finding.status}`}
      id={`finding-${finding._id}`}
    >
      <div className="cp-finding-row">
        <button
          className="cp-finding-select"
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          aria-controls={`detail-${finding._id}`}
        >
          <span
            className={`cp-severity-dot ${finding.severity}`}
            title={severities[finding.severity]}
            aria-label={severities[finding.severity]}
          />
          <span className="cp-finding-label">
            <strong>{finding.title}</strong>
            <span className="cp-finding-row-meta">
              <span className="cp-location" title={locationLabel(finding)}>
                {locationLabel(finding)}
              </span>
              <span className="cp-finding-state">{state}</span>
            </span>
          </span>
        </button>
        {editable && (
          <div className="cp-inline-triage">
            <button
              className={`cp-icon ${finding.status === 'accepted' ? 'active' : ''}`}
              title="Accept finding (A)"
              aria-label={`Accept: ${finding.title}`}
              aria-pressed={finding.status === 'accepted'}
              data-triage="accept"
              disabled={busy}
              onClick={() => void triage('accepted')}
            >
              <FiCheck />
            </button>
            <button
              className={`cp-icon ${finding.status === 'dismissed' ? 'active' : ''}`}
              title="Dismiss finding (D)"
              aria-label={`Dismiss: ${finding.title}`}
              aria-pressed={finding.status === 'dismissed'}
              data-triage="dismiss"
              disabled={busy}
              onClick={() => void triage('dismissed')}
            >
              <FiX />
            </button>
            {finding.status !== 'open' && (
              <button
                className="cp-icon"
                title="Reopen finding (U)"
                aria-label={`Reopen: ${finding.title}`}
                data-triage="reopen"
                disabled={busy}
                onClick={() => void triage('open')}
              >
                <FiRotateCcw />
              </button>
            )}
          </div>
        )}
      </div>
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
            title="Skip reason"
            onClick={() => setChoosingReason(false)}
          >
            <FiX />
          </button>
        </div>
      )}
      {selected && (
        <div id={`detail-${finding._id}`} className="cp-finding-detail">
          <FindingDetails finding={finding} policy={policy} editable={editable} onEdit={onEdit} />
        </div>
      )}
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
    </article>
  );
}
