import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import type { Policy } from '../review/model';
import { errorMessage } from '@/features/assets/media';
import { PolicyDialog } from './PolicyDialog';
export function PolicyEditor({
  policy,
  update,
  close,
}: {
  policy?: Policy;
  update?: Doc<'policyUpdates'>;
  close: () => void;
}) {
  const edit = useMutation(api.policies.edit),
    apply = useMutation(api.policies.apply);
  const count = useQuery(
    api.policies.preview,
    update ? { updateId: update._id } : { key: policy?.key },
  );
  const [check, setCheck] = useState(update?.proposedCheck ?? policy?.check ?? ''),
    [expectedVersion] = useState(policy?.currentVersion ?? 0),
    [summary, setSummary] = useState(update?.aiSummary ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const stale = (policy?.currentVersion ?? 0) !== expectedVersion;
  return (
    <PolicyDialog
      title={update ? 'Apply policy update' : 'Edit ClearPath rule'}
      close={close}
      busy={busy}
    >
      <p className="cp-small">
        {policy?.title ?? update?.title} ·{' '}
        {policy ? `v${expectedVersion} → v${expectedVersion + 1}` : 'New rule · v1'}
      </p>
      {stale && (
        <p className="cp-error" role="alert">
          This policy changed while the editor was open. Close and reopen it to review the latest
          version.
        </p>
      )}
      {update?.triageError && (
        <p className="cp-error">
          Not triaged. Read the source and write the check before applying.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (update)
              await apply({
                updateId: update._id,
                check,
                expectedVersion,
              });
            else if (policy)
              await edit({
                key: policy.key,
                expectedVersion,
                check,
                changeSummary: summary,
              });
            close();
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to apply the rule.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          What to check
          <textarea
            aria-label="What to check"
            value={check}
            onChange={(e) => setCheck(e.target.value)}
            rows={8}
            maxLength={12000}
            required
          />
        </label>
        {!update && (
          <label>
            What changed
            <textarea
              aria-label="What changed"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              maxLength={2000}
              required
            />
          </label>
        )}
        {update && <p>{update.aiSummary}</p>}
        <div className="cp-policy-impact" role="status">
          <strong>
            {count === undefined
              ? 'Counting approved material…'
              : `${count} approved submission${count === 1 ? '' : 's'} will be rechecked`}
          </strong>
          <p className="cp-small">
            Matches this rule’s products and channels. Includes Live and Unknown usage. Earlier
            decisions stay in history.
          </p>
        </div>
        {error && (
          <p className="cp-error" role="alert">
            {error}
          </p>
        )}
        <div className="cp-actions">
          <button
            className="cp-button primary"
            disabled={
              stale ||
              busy ||
              count === undefined ||
              !check.trim() ||
              (update ? false : !summary.trim())
            }
          >
            {busy ? 'Applying…' : `Apply${count ? ` and recheck ${count}` : ''}`}
          </button>
          <button type="button" className="cp-button" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </PolicyDialog>
  );
}
