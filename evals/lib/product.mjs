import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export async function productProvenance(root) {
  const paths = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '_generated') continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts') && !/\.test\.|Test\.helpers/.test(entry.name))
        paths.push(relative(root, path));
    }
  }
  await visit(resolve(root, 'backend/convex'));
  paths.push('expo/src/features/assets/media.ts', 'expo/src/features/assets/videoCapture.ts');
  const hashes = {};
  for (const path of paths.sort())
    hashes[path] = createHash('sha256')
      .update(await readFile(resolve(root, path)))
      .digest('hex');
  return {
    root,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    gitStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
    hashes,
  };
}
export const paidAttempt = (span) =>
  span.provider !== 'cloudflare' && span.operation !== 'video_upload';
export const reserveAttempts = (c) =>
  c.assets.some((a) => a.path.endsWith('.mp4'))
    ? 28 // 22 Responses attempts, 2 quick checks, ASR + 2 fallback attempts, timeline.
    : c.assets.every((a) => a.path.endsWith('.pdf'))
      ? 2
      : 4;

export function videoErrors(detail) {
  return (detail.extractions ?? [])
    .filter((e) => e.status !== 'succeeded')
    .map((e) => `${e.kind}: ${e.error ?? e.status}`);
}
