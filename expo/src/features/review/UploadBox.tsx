import { useRef, useState } from 'react';
import { FiUploadCloud, FiPlus, FiX, FiFileText, FiCheck } from 'react-icons/fi';
import type { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';

export function UploadBox({ uploads }: { uploads: ReturnType<typeof useAssetUploads> }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  async function upload(files?: File[]) {
    setError('');
    try {
      await uploads.upload(files);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to upload.'));
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
        <strong>Add your marketing material</strong>
        <span>Images, video, audio, or PDFs</span>
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
        <span className="cp-small">or drop files here</span>
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
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the original copy here"
            />
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
                    ? 'Ready for review'
                    : `Uploading ${item.progress}%`}
              </span>
              {!item.assetId && !item.error && (
                <progress value={item.progress} max={100} aria-label={`Uploading ${item.name}`} />
              )}
            </div>
            {item.assetId && <FiCheck className="cp-success" />}
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
          <button
            className="cp-button"
            type="button"
            disabled={uploads.busy}
            onClick={() => void upload()}
          >
            Retry upload
          </button>
        </div>
      )}
    </div>
  );
}
