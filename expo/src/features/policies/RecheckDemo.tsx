import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Policy } from '../review/model';
import { errorMessage } from '@/features/assets/media';
export function RecheckDemo({ policy }: { policy: Policy }) {
  const apply = useMutation(api.policy.demo.applyExample),
    count = useQuery(api.policies.preview, { key: policy.key });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const applied = policy.check.includes(
    'When an ad shows a representative payment example, it must also show the total amount repaid over the loan term.',
  );
  return (
    <aside className="cp-demo-card">
      <strong>See how rechecks work</strong>
      <p>
        Example update to ClearPath’s own standard: payment examples must also show the total amount
        repaid.
      </p>
      {applied ? (
        <span className="cp-small">Example standard update applied · v{policy.currentVersion}</span>
      ) : (
        <>
          <p className="cp-small">
            {count === undefined
              ? 'Counting approved material…'
              : `${count} approved submission${count === 1 ? '' : 's'} will be rechecked. Earlier approvals stay in history.`}
          </p>
          <button
            className="cp-button"
            disabled={busy || count === undefined}
            onClick={async () => {
              setBusy(true);
              try {
                await apply({ expectedVersion: policy.currentVersion });
              } catch (cause) {
                setError(errorMessage(cause, 'Unable to apply the example update.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Applying…' : 'Apply an example standard update'}
          </button>
        </>
      )}
      {error && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
