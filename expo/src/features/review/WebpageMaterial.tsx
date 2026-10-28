import { useLayoutEffect, useRef } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import type { Asset, Finding } from './model';
import { dateTime } from './model';
import { revealMaterialHighlight } from './materialScroll';
import './webpage.css';

export function WebpageMaterial({
  asset,
  url,
  selected,
  findings,
  onSelect,
  onError,
  onLoad,
}: {
  asset: Asset & { kind: 'webpage' };
  url: string;
  selected?: Finding;
  findings: Finding[];
  onSelect: (finding: Finding) => void;
  onError: () => void;
  onLoad: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const region = selected?.location?.region;
  const scrollToRegion = () => {
    if (!region || !frame.current || !image.current) return;
    const top = region.y * image.current.clientHeight;
    frame.current.scrollTop = Math.max(0, top - frame.current.clientHeight * 0.25);
    revealMaterialHighlight(image.current.querySelector('.cp-image-region.selected'));
  };
  useLayoutEffect(() => {
    if (!region || !frame.current || !image.current) return;
    const container = frame.current,
      picture = image.current;
    const scroll = () => {
      container.scrollTop = Math.max(
        0,
        region.y * picture.clientHeight - container.clientHeight * 0.25,
      );
      revealMaterialHighlight(picture.querySelector('.cp-image-region.selected'));
    };
    scroll();
    const observer = new ResizeObserver(scroll);
    observer.observe(picture);
    observer.observe(container);
    return () => observer.disconnect();
  }, [region]);
  return (
    <div className="cp-webpage">
      <div className="cp-webpage-source">
        <div>
          <span title={asset.content.sourceUrl}>{asset.content.sourceUrl}</span>
          <span>Captured {dateTime(asset.content.capturedAt ?? asset._creationTime)}</span>
        </div>
        <a
          className="cp-button quiet"
          href={asset.content.finalUrl ?? asset.content.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open live page <FiExternalLink />
        </a>
      </div>
      {asset.content.heightTruncated && (
        <p className="cp-small">Capture ends at 12,000 pixels. Content below is not included.</p>
      )}
      <div
        className="cp-webpage-frame"
        ref={frame}
        tabIndex={0}
        role="region"
        aria-label="Captured web page"
      >
        <div
          className="cp-image-wrap"
          ref={image}
          style={{ width: asset.content.size?.width ?? 1440 }}
        >
          <img
            src={url}
            alt={`Captured page: ${asset.name}`}
            onError={onError}
            onLoad={() => {
              onLoad();
              scrollToRegion();
            }}
          />
          {findings.map((finding) => {
            const box = finding.location?.region;
            return box ? (
              <button
                key={finding._id}
                type="button"
                className={`cp-image-region ${finding.severity} ${selected?._id === finding._id ? 'selected' : ''}`}
                title={finding.title}
                aria-label={`Select finding: ${finding.title}`}
                aria-pressed={selected?._id === finding._id}
                onClick={() => onSelect(finding)}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
              />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
