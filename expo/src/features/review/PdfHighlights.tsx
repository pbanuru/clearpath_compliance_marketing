import { useEffect, useMemo, useRef } from 'react';
import type { TextLayer } from 'pdfjs-dist';
import type { Finding } from './model';
import { pdfQuoteRanges } from './pdfQuote';
import { revealMaterialHighlight } from './materialScroll';

export function PdfHighlights({
  layer,
  page,
  finding,
  findings,
  onSelect,
}: {
  layer: TextLayer;
  page: HTMLDivElement;
  finding?: Finding;
  findings: Finding[];
  onSelect?: (finding: Finding) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const quote = finding?.location?.quote;
  const boxes = useMemo(() => {
    if (!quote) return [];
    const frame = page.getBoundingClientRect();
    return pdfQuoteRanges(layer.textContentItemsStr, quote).flatMap((match) => {
      const node = layer.textDivs[match.run]?.firstChild;
      if (!node) return [];
      const range = document.createRange();
      range.setStart(node, match.start);
      range.setEnd(node, match.end);
      return Array.from(range.getClientRects(), (rect) => ({
        x: (rect.left - frame.left) / frame.width,
        y: (rect.top - frame.top) / frame.height,
        width: rect.width / frame.width,
        height: rect.height / frame.height,
      }));
    });
  }, [layer, page, quote]);
  useEffect(() => {
    if (!finding) return;
    const target = root.current?.querySelector('.selected') ?? page;
    revealMaterialHighlight(target);
    // Mobile uses the document scroller, as it does for long webpage captures.
    if (!window.matchMedia('(min-width: 1024px)').matches)
      target.scrollIntoView({ block: 'nearest' });
  }, [finding, boxes, page]);
  return (
    <div ref={root} className="cp-pdf-highlights">
      {boxes.map((box, index) => (
        <span
          key={index}
          className={`cp-image-region selected ${finding?.severity ?? 'required'} cp-pdf-word`}
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      ))}
      {findings.map((entry) => {
        const box = entry.location?.region;
        return box ? (
          <button
            type="button"
            key={entry._id}
            className={`cp-image-region cp-pdf-region ${entry.severity} ${entry._id === finding?._id ? 'selected' : ''}`}
            title={entry.title}
            aria-label={`Select finding: ${entry.title}`}
            aria-pressed={entry._id === finding?._id}
            onClick={() => onSelect?.(entry)}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        ) : null;
      })}
      {quote && boxes.length === 0 && (
        <p className="cp-pdf-note" role="status" data-quote-found="false">
          Quote not located on this page. Review the marked page.
        </p>
      )}
    </div>
  );
}
