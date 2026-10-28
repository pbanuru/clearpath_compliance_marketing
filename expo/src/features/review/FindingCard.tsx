import { useState } from 'react';
import { useMutation } from 'convex/react';
import {
  FiCheck,
  FiX,
  FiEdit2,
  FiCopy,
  FiExternalLink,
  FiRotateCcw,
  FiMapPin,
} from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { severities, locationLabel, type Finding, type Policy } from './model';

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
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState('');
  const isCopied = copied === finding.suggestedFix;
  async function triage(status: 'accepted' | 'dismissed' | 'open') {
    setBusy(true);
    setError('');
    try {
      await setStatus({ findingId: finding._id, status, reason: reason || undefined });
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to update finding.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`cp-finding ${selected ? 'selected' : ''} is-${finding.status}`}
      id={`finding-${finding._id}`}
    >
      <div className="cp-finding-top">
        <span className={`cp-pill ${finding.severity}`}>{severities[finding.severity]}</span>
        <span className="cp-finding-state">
          {finding.status === 'accepted' ? (
            <>
              <FiCheck /> Accepted
            </>
          ) : finding.status === 'dismissed' ? (
            <>
              <FiX /> Not raised
            </>
          ) : finding.status === 'resolved' ? (
            <>
              <FiCheck /> Resolved
            </>
          ) : finding.source === 'reviewer' ? (
            'Added by you'
          ) : (
            'AI finding'
          )}
        </span>
      </div>
      <button className="cp-finding-title" type="button" onClick={onSelect} aria-pressed={selected}>
        {finding.title}
      </button>
      <button
        type="button"
        className="cp-location"
        onClick={onSelect}
        title={locationLabel(finding)}
      >
        <FiMapPin />
        {locationLabel(finding)}
      </button>
      <p className="cp-finding-explanation">{finding.explanation}</p>
      {finding.suggestedFix && (
        <div className="cp-suggested">
          <div>
            <strong>Suggested fix</strong>
            <button
              className="cp-icon"
              aria-label="Copy suggested fix"
              title="Copy suggested fix"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(finding.suggestedFix ?? '');
                  setCopied(finding.suggestedFix ?? '');
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to copy.'));
                }
              }}
            >
              {isCopied ? <FiCheck /> : <FiCopy />}
            </button>
          </div>
          <p>{finding.suggestedFix}</p>
          {isCopied && (
            <span role="status" className="cp-small">
              Copied
            </span>
          )}
        </div>
      )}
      <details className="cp-rule">
        <summary>{policy?.title ?? 'Reviewer judgment'}</summary>
        <p>{policy?.check ?? 'A finding added using reviewer judgment.'}</p>
        {policy?.source.url ? (
          <a href={policy.source.url} target="_blank" rel="noreferrer">
            {policy.source.label} <FiExternalLink />
          </a>
        ) : (
          policy && <p>{policy.source.label}</p>
        )}
      </details>
      {finding.dismissReason && <p className="cp-small">{finding.dismissReason}</p>}
      {editable && (
        <div className="cp-finding-controls">
          <div className="cp-actions">
            {finding.status === 'open' ? (
              <>
                <button
                  className="cp-button"
                  disabled={busy}
                  onClick={() => void triage('accepted')}
                >
                  <FiCheck />
                  Accept
                </button>
                <button
                  className="cp-button quiet"
                  disabled={busy}
                  onClick={() => void triage('dismissed')}
                >
                  <FiX />
                  Dismiss
                </button>
              </>
            ) : (
              <button
                className="cp-button quiet"
                disabled={busy}
                onClick={() => void triage('open')}
              >
                <FiRotateCcw />
                Undo {finding.status === 'accepted' ? 'accept' : 'dismiss'}
              </button>
            )}
            <button
              className="cp-icon"
              aria-label={`Edit ${finding.title}`}
              title="Edit finding"
              onClick={onEdit}
            >
              <FiEdit2 />
            </button>
          </div>
          {finding.status === 'open' && (
            <select
              className="cp-dismiss-reason"
              aria-label="Optional dismissal reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Dismissal reason (optional)</option>
              <option>Not an issue</option>
              <option>Already disclosed</option>
              <option>Out of scope</option>
            </select>
          )}
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
