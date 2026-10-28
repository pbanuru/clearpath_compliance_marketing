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
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const urls = useQuery(
    api.assets.access,
    asset.kind === 'image' || asset.kind === 'video' || open
      ? { assetId: asset._id, accessVersion }
      : 'skip',
  );
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
          setAccessVersion(Date.now());
        }}
      >
        <div className="asset-thumbnail">
          {asset.kind === 'image' && urls?.original ? (
            <img src={urls.original} alt="" loading="lazy" />
          ) : asset.kind === 'video' && urls?.poster ? (
            <>
              <img src={urls.poster} alt="" loading="lazy" />
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
              <img src={urls.original} alt={asset.name} onError={() => setFailed(true)} />
            ) : asset.kind === 'video' ? (
              <video
                controls
                preload="metadata"
                src={urls.original}
                poster={urls.poster ?? undefined}
                onError={() => setFailed(true)}
              />
            ) : asset.kind === 'audio' ? (
              <audio
                controls
                preload="metadata"
                src={urls.original}
                onError={() => setFailed(true)}
              />
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
