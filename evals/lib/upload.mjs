import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureVideo } from './media.mjs';
import { uploadWebpage } from './webpage-upload.mjs';

const mimeTypes = { '.png': 'image/png', '.pdf': 'application/pdf', '.mp4': 'video/mp4' };
export async function uploadCase(api, root, testCase, directory, label) {
  const assets = {};
  for (const asset of testCase.assets) {
    if (asset.kind === 'webpage') {
      assets[asset.ref] = await uploadWebpage(api, root, asset);
      continue;
    }
    const path = resolve(root, asset.path);
    const bytes = await readFile(path);
    if (path.endsWith('.txt')) {
      assets[asset.ref] = await api.run('assets:createText', {
        name: asset.name,
        text: bytes.toString('utf8'),
      });
      continue;
    }
    const mimeType = Object.entries(mimeTypes).find(([extension]) => path.endsWith(extension))?.[1];
    if (!mimeType) throw new Error(`Unsupported eval asset: ${asset.path}`);
    const frames = mimeType === 'video/mp4' ? await captureVideo(root, path) : [];
    const poster = frames[0]?.bytes;
    if (poster) {
      await writeFile(
        resolve(directory, `${label}-frames.json`),
        JSON.stringify(
          frames.map((f) => ({
            at: f.at,
            size: f.bytes.length,
          })),
        ),
      );
    }
    const claim = await api.run('assetUploads:begin', {
      name: asset.name,
      mimeType,
      size: bytes.length,
      ...(poster
        ? {
            poster: { size: poster.length },
            frames: frames.map((f) => ({ at: f.at, size: f.bytes.length })),
          }
        : {}),
    });
    async function put(url, body, type) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': type, 'If-None-Match': '*' },
        body,
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok && response.status !== 412)
        throw new Error(`Asset upload failed (${response.status}): ${await response.text()}`);
    }
    await put(claim.original, bytes, mimeType);
    if (poster) await put(claim.poster, poster, 'image/jpeg');
    for (const [index, frame] of frames.entries())
      await put(claim.frames[index].url, frame.bytes, 'image/jpeg');
    assets[asset.ref] = await api.run('assetUploads:finalize', { uploadId: claim.uploadId });
  }
  return assets;
}
