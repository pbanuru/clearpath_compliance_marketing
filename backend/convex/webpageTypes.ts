import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';

export const pageSize = v.object({ width: v.number(), height: v.number() });
export const textBlock = v.object({
  text: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});
export const pageTile = v.object({
  key: v.string(),
  name: v.string(),
  mimeType: v.string(),
  size: v.number(),
  y: v.number(),
  height: v.number(),
});
export const webpageArgs = {
  uploadId: v.id('assetUploads'),
  sourceUrl: v.string(),
  finalUrl: v.string(),
  title: v.string(),
  size: pageSize,
  blocks: v.array(textBlock),
  browserMs: v.number(),
  blocksTruncated: v.optional(v.boolean()),
  heightTruncated: v.optional(v.boolean()),
  capturedAt: v.optional(v.number()),
};
export type TextBlock = Infer<typeof textBlock>;

export function validateWebpage(args: {
  sourceUrl: string;
  finalUrl: string;
  size: Infer<typeof pageSize>;
  blocks: TextBlock[];
  browserMs: number;
  capturedAt?: number;
}) {
  for (const value of [args.sourceUrl, args.finalUrl]) {
    let url: URL;
    try {
      url = new URL(value);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? 'Enter a valid web page URL.' : 'Invalid URL.',
      );
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      value.length > 4096
    )
      throw new ConvexError('Enter a valid http or https web page URL.');
  }
  const { width, height } = args.size;
  if (
    !Number.isSafeInteger(width) ||
    width !== 1440 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    height > 12000
  )
    throw new ConvexError('Invalid captured page size.');
  if (!Number.isFinite(args.browserMs) || args.browserMs < 0 || args.browserMs > 300000)
    throw new ConvexError('Invalid browser duration.');
  if (
    args.capturedAt !== undefined &&
    (!Number.isFinite(args.capturedAt) ||
      args.capturedAt < 0 ||
      args.capturedAt > Date.now() + 60000)
  )
    throw new ConvexError('Invalid capture time.');
  for (const block of args.blocks) {
    if (
      ![block.x, block.y, block.width, block.height].every(Number.isFinite) ||
      !block.text.trim() ||
      block.x < 0 ||
      block.y < 0 ||
      block.width <= 0 ||
      block.height <= 0 ||
      block.x + block.width > width + 0.01 ||
      block.y + block.height > height + 0.01
    )
      throw new ConvexError('Invalid captured text block.');
  }
}
