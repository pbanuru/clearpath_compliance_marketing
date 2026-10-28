import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '@/features/assets/media';
import { severities, type Finding, type Policy, type Asset } from './model';

export function FindingEditor({
  finding,
  reviewId,
  asset,
  seconds,
  policies,
  onClose,
}: {
  finding?: Finding;
  reviewId: Id<'reviews'>;
  asset?: Asset;
  seconds: number;
  policies: Policy[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const edit = useMutation(api.findings.edit),
    add = useMutation(api.findings.add);
  const [severity, setSeverity] = useState<Finding['severity']>(finding?.severity ?? 'required');
  const [policyId, setPolicy] = useState(finding?.policyId ?? 'other');
  const [title, setTitle] = useState(finding?.title ?? '');
  const [explanation, setExplanation] = useState(finding?.explanation ?? '');
  const [fix, setFix] = useState(finding?.suggestedFix ?? '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="cp-dialog cp-review"
      onClose={onClose}
      aria-labelledby="finding-editor-title"
    >
      <header>
        <h2 id="finding-editor-title">{finding ? 'Edit finding' : 'Add finding'}</h2>
        <button className="cp-icon" onClick={onClose} aria-label="Close finding editor">
          <FiX />
        </button>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const fields = { severity, title, explanation, suggestedFix: fix || undefined };
            if (finding) await edit({ findingId: finding._id, ...fields });
            else
              await add({
                ...fields,
                reviewId,
                policyId,
                location: asset
                  ? {
                      assetId: asset._id,
                      ...(asset.kind === 'video' || asset.kind === 'audio'
                        ? { startSeconds: seconds }
                        : {}),
                    }
                  : undefined,
              });
            onClose();
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to save finding.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Severity
          <select
            value={severity}
            onChange={(e) => {
              const next = (['required', 'recommended', 'needs_context'] as const).find(
                (key) => key === e.target.value,
              );
              if (next) setSeverity(next);
            }}
          >
            {(['required', 'recommended', 'needs_context'] as const).map((key) => (
              <option key={key} value={key}>
                {severities[key]}
              </option>
            ))}
          </select>
        </label>
        {!finding && (
          <label>
            Rule
            <select value={policyId} onChange={(e) => setPolicy(e.target.value)}>
              <option value="other">Reviewer judgment</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Explanation
          <textarea
            required
            rows={3}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </label>
        <label>
          Suggested fix
          <textarea rows={3} value={fix} onChange={(e) => setFix(e.target.value)} />
        </label>
        {!finding && asset && (
          <p className="cp-small">
            Attached to {asset.name}
            {asset.kind === 'audio' || asset.kind === 'video' ? ` at ${seconds}s` : ''}. New
            findings start accepted.
          </p>
        )}
        {error && (
          <p className="cp-error" role="alert">
            {error}
          </p>
        )}
        <div className="cp-actions">
          <button
            className="cp-button primary"
            disabled={busy || !title.trim() || !explanation.trim()}
          >
            {busy ? 'Saving…' : 'Save finding'}
          </button>
          <button className="cp-button quiet" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
