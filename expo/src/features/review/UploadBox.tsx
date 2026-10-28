import { useRef, useState } from 'react';
import { FiUploadCloud, FiPlus, FiX, FiFileText, FiCheck } from 'react-icons/fi';
import type { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import { MAX_VIDEO_SECONDS, VideoLengthError } from '@clearpath/backend/convex/videoLimits';

export function UploadBox({ uploads }: { uploads: ReturnType<typeof useAssetUploads> }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [limitError, setLimitError] = useState('');
  async function upload(files: File[]) {
    setError('');
    setLimitError('');
    try {
      await uploads.upload(files);
    } catch (cause) {
      if (cause instanceof VideoLengthError) setLimitError(cause.message);
      else setError(errorMessage(cause, 'Unable to upload.'));
    }
  }
  return (
    <div className="cp-upload">
      <div
        className={`cp-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploads.busy) void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <FiUploadCloud size={28} />
        <span>Images, videos up to {MAX_VIDEO_SECONDS / 60} minutes, audio, or PDFs</span>
        {limitError && (
          <p role="alert" className="cp-small">
            {limitError}
          </p>
        )}
        <div className="cp-actions">
          <button
            type="button"
            className="cp-button"
            disabled={uploads.busy}
            onClick={() => input.current?.click()}
          >
            Choose files
          </button>
          <button type="button" className="cp-button quiet" onClick={() => setTextOpen(!textOpen)}>
            <FiPlus /> Add text
          </button>
        </div>
        <span className="cp-small">Drop files</span>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          accept="image/*,video/*,audio/*,application/pdf"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      {textOpen && (
        <div className="cp-text-entry">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Caption, email, or landing page copy"
            />
          </label>
          <label>
            Text
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="cp-actions">
            <button
              type="button"
              className="cp-button primary"
              disabled={!name.trim() || !text.trim() || saving}
              onClick={async () => {
                setSaving(true);
                setError('');
                try {
                  await uploads.addText(name, text);
                  setTextOpen(false);
                  setName('');
                  setText('');
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to save text.'));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Saving…' : 'Add text'}
            </button>
            <button className="cp-button quiet" type="button" onClick={() => setTextOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="cp-upload-tiles">
        {uploads.items.map((item) => (
          <div className="cp-upload-tile" key={item.key}>
            <FiFileText />
            <div>
              <strong>{item.name}</strong>
              <span>
                {item.error
                  ? 'Upload failed'
                  : item.assetId
                    ? 'Uploaded'
                    : (item.message ?? `Uploading ${item.progress}%`)}
              </span>
              {!item.assetId && !item.error && (
                <progress value={item.progress} max={100} aria-label={`Uploading ${item.name}`} />
              )}
            </div>
            {item.assetId && <FiCheck className="cp-success" />}
            {item.error && (
              <button
                className="cp-button"
                type="button"
                disabled={uploads.busy}
                aria-label={`Retry ${item.name}`}
                onClick={async () => {
                  setError('');
                  setLimitError('');
                  try {
                    await uploads.retry(item.key);
                  } catch (cause) {
                    if (cause instanceof VideoLengthError) setLimitError(cause.message);
                    else setError(errorMessage(cause, 'Unable to upload.'));
                  }
                }}
              >
                Retry
              </button>
            )}
            <button
              className="cp-icon"
              type="button"
              disabled={uploads.busy}
              aria-label={`Remove ${item.name}`}
              onClick={() => uploads.remove(item.key)}
            >
              <FiX />
            </button>
          </div>
        ))}
      </div>
      {error && (
        <div role="alert" className="cp-error">
          {error}
        </div>
      )}
    </div>
  );
}
