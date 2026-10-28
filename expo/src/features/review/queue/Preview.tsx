import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from 'convex/react';
import { FiFileText, FiHeadphones, FiPlay, FiGlobe, FiImage } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { QueueReview } from './model';

function Material({
  review,
  url,
  large = false,
}: {
  review: QueueReview;
  url?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { kind, text, name, pageCount } = review.cover;
  if (url && !failed)
    return (
      <>
        <img src={url} alt={large ? name : ''} loading="lazy" onError={() => setFailed(true)} />
        {kind === 'video' && (
          <span className="q-preview-play">
            <FiPlay />
          </span>
        )}
      </>
    );
  if (kind === 'text')
    return (
      <div className="q-excerpt">
        <span>TEXT</span>
        <p>{text || name}</p>
      </div>
    );
  if (kind === 'document')
    return (
      <div className="q-document">
        <div className="q-paper">
          <FiFileText />
          <i />
          <i />
          <i />
        </div>
        <strong>{name}</strong>
        <span>
          {pageCount
            ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · PDF`
            : 'PDF · Page count unavailable'}
        </span>
      </div>
    );
  const Icon = kind === 'audio' ? FiHeadphones : kind === 'webpage' ? FiGlobe : FiImage;
  return (
    <div className="q-media-fallback">
      <Icon />
      <span>{name}</span>
    </div>
  );
}
export function Preview({ review }: { review: QueueReview }) {
  const visual = ['image', 'video', 'webpage'].includes(review.cover.kind);
  const [accessVersion, setAccessVersion] = useState(0);
  const urls = useQuery(
    api.assets.access,
    visual ? { assetId: review.coverAssetId, accessVersion } : 'skip',
  );
  const url = review.cover.kind === 'video' ? urls?.poster : urls?.original;
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!visual) return;
    const refresh = setInterval(() => setAccessVersion((v) => v + 1), 12 * 60000);
    return () => clearInterval(refresh);
  }, [visual]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setPosition(null);
  }
  return (
    <span
      ref={host}
      className={`q-preview q-preview-${review.cover.kind}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse' || !window.matchMedia('(min-width: 701px)').matches) return;
        timer.current = setTimeout(() => {
          const rect = host.current?.getBoundingClientRect();
          if (rect)
            setPosition({
              left: Math.min(rect.right + 16, window.innerWidth - 352),
              top: Math.max(12, Math.min(rect.top - 30, window.innerHeight - 350)),
            });
        }, 280);
      }}
      onPointerLeave={hide}
      onClick={hide}
    >
      <Material key={url} review={review} url={url} />
      {position &&
        createPortal(
          <aside
            className="q-preview-popover"
            style={position}
            aria-label={`Preview of ${review.title}`}
          >
            <div className={`q-preview-large q-preview-${review.cover.kind}`}>
              <Material key={url} review={review} url={url} large />
            </div>
            <div className="q-preview-caption">
              <strong>{review.title}</strong>
              <span>{review.cover.name}</span>
            </div>
          </aside>,
          document.body,
        )}
    </span>
  );
}
