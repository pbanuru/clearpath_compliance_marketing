import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '@/features/assets/media';
import './policies.css';
import './monitoring.css';
export function Usage({ review }: { review: Doc<'reviews'> }) {
  const setUsage = useMutation(api.policy.rechecks.setUsage),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <label className="cp-usage">
        In use:
        <select
          aria-label="In use"
          value={review.usage ?? 'unknown'}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            try {
              await setUsage({
                reviewId: review._id,
                usage:
                  e.target.value === 'live'
                    ? 'live'
                    : e.target.value === 'retired'
                      ? 'retired'
                      : 'unknown',
              });
            } catch (cause) {
              setError(errorMessage(cause, 'Unable to update usage.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="unknown">Unknown</option>
          <option value="live">Live</option>
          <option value="retired">Retired</option>
        </select>
      </label>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
