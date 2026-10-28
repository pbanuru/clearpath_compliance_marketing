import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { FiCheck, FiMoreHorizontal, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '@/features/assets/media';
import { Modal } from '@/components/overlays/Modal';
import { Popover } from '@/components/overlays/Popover';
import { needsApprovalConfirmation } from './evidence';

type Outcome = 'approved' | 'changes_requested' | 'rejected';
export function DecisionBar({
  reviewId,
  version,
  total,
  accepted,
  open,
  requiredOpen,
  evidenceNotice,
}: {
  reviewId: Id<'reviews'>;
  version: number;
  total: number;
  accepted: number;
  open: number;
  requiredOpen: number;
  evidenceNotice?: string;
}) {
  const decide = useMutation(api.reviews.decide);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'approved' | 'rejected'>();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const noteField = useRef<HTMLInputElement>(null);
  const noteToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showNote) noteField.current?.focus();
  }, [showNote]);
  async function submit(outcome: Outcome) {
    setBusy(true);
    setError('');
    try {
      await decide({ reviewId, version, outcome, note: note.trim() || undefined });
      setConfirmation(undefined);
      requestAnimationFrame(() =>
        document.querySelector('.cp-findings-panel')?.scrollIntoView({ block: 'start' }),
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to save the decision.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cp-decision-bar">
      {error && !confirmation && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
      <div className="cp-decision-row">
        <span className="cp-decision-status">
          {total - open} of {total} reviewed
        </span>
        <div className="cp-decision-note-slot">
          {showNote ? (
            <div className="cp-decision-note">
              <input
                ref={noteField}
                aria-label="Decision note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context for the submitter"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowNote(false);
                    requestAnimationFrame(() => noteToggle.current?.focus());
                  }
                }}
              />
              <button
                className="cp-note-toggle"
                aria-label="Close note"
                onClick={() => {
                  setShowNote(false);
                  requestAnimationFrame(() => noteToggle.current?.focus());
                }}
              >
                <FiX />
              </button>
            </div>
          ) : (
            <button
              ref={noteToggle}
              className="cp-note-toggle"
              aria-expanded={false}
              onClick={() => setShowNote(true)}
            >
              {note ? 'Edit note' : 'Add note'}
            </button>
          )}
        </div>
        <div className="cp-decision-buttons">
          <button
            className="cp-button primary"
            disabled={busy || accepted > 0}
            title={
              accepted > 0
                ? 'Dismiss or resolve accepted findings, or request changes from More decision options.'
                : undefined
            }
            onClick={() =>
              needsApprovalConfirmation(open, evidenceNotice)
                ? setConfirmation('approved')
                : void submit('approved')
            }
          >
            <FiCheck />
            {busy ? 'Saving…' : 'Approve'}
          </button>
          <div className="cp-decision-overflow">
            <button
              ref={menuTrigger}
              type="button"
              className="cp-icon"
              aria-label="More decision options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <FiMoreHorizontal />
            </button>
            <Popover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              anchor={menuTrigger}
              className="cp-decision-menu cp-review"
              label="Decision options"
              placement="top-end"
              closeOnSelect
            >
              <button
                className="cp-button"
                disabled={busy || (accepted === 0 && !note.trim())}
                title={
                  accepted === 0 && !note.trim()
                    ? 'Accept a finding or add a decision note first.'
                    : undefined
                }
                onClick={() => void submit('changes_requested')}
              >
                Request changes{accepted > 0 ? ` (${accepted})` : ''}
              </button>
              <button
                className="cp-button"
                disabled={busy}
                onClick={() => setConfirmation('rejected')}
              >
                Reject submission
              </button>
            </Popover>
          </div>
        </div>
      </div>
      <Modal
        open={!!confirmation}
        onClose={() => setConfirmation(undefined)}
        busy={busy}
        className="cp-dialog cp-review"
        labelledBy="decision-confirm-title"
      >
        <header>
          <h2 id="decision-confirm-title">
            {confirmation === 'approved'
              ? requiredOpen > 0
                ? `Approve with ${requiredOpen} required ${requiredOpen === 1 ? 'finding' : 'findings'} not reviewed?`
                : evidenceNotice
                  ? 'Approve with incomplete evidence?'
                  : 'Approve this submission?'
              : 'Reject this submission?'}
          </h2>
          <button
            className="cp-icon"
            aria-label="Close"
            disabled={busy}
            onClick={() => setConfirmation(undefined)}
          >
            <FiX />
          </button>
        </header>
        <p>
          {confirmation === 'approved'
            ? [
                evidenceNotice,
                open > 0
                  ? `${open} ${open === 1 ? 'finding not triaged will be' : 'findings not triaged will be'} marked not raised.`
                  : undefined,
              ]
                .filter(Boolean)
                .join(' ')
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
          <button className="cp-button" disabled={busy} onClick={() => setConfirmation(undefined)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
