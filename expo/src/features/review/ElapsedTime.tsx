import { useEffect, useState } from 'react';
import './loading.css';

export function ElapsedTime({ startedAt }: { startedAt?: number }) {
  const [mountedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - (startedAt ?? mountedAt)) / 1000));
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return (
    <span className="cp-elapsed" aria-label={`Elapsed time ${time}`}>
      {time}
    </span>
  );
}
