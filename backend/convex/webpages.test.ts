/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import r2 from '@convex-dev/r2/test';
import { afterEach, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import { storage } from './assetStorage';
import { output } from './pipelineTest.helpers';
import { parseAnalysis } from './review/parsing';
import { assetInput } from './review/mediaInput';
import { limitBlocks } from './webpageBlocks';

vi.hoisted(() => {
  vi.stubEnv('R2_BUCKET', 'test-assets');
  vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-id');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
});
const modules = import.meta.glob('./**/*.ts');
const identity = {
  subject: 'alice',
  issuer: 'https://auth.example',
  tokenIdentifier: 'https://auth.example|alice',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules);
  r2.register(t);
  const alice = t.withIdentity(identity);
  const claim = await alice.mutation(api.assetUploads.begin, {
    name: 'page.jpg',
    mimeType: 'image/jpeg',
    size: 10,
    tiles: [
      { size: 5, y: 0, height: 1800 },
      { size: 6, y: 1800, height: 1800 },
    ],
  });
  const stored = await t.run((ctx) => ctx.db.get('assetUploads', claim.uploadId));
  if (!stored) throw new Error('Missing claim');
  const args = {
    uploadId: claim.uploadId,
    sourceUrl: 'https://example.com',
    finalUrl: 'https://example.com/offer',
    title: 'Offer',
    size: { width: 1440, height: 3600 },
    browserMs: 3600,
    blocks: [
      { text: 'Guaranteed approval', x: 144, y: 1800, width: 720, height: 72 },
      { text: 'in minutes.', x: 144, y: 1872, width: 360, height: 72 },
    ],
  };
  const metadata = async () => {
    for (const file of [stored.original, ...(stored.tiles ?? [])])
      await t.mutation(components.r2.lib.upsertMetadata, {
        key: file.key,
        bucket: 'test-assets',
        contentType: file.mimeType,
        size: file.size,
        lastModified: '',
        link: '',
      });
  };
  return { t, alice, args, metadata };
}

test('createWebpage rejects foreign uploads before syncing, checks metadata, and records exactly one capture span across retries', async () => {
  const { t, alice, args, metadata } = await setup();
  const sync = vi.spyOn(storage, 'syncMetadata').mockResolvedValue(undefined);
  await expect(t.action(api.assets.createWebpage, args)).rejects.toThrow('Sign in');
  await expect(
    t.withIdentity({ ...identity, tokenIdentifier: 'bob' }).action(api.assets.createWebpage, args),
  ).rejects.toThrow('Upload not found');
  expect(sync).not.toHaveBeenCalled();
  await expect(alice.action(api.assets.createWebpage, args)).rejects.toThrow('does not match');
  await metadata();
  const id = await alice.action(api.assets.createWebpage, args);
  expect(await alice.action(api.assets.createWebpage, args)).toBe(id);
  expect(
    await t.mutation(internal.webpages.commit, { ...args, owner: identity.tokenIdentifier }),
  ).toBe(id);
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({
    assetId: id,
    provider: 'cloudflare',
    operation: 'page_capture',
    model: 'browser-run',
    usage: { browserMs: 3600 },
  });
  expect(spans[0]?.costUsd).toBeCloseTo(0.00009, 10);
  expect(spans[0]?.reviewId).toBeUndefined();
  expect(spans[0]?.pricingVersion).toContain('marginal charge may be zero');
  const daily = await t.run((ctx) => ctx.db.query('aiUsageDaily').collect());
  expect(daily).toHaveLength(1);
  expect(daily[0]?.calls).toBe(1);
});

test('page quote matching replaces model regions with measured block unions, including adjacent blocks', async () => {
  const { t, args, metadata } = await setup();
  await metadata();
  const id = await t.mutation(internal.webpages.commit, {
    ...args,
    owner: identity.tokenIdentifier,
  });
  const asset = await t.run((ctx) => ctx.db.get('assets', id));
  if (!asset) throw new Error('Missing page');
  for (const [quote, height] of [
    ['Guaranteed approval', 0.02],
    ['approval in minutes.', 0.04],
    ['approval\nin minutes.', 0.04],
  ] as const) {
    const raw = output(id, quote);
    const finding = parseAnalysis(JSON.stringify(raw), [asset], [], new Map()).findings[0];
    expect(finding?.quoteFound).toBe(true);
    expect(finding?.location?.region).toEqual({ x: 0.1, y: 0.5, width: 0.5, height });
  }
  const raw = output(id, 'Absent quote');
  const fallback = { x: 0.2, y: 0.3, width: 0.1, height: 0.1 };
  const unmatched = {
    ...raw,
    findings: raw.findings.map((f) => ({ ...f, location: { ...f.location, region: fallback } })),
  };
  const finding = parseAnalysis(JSON.stringify(unmatched), [asset], [], new Map()).findings[0];
  expect(finding?.quoteFound).toBe(false);
  expect(finding?.location?.region).toEqual(fallback);
});

test('webpage analysis sends inline tiles with vertical ranges and numbered blocks', async () => {
  const { t, args, metadata } = await setup();
  await metadata();
  const id = await t.mutation(internal.webpages.commit, {
    ...args,
    owner: identity.tokenIdentifier,
  });
  const asset = await t.run((ctx) => ctx.db.get('assets', id));
  if (!asset) throw new Error('Missing page');
  const fetch = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
  vi.stubGlobal('fetch', fetch);
  const parts = await assetInput(asset, {
    owner: identity.tokenIdentifier,
    key: 'test',
    spans: [],
    cached: [],
    extractions: [],
    texts: new Map(),
    bytes: 0,
  });
  expect(parts.filter((p) => p.type === 'input_image')).toHaveLength(2);
  expect(JSON.stringify(parts)).toContain('vertical pixels 1800–3600');
  expect(JSON.stringify(parts)).toContain('[1] Guaranteed approval');
  expect(JSON.stringify(parts)).toContain(id);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('block budget drops smallest blocks first, preserves reading order, and bounds UTF-8 bytes', () => {
  const small = { text: 'small', x: 0, y: 0, width: 1, height: 1 };
  const large = { text: '€'.repeat(70000), x: 0, y: 0, width: 100, height: 100 };
  const result = limitBlocks([small, large]);
  expect(result.blocksTruncated).toBe(true);
  expect(result.blocks).toEqual([]);
  const many = limitBlocks(
    Array.from({ length: 1600 }, (_, i) => ({ ...small, text: `block ${i}`, width: i + 1 })),
  );
  expect(many.blocks).toHaveLength(1500);
  expect(many.blocks[0]?.text).toBe('block 100');
  expect(new TextEncoder().encode(JSON.stringify(many.blocks)).length).toBeLessThan(180000);
});
