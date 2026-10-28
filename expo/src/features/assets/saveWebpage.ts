import type { ConvexReactClient } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { TextBlock } from '@clearpath/backend/convex/webpageTypes';
import { limitBlocks } from '@clearpath/backend/convex/webpageBlocks';
import { putFile } from './media';

export type CapturedWebpage = {
  screenshot: string;
  title: string;
  finalUrl: string;
  size: { width: number; height: number };
  blocks: TextBlock[];
  browserMs: number;
  capturedAt: number;
  heightTruncated: boolean;
  blocksTruncated: boolean;
};
export async function saveWebpage(
  client: ConvexReactClient,
  url: string,
  data: CapturedWebpage,
  onProgress: (message: string) => void,
) {
  const { screenshot, blocks, ...metadata } = data;
  const blob = await (await fetch(screenshot)).blob();
  const image = await createImageBitmap(blob);
  const tiles: { blob: Blob; y: number; height: number }[] = [];
  const canvas = document.createElement('canvas');
  try {
    for (let y = 0; y < image.height; y += 1800) {
      canvas.width = image.width;
      canvas.height = Math.min(1800, image.height - y);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare the captured page.');
      context.drawImage(image, 0, y, image.width, canvas.height, 0, 0, image.width, canvas.height);
      const tile = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => {
            if (value) resolve(value);
            else reject(new Error('Unable to prepare a page tile.'));
          },
          'image/jpeg',
          0.8,
        ),
      );
      tiles.push({ blob: tile, y, height: canvas.height });
    }
  } finally {
    image.close();
    canvas.width = 0;
    canvas.height = 0;
  }
  onProgress('Saving the captured page…');
  const claim = await client.mutation(api.assetUploads.begin, {
    name: `${data.title || new URL(url).hostname}.jpg`,
    mimeType: 'image/jpeg',
    size: blob.size,
    tiles: tiles.map((t) => ({ size: t.blob.size, y: t.y, height: t.height })),
  });
  await putFile(claim.original, blob, () => undefined);
  for (const [i, tile] of tiles.entries()) {
    const target = claim.tiles[i];
    if (!target) throw new Error('A page tile upload is missing.');
    await putFile(target.url, tile.blob, () => undefined);
  }
  const limited = limitBlocks(blocks);
  const assetId = await client.action(api.assets.createWebpage, {
    ...metadata,
    sourceUrl: url,
    ...limited,
    blocksTruncated: metadata.blocksTruncated || limited.blocksTruncated,
    uploadId: claim.uploadId,
  });
  return { assetId, name: data.title || new URL(url).hostname, thumbnail: screenshot };
}
