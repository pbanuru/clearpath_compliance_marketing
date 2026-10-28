import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import type { ReviewDetail, Policy } from '../review/model';
import { PolicyHistory } from './PolicyHistory';
function day(value: number | undefined) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'earlier';
}
function RuleDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const old = oldText.split(' '),
    next = newText.split(' ');
  let start = 0,
    end = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) start++;
  while (
    end < old.length - start &&
    end < next.length - start &&
    old[old.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  const before = old.slice(Math.max(0, start - 8), start).join(' '),
    removed = old.slice(start, old.length - end).join(' '),
    added = next.slice(start, next.length - end).join(' '),
    after = next.slice(next.length - end, next.length - end + 8).join(' ');
  return (
    <p className="cp-rule-diff" aria-label="Rule change">
      {start > 8 ? '… ' : ''}
      {before} {removed && <del>{removed}</del>} {added && <ins>{added}</ins>} {after}
    </p>
  );
}
export function RecheckBanner({
  data,
  policies,
  onDecision,
}: {
  data: ReviewDetail;
  policies: Policy[];
  onDecision: () => void;
}) {
  const { review } = data,
    retry = useMutation(api.policy.recheckState.retry),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [history, setHistory] = useState(false);
  if (!review.recheck && !review.recheckFailed && !review.pendingRechecks) return null;
  const r = review.recheck,
    rule = policies.find((p) => p.key === r?.key),
    approval = [...data.decisions]
      .reverse()
      .find(
        (d) => d.outcome === 'approved' && (!r?.materialVersion || d.version === r.materialVersion),
      );
  return (
    <div className="cp-recheck-banner" role="status">
      {r && (
        <>
          <strong>No longer approved</strong>
          <p>
            Approved {day(r.approvedAt ?? approval?.decidedAt)} under {r.title} v{r.fromVersion} ·
            rule changed to v{r.toVersion} {day(r.changedAt)} · {r.newFindings ?? 1} new finding
            {r.newFindings === 1 ? '' : 's'}
          </p>
          <p>{r.changeSummary}</p>
          {r.oldCheck && r.newCheck && <RuleDiff oldText={r.oldCheck} newText={r.newCheck} />}
          <div className="cp-actions">
            {rule && (
              <button className="cp-inline-link" onClick={() => setHistory(true)}>
                Rule v{r.toVersion}
              </button>
            )}
            {approval && (
              <a href={`#decision-${approval._id}`} onClick={onDecision}>
                Original approval
              </a>
            )}
          </div>
        </>
      )}
      {!!review.pendingRechecks && (
        <p>
          Rechecking {review.pendingRechecks} changed rule{review.pendingRechecks === 1 ? '' : 's'}…
        </p>
      )}
      {review.recheckFailed && (
        <>
          <strong>Recheck failed</strong>
          <p>The changed rule has not been cleared for this material.</p>
          <button
            className="cp-button"
            disabled={busy || !!review.pendingRechecks}
            onClick={async () => {
              setBusy(true);
              try {
                await retry({ reviewId: review._id });
              } catch (cause) {
                setError(errorMessage(cause, 'Unable to retry.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Retrying…' : 'Retry recheck'}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {history && rule && <PolicyHistory policy={rule} close={() => setHistory(false)} />}
    </div>
  );
}
