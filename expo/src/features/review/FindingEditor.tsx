import { useState } from 'react';
import { useMutation } from 'convex/react';
import { FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '@/features/assets/media';
import { Modal } from '@/components/overlays/Modal';
import { severities, type Finding, type Policy, type Asset } from './model';
import { findingPolicyReferences } from './findingPolicyReferences';

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
  const edit = useMutation(api.findings.edit),
    add = useMutation(api.findings.add);
  const [anchorSeconds] = useState(seconds);
  const [severity, setSeverity] = useState<Finding['severity']>(finding?.severity ?? 'required');
  const [initialReferences] = useState(() =>
    finding ? findingPolicyReferences(finding).map((reference) => reference.key) : [],
  );
  const [referenceIds, setReferences] = useState(initialReferences);
  const keys = referenceIds.filter(Boolean);
  const referencesChanged =
    keys.length !== initialReferences.length ||
    keys.some((key, index) => key !== initialReferences[index]);
  const referenceFields = { policyId: keys[0] ?? 'other', additionalPolicyIds: keys.slice(1) };
  const [title, setTitle] = useState(finding?.title ?? '');
  const [explanation, setExplanation] = useState(finding?.explanation ?? '');
  const [fix, setFix] = useState(finding?.suggestedFix ?? '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      className="cp-dialog cp-review"
      labelledBy="finding-editor-title"
    >
      <header>
        <h2 id="finding-editor-title">{finding ? 'Edit finding' : 'Add finding'}</h2>
        <button
          className="cp-icon"
          disabled={busy}
          onClick={onClose}
          aria-label="Close finding editor"
        >
          <FiX />
        </button>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const fields = { severity, title, explanation };
            if (finding)
              await edit({
                findingId: finding._id,
                ...fields,
                ...(referencesChanged ? referenceFields : {}),
                suggestedFix: fix.trim() ? fix : null,
              });
            else
              await add({
                ...fields,
                suggestedFix: fix.trim() ? fix : undefined,
                reviewId,
                ...referenceFields,
                location: asset
                  ? {
                      assetId: asset._id,
                      ...(asset.kind === 'video' || asset.kind === 'audio'
                        ? { startSeconds: anchorSeconds }
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
        <fieldset
          style={{ display: 'grid', gap: 8, minWidth: 0, border: 0, padding: 0, margin: 0 }}
        >
          <legend className="cp-field-label">Rules</legend>
          {!referenceIds.length && <span className="cp-small">Reviewer judgment</span>}
          {referenceIds.map((key, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <select
                aria-label={`Rule reference ${index + 1}`}
                required
                value={key}
                autoFocus={!key}
                onChange={(event) =>
                  setReferences(
                    referenceIds.map((value, at) => (at === index ? event.target.value : value)),
                  )
                }
              >
                <option value="" disabled>
                  Choose a rule
                </option>
                {key && !policies.some((policy) => policy.id === key) && (
                  <option value={key}>Saved rule</option>
                )}
                {policies.map((policy) => (
                  <option
                    key={policy.id}
                    value={policy.id}
                    disabled={policy.id !== key && keys.includes(policy.id)}
                  >
                    {policy.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="cp-icon"
                aria-label={`Remove rule reference ${index + 1}`}
                onClick={() => setReferences(referenceIds.filter((_, at) => at !== index))}
              >
                <FiX />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="cp-button quiet"
            style={{ justifySelf: 'start' }}
            disabled={
              referenceIds.some((key) => !key) ||
              !policies.some((policy) => !keys.includes(policy.id))
            }
            onClick={() => setReferences([...referenceIds, ''])}
          >
            Add reference
          </button>
        </fieldset>
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
            {asset.kind === 'audio' || asset.kind === 'video' ? ` at ${anchorSeconds}s` : ''}.
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
          <button className="cp-button quiet" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
