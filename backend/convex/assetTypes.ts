import { v } from 'convex/values';

export const fileReference = v.object({
  key: v.string(),
  name: v.string(),
  mimeType: v.string(),
  size: v.number(),
});
const common = { owner: v.string(), name: v.string(), version: v.literal(1) };
const parts = v.array(v.id('assets'));
export const asset = v.union(
  v.object({ ...common, kind: v.literal('text'), content: v.object({ text: v.string() }) }),
  v.object({ ...common, kind: v.literal('image'), content: v.object({ original: fileReference }) }),
  v.object({ ...common, kind: v.literal('audio'), content: v.object({ original: fileReference }) }),
  v.object({
    ...common,
    kind: v.literal('video'),
    content: v.object({ original: fileReference, poster: fileReference }),
  }),
  v.object({
    ...common,
    kind: v.literal('document'),
    content: v.object({ original: fileReference, parts }),
  }),
  v.object({
    ...common,
    kind: v.literal('webpage'),
    content: v.object({ sourceUrl: v.string(), capture: fileReference, parts }),
  }),
);
export const uploadKind = v.union(
  v.literal('image'),
  v.literal('audio'),
  v.literal('video'),
  v.literal('document'),
);

export function kindForMime(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'document';
  throw new Error('Choose an image, audio file, video, or PDF.');
}

export function requireFileSize(size: number) {
  // R2's single PUT limit. Upload bytes travel directly from the browser to R2.
  if (!Number.isSafeInteger(size) || size <= 0 || size > 5 * 1024 ** 3 - 5 * 1024 ** 2) {
    throw new Error('Files must be nonempty and fit within R2’s single-upload limit (4.995 GiB).');
  }
}
