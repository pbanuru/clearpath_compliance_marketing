import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { createPortal } from 'react-dom';
import { FiCheck, FiMoreHorizontal, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '@/features/assets/media';
import { containDialogFocus } from './dialog';

type Outcome = 'approved' | 'changes_requested' | 'rejected';
export function DecisionBar({
  reviewId,
  version,
  accepted,
  open,
  requiredOpen,
}: {
  reviewId: Id<'reviews'>;
  version: number;
  accepted: number;
  open: number;
  requiredOpen: number;
}) {
  const decide = useMutation(api.reviews.decide);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'approved' | 'rejected'>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  async function submit(outcome: Outcome) {
    setBusy(true);
    setError('');
    try {
      await decide({ reviewId, version, outcome, note: note.trim() || undefined });
      setConfirmation(undefined);
      document.querySelector('.cp-findings-scroll')?.scrollTo({ top: 0 });
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to save the decision.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cp-decision-bar">
      {showNote && (
        <label className="cp-decision-note">
          Decision note <span className="cp-small">Optional</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for the submitter"
          />
        </label>
      )}
      {error && !confirmation && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
      <div className="cp-decision-row">
        <div className="cp-decision-status">
          <span>
            {accepted} accepted · {open} not reviewed
          </span>
          <button
            className="cp-note-toggle"
            aria-expanded={showNote}
            onClick={() => setShowNote(!showNote)}
          >
            {showNote ? 'Hide note' : note ? 'Edit note' : 'Add note'}
          </button>
        </div>
        <div className="cp-decision-buttons">
          {accepted > 0 ? (
            <button
              className="cp-button primary"
              disabled={busy}
              onClick={() => void submit('changes_requested')}
            >
              {busy ? 'Saving…' : `Request changes (${accepted})`}
            </button>
          ) : (
            <button
              className={`cp-button ${requiredOpen ? '' : 'primary'}`}
              disabled={busy}
              onClick={() => (requiredOpen ? setConfirmation('approved') : void submit('approved'))}
            >
              <FiCheck />
              {busy ? 'Saving…' : 'Approve'}
            </button>
          )}
          <details className="cp-decision-overflow">
            <summary
              className="cp-icon"
              aria-label="More decision options"
              title="More decision options"
            >
              <FiMoreHorizontal />
            </summary>
            <div className="cp-decision-menu">
              {accepted > 0 ? (
                <button
                  className="cp-button"
                  disabled
                  title="Dismiss or resolve accepted findings, or request changes."
                >
                  Approve
                </button>
              ) : (
                <button
                  className="cp-button"
                  disabled={busy || !note.trim()}
                  title={
                    !note.trim() ? 'Accept a finding or add a decision note first.' : undefined
                  }
                  onClick={() => void submit('changes_requested')}
                >
                  Request changes
                </button>
              )}
              <button
                className="cp-button"
                disabled={busy}
                onClick={() => setConfirmation('rejected')}
              >
                Reject submission
              </button>
            </div>
          </details>
        </div>
      </div>
      {open > 0 && (
        <span className="cp-decision-disclosure">
          {open} {open === 1 ? 'finding not triaged will be' : 'findings not triaged will be'}{' '}
          marked not raised.
        </span>
      )}
      {typeof document !== 'undefined' &&
        createPortal(
          <dialog
            ref={dialog}
            className="cp-dialog cp-review"
            onClose={() => setConfirmation(undefined)}
            aria-labelledby="decision-confirm-title"
            onKeyDown={containDialogFocus}
          >
            <header>
              <h2 id="decision-confirm-title">
                {confirmation === 'approved'
                  ? `Approve with ${requiredOpen} required ${requiredOpen === 1 ? 'finding' : 'findings'} not reviewed?`
                  : 'Reject this submission?'}
              </h2>
              <button
                className="cp-icon"
                aria-label="Close"
                onClick={() => setConfirmation(undefined)}
              >
                <FiX />
              </button>
            </header>
            <p>
              {confirmation === 'approved'
                ? `${requiredOpen === 1 ? 'It' : 'They'} will be marked not raised.`
                : `This records a final rejection for version ${version}. Use Request changes if the material can be revised.`}
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
                onClick={() => confirmation && void submit(confirmation)}
              >
                {confirmation === 'approved' ? 'Approve' : 'Reject submission'}
              </button>
              <button
                className="cp-button"
                disabled={busy}
                onClick={() => setConfirmation(undefined)}
              >
                Cancel
              </button>
            </div>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
