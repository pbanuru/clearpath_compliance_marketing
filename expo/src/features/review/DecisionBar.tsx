import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { FiCheck, FiMoreHorizontal, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '@/features/assets/media';

export function DecisionBar({
  reviewId,
  version,
  accepted,
  open,
}: {
  reviewId: Id<'reviews'>;
  version: number;
  accepted: number;
  open: number;
}) {
  const decide = useMutation(api.reviews.decide);
  const [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const rejectDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (rejecting) rejectDialog.current?.showModal();
    else rejectDialog.current?.close();
  }, [rejecting]);
  async function submit(outcome: 'approved' | 'changes_requested' | 'rejected') {
    setBusy(true);
    setError('');
    try {
      await decide({ reviewId, version, outcome, note: note.trim() || undefined });
      setRejecting(false);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to save the decision.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cp-decision-bar">
      <label className="cp-decision-note">
        Decision note <span className="cp-small">Optional</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context for the submitter"
        />
      </label>
      {open > 0 && (
        <p className="cp-small">
          {open} {open === 1 ? 'finding not triaged will be' : 'findings not triaged will be'}{' '}
          marked not raised.
        </p>
      )}
      {accepted > 0 && (
        <p className="cp-small">Dismiss or resolve accepted findings, or request changes.</p>
      )}
      {error && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
      <div className="cp-decision-buttons">
        <button
          className={`cp-button ${accepted > 0 ? 'primary' : ''}`}
          disabled={busy || (!accepted && !note.trim())}
          onClick={() => void submit('changes_requested')}
        >
          Request changes ({accepted})
        </button>
        <button
          className={`cp-button ${!accepted ? 'primary' : ''}`}
          disabled={busy || accepted > 0}
          title={
            accepted
              ? 'Dismiss or resolve accepted findings, or request changes.'
              : 'Approve this version'
          }
          onClick={() => void submit('approved')}
        >
          <FiCheck />
          {busy ? 'Saving…' : 'Approve'}
        </button>
        <details className="cp-decision-overflow">
          <summary className="cp-icon" aria-label="More decision options">
            <FiMoreHorizontal />
          </summary>
          <button className="cp-button" disabled={busy} onClick={() => setRejecting(true)}>
            Reject submission
          </button>
        </details>
      </div>
      <dialog
        ref={rejectDialog}
        className="cp-dialog"
        onClose={() => setRejecting(false)}
        aria-labelledby="reject-title"
      >
        <header>
          <h2 id="reject-title">Reject this submission?</h2>
          <button className="cp-icon" aria-label="Close" onClick={() => setRejecting(false)}>
            <FiX />
          </button>
        </header>
        <p>
          This records a final rejection for version {version}. Use Request changes if the material
          can be revised.
        </p>
        {error && (
          <p role="alert" className="cp-error">
            {error}
          </p>
        )}
        <div className="cp-actions">
          <button
            className="cp-button primary"
            disabled={busy}
            onClick={() => void submit('rejected')}
          >
            Reject submission
          </button>
          <button className="cp-button" disabled={busy} onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      </dialog>
    </div>
  );
}
