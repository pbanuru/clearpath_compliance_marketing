import { useEffect, useRef } from 'react';
import type { Finding } from './model';

type Range = { start: number; end: number; finding: Finding };
export function TextMaterial({
  text,
  findings,
  selected,
  onSelect,
}: {
  text: string;
  findings: Finding[];
  selected?: Finding;
  onSelect?: (finding: Finding) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    container.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected?._id]);
  const ranges: Range[] = [];
  const ordered = [...findings].sort(
    (a, b) => Number(b._id === selected?._id) - Number(a._id === selected?._id),
  );
  for (const finding of ordered) {
    const quote = finding.location?.quote;
    if (!quote || !finding.quoteFound) continue;
    let start = text.indexOf(quote);
    while (start >= 0) {
      const end = start + quote.length;
      if (!ranges.some((r) => start < r.end && end > r.start)) ranges.push({ start, end, finding });
      start = text.indexOf(quote, end);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let cursor = 0;
  const parts = ranges.map((range) => {
    const prefix = text.slice(cursor, range.start);
    cursor = range.end;
    return (
      <span key={`${range.finding._id}-${range.start}`}>
        {prefix}
        <mark
          data-selected={selected?._id === range.finding._id}
          className={`${range.finding.severity} ${selected?._id === range.finding._id ? 'selected' : ''}`}
        >
          <button
            type="button"
            onClick={() => onSelect?.(range.finding)}
            title={range.finding.title}
          >
            {text.slice(range.start, range.end)}
          </button>
        </mark>
      </span>
    );
  });
  return (
    <div ref={container} className="cp-text-material">
      {parts}
      {text.slice(cursor)}
    </div>
  );
}
