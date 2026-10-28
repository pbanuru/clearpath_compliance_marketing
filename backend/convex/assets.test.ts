/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import r2 from '@convex-dev/r2/test';
import { describe, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';

vi.stubEnv('R2_BUCKET', 'test-assets');
vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-id');
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
const modules = import.meta.glob('./**/*.ts');
function setup() {
  const t = convexTest(schema, modules);
  r2.register(t);
  return t;
}
const identity = {
  subject: 'alice',
  issuer: 'https://auth.example',
  tokenIdentifier: 'https://auth.example|alice',
};

describe('asset ownership and immutable upload contract', () => {
  test('rejects signed-out access and isolates the indexed list and signed URLs', async () => {
    const t = setup();
    const alice = t.withIdentity(identity);
    const bob = t.withIdentity({
      ...identity,
      subject: 'bob',
      tokenIdentifier: 'https://auth.example|bob',
    });
    await expect(
      t.query(api.assets.list, { paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow('Sign in');
    await expect(
      t.mutation(api.assetUploads.begin, { name: 'photo.jpg', mimeType: 'image/jpeg', size: 10 }),
    ).rejects.toThrow('Sign in');
    const id = await alice.mutation(api.assets.createText, {
      name: 'Email',
      text: 'Original copy',
    });
    expect(
      (await alice.query(api.assets.list, { paginationOpts: { numItems: 1, cursor: null } })).page,
    ).toHaveLength(1);
    expect(
      (await bob.query(api.assets.list, { paginationOpts: { numItems: 10, cursor: null } })).page,
    ).toHaveLength(0);
    await expect(bob.query(api.assets.access, { assetId: id })).rejects.toThrow('Asset not found');
  });

  test('binds MIME and poster requirements before minting signed immutable uploads', async () => {
    const t = setup().withIdentity(identity);
    await expect(
      t.mutation(api.assetUploads.begin, {
        name: 'file.exe',
        mimeType: 'application/octet-stream',
        size: 2,
      }),
    ).rejects.toThrow('Choose an image');
    await expect(
      t.mutation(api.assetUploads.begin, { name: 'video.mp4', mimeType: 'video/mp4', size: 2 }),
    ).rejects.toThrow('requires a generated poster');
    await expect(
      t.mutation(api.assetUploads.begin, {
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 2,
        poster: { size: 2 },
      }),
    ).rejects.toThrow('requires a generated poster');
    const claim = await t.mutation(api.assetUploads.begin, {
      name: 'video.mp4',
      mimeType: 'video/mp4',
      size: 10,
      poster: { size: 4 },
    });
    const url = new URL(claim.original);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('if-none-match');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(claim.poster).not.toBe(claim.original);
  });

  test('rejects foreign finalization, absent/mismatched objects, and finalizes once with a real poster reference', async () => {
    const t = setup();
    const alice = t.withIdentity(identity);
    const claim = await alice.mutation(api.assetUploads.begin, {
      name: 'video.mp4',
      mimeType: 'video/mp4',
      size: 10,
      poster: { size: 4 },
    });
    const stored = await t.run((ctx) => ctx.db.get('assetUploads', claim.uploadId));
    if (!stored?.poster) throw new Error('Expected poster upload claim');
    await expect(
      t
        .withIdentity({ ...identity, tokenIdentifier: 'bob' })
        .action(api.assetUploads.finalize, { uploadId: claim.uploadId }),
    ).rejects.toThrow('Upload not found');
    await expect(
      t.mutation(internal.assetUploads.commit, {
        uploadId: claim.uploadId,
        owner: identity.tokenIdentifier,
      }),
    ).rejects.toThrow('does not match');
    await t.mutation(components.r2.lib.upsertMetadata, {
      key: stored.original.key,
      bucket: 'test-assets',
      contentType: 'audio/wav',
      size: stored.original.size,
      lastModified: '',
      link: '',
    });
    await expect(
      t.mutation(internal.assetUploads.commit, {
        uploadId: claim.uploadId,
        owner: identity.tokenIdentifier,
      }),
    ).rejects.toThrow('does not match');
    for (const file of [stored.original, stored.poster]) {
      await t.mutation(components.r2.lib.upsertMetadata, {
        key: file.key,
        bucket: 'test-assets',
        contentType: file.mimeType,
        size: file.size,
        lastModified: '',
        link: '',
      });
    }
    const args = { uploadId: claim.uploadId, owner: identity.tokenIdentifier };
    const id = await t.mutation(internal.assetUploads.commit, args);
    expect(await alice.action(api.assetUploads.finalize, { uploadId: claim.uploadId })).toBe(id);
    expect(await t.mutation(internal.assetUploads.commit, args)).toBe(id);
    const saved = await t.run((ctx) => ctx.db.get('assets', id));
    expect(saved?.kind).toBe('video');
    if (saved?.kind !== 'video') throw new Error('Expected video asset');
    expect(saved.content.poster.key).toBe(stored.poster.key);
    expect(saved.content.poster.key).not.toBe(saved.content.original.key);
    expect(
      (await alice.query(api.assets.list, { paginationOpts: { numItems: 10, cursor: null } })).page,
    ).toHaveLength(1);
  });
});
