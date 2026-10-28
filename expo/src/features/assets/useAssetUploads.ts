import { useRef, useState } from 'react';
import { useAction, useConvex, useMutation } from 'convex/react';
import { captureWebpage } from './captureWebpage';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage, putFile, videoPoster } from './media';

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
  assetId?: Id<'assets'>;
  error?: string;
  poster?: Blob;
  frames?: { blob: Blob; at: number }[];
  claim?: Claim;
  sourceUrl?: string;
  thumbnail?: string;
  status?: string;
};
export function useAssetUploads() {
  const client = useConvex();
  const begin = useMutation(api.assetUploads.begin);
  const resume = useMutation(api.assetUploads.resume);
  const finalize = useAction(api.assetUploads.finalize);
  const createText = useMutation(api.assets.createText);
  const [items, setItems] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<Upload[]>([]);
  const update = (item: Upload, patch: Partial<Upload>) => {
    Object.assign(item, patch);
    setItems((current) => current.map((row) => (row.key === item.key ? { ...item } : row)));
  };
  async function upload(files?: File[]) {
    if (lock.current) throw new Error('Wait for the current upload to finish.');
    lock.current = true;
    setBusy(true);
    if (files) {
      const next = files.map((file) => ({
        key: crypto.randomUUID(),
        file,
        name: file.name,
        progress: 0,
      }));
      pending.current = [...pending.current, ...next];
      setItems((current) => [...current, ...next]);
    }
    const ids: Id<'assets'>[] = [];
    try {
      while (pending.current.length) {
        const item = pending.current[0];
        if (!item?.file) break;
        const file = item.file;
        update(item, { error: undefined });
        try {
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
          const assetId = await finalize({ uploadId: item.claim.uploadId });
          update(item, { assetId, progress: 100 });
          ids.push(assetId);
          pending.current.shift();
        } catch (error) {
          update(item, { error: errorMessage(error, 'Upload failed. Please retry.') });
          throw error;
        }
      }
      return ids;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function addWebpage(url: string, retryKey?: string) {
    if (lock.current) throw new Error('Wait for the current upload to finish.');
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Enter an http or https URL.');
    lock.current = true;
    setBusy(true);
    const item: Upload = {
      key: retryKey ?? crypto.randomUUID(),
      name: parsed.hostname,
      sourceUrl: url,
      progress: 0,
    };
    if (retryKey) setItems((current) => current.map((row) => (row.key === retryKey ? item : row)));
    else setItems((current) => [...current, item]);
    try {
      const captured = await captureWebpage(client, url, (status) => update(item, { status }));
      update(item, { ...captured, progress: 100, status: 'Ready for review' });
      return captured.assetId;
    } catch (error) {
      update(item, { error: errorMessage(error, 'Unable to capture this page.') });
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function addText(name: string, text: string) {
    const assetId = await createText({ name, text });
    setItems((current) => [...current, { key: crypto.randomUUID(), name, progress: 100, assetId }]);
    return assetId;
  }
  function remove(key: string) {
    if (lock.current) return;
    pending.current = pending.current.filter((item) => item.key !== key);
    setItems((current) => current.filter((item) => item.key !== key));
  }
  return {
    items,
    busy,
    upload,
    addText,
    addWebpage,
    remove,
    assetIds: items.flatMap((item) => (item.assetId ? [item.assetId] : [])),
  };
}
