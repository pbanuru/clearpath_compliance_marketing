import { useRef, useState } from 'react';
import { useAction, useConvexAuth, useMutation, usePaginatedQuery } from 'convex/react';
import { FiPlus, FiUploadCloud } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { AssetCard } from './AssetCard';
import { errorMessage, putFile, videoPoster } from './media';
import './assets.css';

interface Upload {
  file: File;
  poster?: Blob;
  frames?: { blob: Blob; at: number }[];
  claim?: {
    uploadId: Id<'assetUploads'>;
    original: string;
    poster: string | null;
    frames: { at: number; url: string }[];
  };
}

export function AssetWorkspace() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading)
    return (
      <section className="asset-intro">
        <h1>Your assets</h1>
        <p>Loading your workspace…</p>
      </section>
    );
  if (!isAuthenticated)
    return (
      <section className="asset-intro">
        <h1>Your marketing material, in one place.</h1>
        <p>Sign in above to add and view your assets.</p>
      </section>
    );
  return <AuthenticatedWorkspace />;
}

function AuthenticatedWorkspace() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.assets.list,
    {},
    { initialNumItems: 24 },
  );
  const begin = useMutation(api.assetUploads.begin);
  const resume = useMutation(api.assetUploads.resume);
  const finalize = useAction(api.assetUploads.finalize);
  const createText = useMutation(api.assets.createText);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  async function uploadFiles(files?: File[]) {
    if (busy) return;
    if (files) pending.current = files.map((file) => ({ file }));
    setBusy(true);
    setError('');
    setCanRetry(false);
    try {
      while (pending.current.length) {
        const item = pending.current[0];
        if (!item) break;
        const { file } = item;
        setProgress(0);
        setMessage(
          file.type.startsWith('video/')
            ? `Creating poster for ${file.name}…`
            : `Uploading ${file.name}…`,
        );
        if (file.type.startsWith('video/') && !item.poster)
          Object.assign(item, await videoPoster(file));
        item.claim = item.claim
          ? await resume({ uploadId: item.claim.uploadId })
          : await begin({
              name: file.name,
              mimeType: file.type,
              size: file.size,
              ...(item.poster
                ? {
                    poster: { size: item.poster.size },
                    frames: item.frames?.map((frame) => ({ size: frame.blob.size, at: frame.at })),
                  }
                : {}),
            });
        setMessage(`Uploading ${file.name}…`);
        const total =
          file.size +
          (item.poster?.size ?? 0) +
          (item.frames ?? []).reduce((sum, frame) => sum + frame.blob.size, 0);
        await putFile(item.claim.original, file, (loaded) =>
          setProgress(Math.round((loaded / total) * 100)),
        );
        if (item.poster && item.claim.poster)
          await putFile(item.claim.poster, item.poster, (loaded) =>
            setProgress(Math.round(((file.size + loaded) / total) * 100)),
          );
        let uploaded = file.size + (item.poster?.size ?? 0);
        for (const [index, frame] of (item.frames ?? []).entries()) {
          const target = item.claim.frames[index];
          if (!target) throw new Error('Frame upload URL is missing.');
          await putFile(target.url, frame.blob, (loaded) =>
            setProgress(Math.round(((uploaded + loaded) / total) * 100)),
          );
          uploaded += frame.blob.size;
        }
        setMessage(`Saving ${file.name}…`);
        await finalize({ uploadId: item.claim.uploadId });
        pending.current.shift();
      }
      setMessage('Upload complete.');
      setProgress(100);
    } catch (failure) {
      setError(errorMessage(failure, 'Upload failed. Please retry.'));
      setCanRetry(pending.current.length > 0);
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    setBusy(true);
    setError('');
    try {
      await createText({ name, text });
      setName('');
      setText('');
      setTextOpen(false);
      setMessage('Text saved.');
    } catch (failure) {
      setError(errorMessage(failure, 'Unable to save text.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="asset-workspace">
      <div className="asset-heading">
        <div>
          <h1>Your assets</h1>
          <p>Add the marketing material you want to work on.</p>
        </div>
        <button className="asset-button" onClick={() => setTextOpen(!textOpen)} disabled={busy}>
          <FiPlus /> Add text
        </button>
      </div>
      {textOpen && (
        <form
          className="text-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveText();
          }}
        >
          <label>
            Name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Personal loan email"
            />
          </label>
          <label>
            Text
            <textarea
              required
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your copy here"
            />
          </label>
          <div>
            <button className="asset-button primary" disabled={busy}>
              Save text
            </button>
            <button
              className="asset-button"
              type="button"
              onClick={() => setTextOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div
        className={`asset-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <FiUploadCloud />
        <div>
          <strong>Drop your files here</strong>
          <p>Images, audio, video, and PDFs</p>
        </div>
        <button
          className="asset-button primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Choose files
        </button>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          accept="image/*,audio/*,video/*,application/pdf"
          onChange={(event) => {
            void uploadFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {message && (
        <div className="upload-status" role="status">
          <span>{message}</span>
          {busy && <progress max={100} value={progress} aria-label="Upload progress" />}
        </div>
      )}
      {error && (
        <div className="asset-error" role="alert">
          <p>{error}</p>
          {canRetry && (
            <button className="asset-button" disabled={busy} onClick={() => uploadFiles()}>
              Retry upload
            </button>
          )}
        </div>
      )}
      {status === 'LoadingFirstPage' ? (
        <p>Loading assets…</p>
      ) : results.length === 0 ? (
        <div className="asset-empty">
          <h2>No assets yet</h2>
          <p>Upload a file or add text to get started.</p>
        </div>
      ) : (
        <div className="asset-grid">
          {results.map((asset) => (
            <AssetCard key={asset._id} asset={asset} />
          ))}
        </div>
      )}
      {status === 'CanLoadMore' && (
        <button className="asset-button" onClick={() => loadMore(24)}>
          Load more
        </button>
      )}
    </section>
  );
}
