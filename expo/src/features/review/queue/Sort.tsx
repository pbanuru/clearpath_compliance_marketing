import { useState } from 'react';
import { FiArrowDown, FiChevronDown } from 'react-icons/fi';
import { queueCompare } from '@clearpath/backend/convex/review/queueOrder';
import type { QueueReview } from './model';

type SortOrder = 'go_live' | 'waiting' | 'custom';

export function compareQueue(
  a: QueueReview,
  b: QueueReview,
  sort: SortOrder,
  customBase: 'go_live' | 'waiting',
) {
  if (sort === 'waiting') return a.waitingSince - b.waitingSince;
  if (sort === 'custom' && a.status === 'in_review') return queueCompare(a, b, customBase);
  return queueCompare({ ...a, pinnedRank: undefined }, { ...b, pinnedRank: undefined });
}

export function useQueueSort(reviews: QueueReview[]) {
  const [choice, setSort] = useState<SortOrder | null>(null);
  const hasPins = reviews.some((r) => r.status === 'in_review' && r.pinnedRank !== undefined);
  const sort: SortOrder =
    choice === 'custom' || choice === null ? (hasPins ? 'custom' : 'go_live') : choice;
  const customBase: 'go_live' | 'waiting' =
    reviews.find((r) => r.status === 'in_review' && r.pinnedRank !== undefined)?.pinnedSort ??
    'go_live';
  return { sort, setSort, hasPins, customBase };
}

export function Sort({
  value,
  hasPins,
  onChange,
  onReset,
}: {
  value: SortOrder;
  hasPins: boolean;
  onChange: (value: SortOrder) => void;
  onReset: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="q-sort">
      <FiArrowDown />
      <select
        aria-label="Sort submissions"
        value={value}
        disabled={busy}
        onChange={async (event) => {
          const next = event.target.value;
          if (next === 'reset') {
            setBusy(true);
            try {
              await onReset();
            } finally {
              setBusy(false);
            }
          } else if (next === 'go_live' || next === 'waiting' || next === 'custom') {
            onChange(next);
          }
        }}
      >
        <option value="go_live">Go-live date</option>
        <option value="waiting">Longest waiting</option>
        {hasPins && <option value="custom">Your order</option>}
        {hasPins && <option value="reset">Reset to Go-live date</option>}
      </select>
      <FiChevronDown />
    </label>
  );
}
