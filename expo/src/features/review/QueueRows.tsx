import { useEffect, useState } from 'react';
import type { QueueReview } from './queue/model';
import { QueueItem } from './queue/QueueItem';

export function QueueRows({ rows }: { rows: QueueReview[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="q-page cp-campaign-rows">
      <div className="q-list-table">
        <div className="q-list-head">
          <span>Submission</span>
          <span>Findings</span>
          <span>Status & timing</span>
        </div>
        {rows.map((review) => (
          <QueueItem key={review._id} review={review} now={now} />
        ))}
      </div>
    </div>
  );
}
