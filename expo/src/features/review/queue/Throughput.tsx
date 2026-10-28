import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { FiInbox, FiClock, FiCheckCircle } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { elapsed } from './model';

const HOUR = 60 * 60 * 1000;

function useReportingTime() {
  const [asOf, setAsOf] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  useEffect(() => {
    function refresh() {
      const now = Date.now();
      setAsOf(Math.floor(now / HOUR) * HOUR);
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, HOUR - (now % HOUR));
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh();
    }
    // Refresh after mount too, in case the hour changed between render and the effect.
    let timer = window.setTimeout(refresh, 0);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  return asOf;
}

export function Throughput() {
  const asOf = useReportingTime();
  const stats = useQuery(api.reviews.stats, { asOf });
  return (
    <section className="q-throughput" aria-label="Workspace throughput">
      <div className="q-stat">
        <span>
          <FiInbox />
          Needs review now
        </span>
        <strong>{stats?.needsReview ?? '—'}</strong>
        <small>Ready for your decision</small>
      </div>
      <div
        className="q-stat"
        title="Median elapsed time from submission to the first decision, for first decisions made in the last 30 days."
      >
        <span>
          <FiClock />
          Time to first decision
        </span>
        <strong>
          {stats?.medianFirstDecisionMs == null ? '—' : elapsed(stats.medianFirstDecisionMs)}
        </strong>
        <small>Median · last 30 days</small>
      </div>
      <div
        className="q-stat"
        title="All decisions recorded since Monday at 00:00 UTC, including decisions on revised submissions."
      >
        <span>
          <FiCheckCircle />
          Decided this week
        </span>
        <strong>{stats?.decidedThisWeek ?? '—'}</strong>
        <small>Since Monday · UTC</small>
      </div>
      {stats && !stats.complete && (
        <span className="q-stat-limit">Some metrics exceed the reporting limit.</span>
      )}
    </section>
  );
}
