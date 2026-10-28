import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function uploadWebpage(api, root, asset) {
  const frozen = JSON.parse(await readFile(resolve(root, asset.path), 'utf8'));
  const bytes = await readFile(resolve(root, frozen.screenshot));
  const claim = await api.run('assetUploads:begin', {
    name: `${asset.name}.jpg`,
    mimeType: 'image/jpeg',
    size: bytes.length,
  });
  const response = await fetch(claim.original, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok && response.status !== 412)
    throw new Error(
      `Webpage screenshot upload failed (${response.status}): ${await response.text()}`,
    );
  const {
    sourceUrl,
    finalUrl,
    title,
    size,
    blocks,
    browserMs,
    capturedAt,
    blocksTruncated,
    heightTruncated,
  } = frozen;
  return api.run('assets:createWebpage', {
    uploadId: claim.uploadId,
    sourceUrl,
    finalUrl,
    title,
    size,
    blocks,
    browserMs,
    capturedAt,
    blocksTruncated,
    heightTruncated,
  });
}
