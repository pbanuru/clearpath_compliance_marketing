import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { FiFile, FiFileText, FiHeadphones, FiPlay, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { formatBytes } from './media';
import './preview.css';

export function AssetCard({ asset }: { asset: Doc<'assets'> }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [accessVersion, setAccessVersion] = useState(() => Date.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLMediaElement | null>(null);
  const playing = useRef(false);
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const retrying = useRef({ image: false, poster: false, media: false });
  const requestedVersion = useRef(accessVersion);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const urls = useQuery(
    api.assets.access,
    asset.kind === 'image' || asset.kind === 'video' || open
      ? { assetId: asset._id, accessVersion }
      : 'skip',
  );
  function refreshAccess() {
    // A query argument change temporarily removes the player while URLs load.
    if (player.current && !resume.current) {
      resume.current = { time: player.current.currentTime, playing: playing.current };
    }
    const version = Math.max(Date.now(), requestedVersion.current + 1);
    requestedVersion.current = version;
    setAccessVersion(version);
  }
  function retry(kind: 'image' | 'poster' | 'media') {
    // Ignore events from the old source while its replacement is being requested.
    if (requestedVersion.current !== accessVersion) return;
    if (retrying.current[kind]) {
      if (kind !== 'poster') setFailed(true);
      return;
    }
    retrying.current[kind] = true;
    refreshAccess();
  }
  function loaded(kind: 'image' | 'poster' | 'media') {
    if (requestedVersion.current !== accessVersion) return;
    retrying.current[kind] = false;
    if (kind !== 'poster') setFailed(false);
  }
  const mediaEvents = {
    ref: (element: HTMLMediaElement | null) => {
      player.current = element;
    },
    onPlay: () => {
      playing.current = true;
    },
    onPause: () => {
      // A network error pauses the element before dispatching its error event.
      if (!player.current?.error) playing.current = false;
    },
    onError: () => retry('media'),
    onLoadedMetadata: () => {
      if (requestedVersion.current !== accessVersion) return;
      const element = player.current;
      const saved = resume.current;
      if (!element || !saved) return;
      element.currentTime = saved.time;
      resume.current = null;
      if (saved.playing) {
        void element.play().catch((error: unknown) => {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Unable to resume asset preview.', error);
          }
        });
      }
    },
    onLoadedData: () => loaded('media'),
  };
  const original =
    asset.kind === 'text'
      ? null
      : asset.kind === 'webpage'
        ? asset.content.capture
        : asset.content.original;
  return (
    <>
      <button
        className="asset-card"
        onClick={() => {
          setOpen(true);
          setFailed(false);
          retrying.current = { image: false, poster: false, media: false };
          resume.current = null;
          playing.current = false;
          refreshAccess();
        }}
      >
        <div className="asset-thumbnail">
          {asset.kind === 'image' && urls?.original ? (
            <img
              src={urls.original}
              alt=""
              loading="lazy"
              onError={() => retry('image')}
              onLoad={() => loaded('image')}
            />
          ) : asset.kind === 'video' && urls?.poster ? (
            <>
              <img
                src={urls.poster}
                alt=""
                loading="lazy"
                onError={() => retry('poster')}
                onLoad={() => loaded('poster')}
              />
              <span className="video-mark">
                <FiPlay />
              </span>
            </>
          ) : asset.kind === 'text' ? (
            <p>{asset.content.text}</p>
          ) : asset.kind === 'audio' ? (
            <FiHeadphones />
          ) : (
            <FiFile />
          )}
        </div>
        <div className="asset-card-copy">
          <strong>{asset.name}</strong>
          <span>
            {asset.kind} {original ? `· ${formatBytes(original.size)}` : ''}
          </span>
        </div>
      </button>
      {open && (
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          className="asset-dialog"
          aria-label={asset.name}
        >
          <div className="asset-dialog-header">
            <h2>{asset.name}</h2>
            <button
              className="asset-icon-button"
              onClick={() => setOpen(false)}
              aria-label="Close preview"
            >
              <FiX />
            </button>
          </div>
          <div className="asset-preview">
            {asset.kind === 'text' ? (
              <p className="asset-text">{asset.content.text}</p>
            ) : !urls?.original ? (
              <p>Loading preview…</p>
            ) : asset.kind === 'image' ? (
              <img
                src={urls.original}
                alt={asset.name}
                onError={() => retry('image')}
                onLoad={() => loaded('image')}
              />
            ) : asset.kind === 'video' ? (
              <video
                controls
                preload="metadata"
                src={urls.original}
                poster={urls.poster ?? undefined}
                {...mediaEvents}
              />
            ) : asset.kind === 'audio' ? (
              <audio controls preload="metadata" src={urls.original} {...mediaEvents} />
            ) : (
              <div className="document-preview">
                <FiFileText />
                <p>Your PDF is ready to view.</p>
              </div>
            )}
            {failed && (
              <p role="alert">
                This browser cannot preview this file. Download the original to open it.
              </p>
            )}
          </div>
          {urls?.original && (
            <a className="asset-button" href={urls.original} target="_blank" rel="noreferrer">
              {asset.kind === 'document' ? 'Open PDF' : 'Open original'}
            </a>
          )}
        </dialog>
      )}
    </>
  );
}
