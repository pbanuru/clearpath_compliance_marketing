import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiFileText, FiHeadphones, FiPlay, FiGlobe, FiImage } from 'react-icons/fi';
import { useAssetAccess } from '@/features/assets/useAssetAccess';
import type { QueueReview } from './model';

function Material({
  review,
  url,
  large = false,
  onError,
  onLoad,
}: {
  review: QueueReview;
  url?: string | null;
  large?: boolean;
  onError: () => void;
  onLoad: () => void;
}) {
  const { kind, text, name } = review.cover;
  if (url)
    return (
      <>
        <img src={url} alt={large ? name : ''} loading="lazy" onError={onError} onLoad={onLoad} />
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
        <span>PDF</span>
      </div>
    );
  const Icon =
    kind === 'video'
      ? FiPlay
      : kind === 'audio'
        ? FiHeadphones
        : kind === 'webpage'
          ? FiGlobe
          : FiImage;
  return (
    <div className="q-media-fallback">
      <Icon />
      <span>{name}</span>
    </div>
  );
}
export function Preview({ review }: { review: QueueReview }) {
  const visual = ['image', 'video', 'webpage'].includes(review.cover.kind);
  const access = useAssetAccess(visual ? review.coverAssetId : undefined);
  const url = access.failed
    ? undefined
    : review.cover.kind === 'video'
      ? access.urls?.poster
      : access.urls?.original;
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const host = useRef<HTMLSpanElement>(null);
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
      <Material
        key={url}
        review={review}
        url={url}
        onError={() => access.retry('image')}
        onLoad={() => access.loaded('image')}
      />
      {position &&
        createPortal(
          <aside
            className="q-preview-popover"
            style={position}
            aria-label={`Preview of ${review.title}`}
          >
            <div className={`q-preview-large q-preview-${review.cover.kind}`}>
              <Material
                key={url}
                review={review}
                url={url}
                large
                onError={() => access.retry('image')}
                onLoad={() => access.loaded('image')}
              />
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
