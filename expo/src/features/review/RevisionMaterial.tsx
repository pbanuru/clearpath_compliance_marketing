import { useRef, useState } from 'react';
import { FiFileText, FiUpload } from 'react-icons/fi';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import type { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import type { Version } from './model';
import { UploadBox } from './UploadBox';

type Replacement = Id<'assets'> | 'pending';
export function RevisionMaterial({
  version,
  uploads,
  replacements,
  busy,
  onReplace,
  onBusy,
  onError,
}: {
  version: Version;
  uploads: ReturnType<typeof useAssetUploads>;
  replacements: Record<string, Replacement>;
  busy: boolean;
  onReplace: (original: Id<'assets'>, next?: Replacement) => void;
  onBusy: (value: boolean) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const replacing = useRef<Id<'assets'> | undefined>(undefined);
  const previousEdit = useRef<Replacement | undefined>(undefined);
  const [editing, setEditing] = useState<Id<'assets'>>();
  const [text, setText] = useState('');
  const editingAsset = version.assets.find((a) => a._id === editing);
  function removePrevious(original: Id<'assets'>) {
    const id = editing === original ? previousEdit.current : replacements[original];
    const item = uploads.items.find((i) => i.assetId === id);
    if (item) uploads.remove(item.key);
  }
  async function saveText(original: Id<'assets'>, name: string, value: string) {
    onBusy(true);
    onError('');
    try {
      const id = await uploads.addText(name, value);
      removePrevious(original);
      onReplace(original, id);
      setEditing(undefined);
    } catch (cause) {
      onError(errorMessage(cause, 'Unable to save the replacement.'));
    } finally {
      onBusy(false);
    }
  }
  return (
    <>
      <h3 className="cp-revision-subheading">Material for version {version.number + 1}</h3>
      {version.assets.map((asset) => {
        const replacement = replacements[asset._id];
        const item = uploads.items.find((i) => i.assetId === replacement);
        return (
          <div key={asset._id} className="cp-revision-asset">
            <FiFileText />
            <div>
              <strong>{asset.name}</strong>
              <span>
                {replacement && replacement !== 'pending' && item
                  ? `Replaced with ${item.name}`
                  : replacement
                    ? 'Choose or save the updated material'
                    : 'Keep the current material'}
              </span>
            </div>
            <div className="cp-revision-asset-actions">
              <button
                type="button"
                className="cp-button"
                aria-pressed={!replacement}
                disabled={busy || uploads.busy || (!!editing && editing !== asset._id)}
                onClick={() => {
                  removePrevious(asset._id);
                  onReplace(asset._id);
                  if (editing === asset._id) setEditing(undefined);
                }}
              >
                Keep
              </button>
              <button
                type="button"
                className="cp-button"
                aria-pressed={!!replacement}
                disabled={busy || uploads.busy || (!!editing && editing !== asset._id)}
                onClick={() => {
                  if (asset.kind === 'text') {
                    if (editing !== asset._id) previousEdit.current = replacement;
                    setEditing(asset._id);
                    setText(asset.content.text);
                    onReplace(asset._id, 'pending');
                  } else {
                    replacing.current = asset._id;
                    input.current?.click();
                  }
                }}
              >
                <FiUpload />
                Replace
              </button>
            </div>
          </div>
        );
      })}
      {editingAsset?.kind === 'text' && (
        <div className="cp-text-entry">
          <label>
            Updated {editingAsset.name}
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="cp-actions">
            <button
              type="button"
              className="cp-button"
              disabled={busy || !text.trim()}
              onClick={() => void saveText(editingAsset._id, editingAsset.name, text)}
            >
              Save replacement
            </button>
            <button
              type="button"
              className="cp-button quiet"
              onClick={() => {
                onReplace(editingAsset._id, previousEdit.current);
                setEditing(undefined);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept="image/*,video/*,audio/*,application/pdf"
        onChange={async (e) => {
          const file = e.target.files?.[0],
            original = replacing.current;
          e.target.value = '';
          if (!file || !original) return;
          const previous = replacements[original];
          onReplace(original, 'pending');
          onError('');
          try {
            await uploads.upload([file], {
              replacingAssetId: previous === 'pending' ? undefined : previous,
              onReady: (id) => onReplace(original, id),
            });
          } catch (cause) {
            onError(errorMessage(cause, 'Unable to replace the material. Retry the upload below.'));
          }
        }}
      />
      <div className="cp-revision-extra">
        <span className="cp-field-label">Add more material</span>
        <UploadBox uploads={uploads} />
      </div>
    </>
  );
}
