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
  const image = useRef<HTMLDivElement>(null);
  // A box click reveals its card; image observers must not pull the pane back.
  const selectedFromImage = useRef<Finding['_id']>(undefined);
  const selectedId = selected?._id;
  const region = selected?.location?.region;
  const scrollToRegion = () => {
    if (selectedFromImage.current === selectedId) return;
    revealMaterialHighlight(image.current?.querySelector('.cp-image-region.selected'));
  };
  useLayoutEffect(() => {
    if (selectedFromImage.current !== selectedId) selectedFromImage.current = undefined;
    if (!region || !image.current) return;
    const picture = image.current;
    const scroll = () => {
      if (selectedFromImage.current === selectedId) return;
      revealMaterialHighlight(picture.querySelector('.cp-image-region.selected'));
    };
    scroll();
    const observer = new ResizeObserver(scroll);
    observer.observe(picture);
    return () => observer.disconnect();
  }, [region, selectedId]);
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
      <div className="cp-webpage-frame" role="region" aria-label="Captured web page">
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
                onClick={() => {
                  selectedFromImage.current = finding._id;
                  onSelect(finding);
                }}
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
