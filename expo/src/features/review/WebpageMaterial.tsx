import { useLayoutEffect, useRef } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import type { Asset, Finding } from './model';
import { dateTime } from './model';
import './webpage.css';

export function WebpageMaterial({
  asset,
  url,
  selected,
  onError,
  onLoad,
}: {
  asset: Asset & { kind: 'webpage' };
  url: string;
  selected?: Finding;
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
          <strong>{asset.content.title || asset.name}</strong>
          <span>{asset.content.sourceUrl}</span>
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
          {region && (
            <div
              className="cp-image-region"
              aria-label="Selected finding page region"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
            >
              <span>Selected issue</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
