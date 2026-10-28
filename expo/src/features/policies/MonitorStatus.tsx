import { useEffect, useState } from 'react';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@clearpath/backend/convex/_generated/api';
function duration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes < 60
    ? `${minutes} minute${minutes === 1 ? '' : 's'}`
    : minutes < 1440
      ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? '' : 's'}`
      : `${Math.round(minutes / 1440)} days`;
}
export function MonitorStatus({
  run,
  total,
  failing,
  onSources,
}: {
  run: FunctionReturnType<typeof api.policy.monitorState.latest> | undefined;
  total: number;
  failing: number;
  onSources: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  const stale = !!run && (!run.completedAt || now - run.completedAt > 26 * 3600000);
  const elapsed = run?.completedAt ? now - run.completedAt : null;
  return (
    <p className={`cp-monitor-line cp-small${stale ? ' is-overdue' : ''}`} role="status">
      <span>
        {run?.last?.status === 'running'
          ? 'Checking sources…'
          : elapsed === null
            ? 'Sources not checked yet'
            : elapsed < 60000
              ? 'Sources checked just now'
              : `Sources checked ${duration(elapsed)} ago`}
      </span>
      <span>· next check in {duration(next.getTime() - now)}</span>
      <span>· {total} sources</span>
      {failing > 0 && (
        <>
          <span>·</span>
          <button className="cp-inline-link" onClick={onSources}>
            {failing} failing
          </button>
        </>
      )}
      {stale && (
        <span>
          · {run.completedAt ? 'Monitoring overdue (over 26 hours)' : 'First check pending'}
        </span>
      )}
    </p>
  );
}
