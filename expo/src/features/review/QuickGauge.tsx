import type { CSSProperties } from 'react';
import './quick-check.css';

// Right always means clearer. Nine fixed scale colors; only the marker is bright.
const colors = [
  '#b83238',
  '#c44840',
  '#d4664d',
  '#bf7b2b',
  '#b98c23',
  '#a79b31',
  '#649856',
  '#368765',
  '#187951',
];
export function QuickGauge({
  value,
  label,
  mini = false,
}: {
  value: number;
  label: string;
  mini?: boolean;
}) {
  const reading = Math.max(0, Math.min(1, value));
  const index = Math.min(8, Math.floor(reading * 9));
  const style: CSSProperties & { '--gauge-index': number; '--gauge-color': string | undefined } = {
    '--gauge-index': index,
    '--gauge-color': colors[index],
  };
  return (
    <span
      className={`cp-quick-gauge${mini ? ' mini' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(reading * 100)}
      aria-valuetext={label}
      style={style}
    >
      {colors.map((color) => (
        <span key={color} style={{ backgroundColor: color }} aria-hidden="true" />
      ))}
      <i className="cp-quick-marker" aria-hidden="true" />
    </span>
  );
}
