import { useState } from 'react';
import { useAction, useConvex, useMutation } from 'convex/react';
import { captureWebpage } from './captureWebpage';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage, putFile, videoPoster } from './media';
import { UploadBatch } from './uploadBatch';

type Claim = {
  uploadId: Id<'assetUploads'>;
  original: string;
  poster: string | null;
  frames: { at: number; url: string }[];
};
type Upload = {
  key: string;
  file?: File;
  name: string;
  progress: number;
  message?: string;
  assetId?: Id<'assets'>;
  error?: string;
  poster?: Blob;
  frames?: { blob: Blob; at: number }[];
  claim?: Claim;
  sourceUrl?: string;
  thumbnail?: string;
  status?: string;
  onReady?: (id: Id<'assets'>, file: File) => void;
  replacingAssetId?: Id<'assets'>;
  replacementFor?: Id<'assets'>;
};
export function useAssetUploads() {
  const client = useConvex();
  const begin = useMutation(api.assetUploads.begin);
  const resume = useMutation(api.assetUploads.resume);
  const finalize = useAction(api.assetUploads.finalize);
  const createText = useMutation(api.assets.createText);
  const [items, setItems] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [batch] = useState(() => new UploadBatch<Upload>(setItems, setBusy));
  const update = (item: Upload, patch: Partial<Upload>) => {
    Object.assign(item, patch);
    batch.publish();
  };
  async function upload(
    files: File[],
    options?: {
      onReady?: (id: Id<'assets'>, file: File) => void;
      replacingAssetId?: Id<'assets'>;
      replacementFor?: Id<'assets'>;
    },
  ) {
    return batch.upload(
      files.map((file) => ({
        key: crypto.randomUUID(),
        file,
        name: file.name,
        progress: 0,
        ...options,
      })),
      uploadItem,
    );
  }
  async function uploadItem(item: Upload) {
    if (item.assetId) return item.assetId;
    if (!item.file) throw new Error('This upload has no file to retry.');
    const file = item.file;
    update(item, { error: undefined });
    try {
      if (file.type.startsWith('video/') && !item.poster)
        Object.assign(item, await videoPoster(file, (message) => update(item, { message })));
      update(item, { message: undefined });
      item.claim = item.claim
        ? await resume({ uploadId: item.claim.uploadId })
        : await begin({
            name: file.name,
            mimeType: file.type,
            size: file.size,
            ...(item.poster
              ? {
                  poster: { size: item.poster.size },
                  frames: item.frames?.map((f) => ({ at: f.at, size: f.blob.size })),
                }
              : {}),
          });
      const total =
        file.size +
        (item.poster?.size ?? 0) +
        (item.frames ?? []).reduce((sum, f) => sum + f.blob.size, 0);
      let sent = 0;
      const put = async (url: string, blob: Blob) => {
        await putFile(url, blob, (loaded) =>
          update(item, { progress: Math.round(((sent + loaded) / total) * 95) }),
        );
        sent += blob.size;
      };
      await put(item.claim.original, file);
      if (item.poster && item.claim.poster) await put(item.claim.poster, item.poster);
      for (const [i, frame] of (item.frames ?? []).entries()) {
        const target = item.claim.frames[i];
        if (!target) throw new Error('Frame upload URL is missing.');
        await put(target.url, frame.blob);
      }
      update(item, { message: 'Saving material…', progress: 99 });
      const assetId = await finalize({ uploadId: item.claim.uploadId });
      update(item, { assetId, progress: 100, message: undefined });
      item.onReady?.(assetId, file);
      return assetId;
    } catch (error) {
      update(item, { error: errorMessage(error, 'Upload failed. Please retry.') });
      throw error;
    }
  }
  async function addWebpage(url: string, retryKey?: string) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Enter an http or https URL.');
    return batch.exclusive(async () => {
      const item: Upload = {
        key: retryKey ?? crypto.randomUUID(),
        name: parsed.hostname,
        sourceUrl: url,
        progress: 0,
      };
      batch.add(item);
      try {
        const captured = await captureWebpage(client, url, (status) =>
          update(item, { status, message: status }),
        );
        update(item, {
          ...captured,
          progress: 100,
          status: 'Ready for review',
          message: undefined,
        });
        return captured.assetId;
      } catch (error) {
        update(item, { error: errorMessage(error, 'Unable to capture this page.') });
        return undefined;
      }
    });
  }
  async function addText(name: string, text: string) {
    return batch.exclusive(async () => {
      const assetId = await createText({ name, text });
      batch.add({ key: crypto.randomUUID(), name, progress: 100, assetId });
      return assetId;
    });
  }
  return {
    items,
    busy,
    upload,
    retry: (key: string) => batch.retry(key, uploadItem),
    addText,
    addWebpage,
    remove: (key: string) => batch.remove(key),
    allReady: items.every((item) => !!item.assetId),
    assetIds: items.flatMap((item) => (item.assetId ? [item.assetId] : [])),
  };
}
