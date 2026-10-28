import { must } from './test.helpers';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import {
  workspace,
  job,
  fetcher,
  mockTriage,
  triaged,
  feed,
  pageText,
  fanouts,
} from './test.helpers';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('one eCFR amendment yields one update per workspace and no duplicate on the next run', async () => {
  const { t, alice, bob } = await workspace();
  await bob.mutation(api.policies.initialize, {});
  const key = 'ecfr:12:1002:1002.4';
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
      .unique();
    await ctx.db.patch('sourceChecks', must(s)._id, { fingerprint: '2020-01-01' });
  });
  const fetch = fetcher((url) =>
    url.includes('api.openai.com')
      ? mockTriage([triaged()])
      : url.includes('/versions/')
        ? Response.json({ meta: { latest_amendment_date: '2026-10-27' } })
        : new Response(pageText),
  );
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
  await fanouts(t);
  expect(await alice.query(api.policies.updates, {})).toHaveLength(1);
  expect(await bob.query(api.policies.updates, {})).toHaveLength(1);
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
  await fanouts(t);
  expect(await alice.query(api.policies.updates, {})).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url.includes('api.openai.com'))).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query('aiSpans').first())).toMatchObject({
    operation: 'policy_triage',
    status: 'succeeded',
  });
});

test('listing baselines are silent, one new URL gets one triage call, shared watchers receive no duplicate updates', async () => {
  const { t, alice, bob } = await workspace();
  const url = 'https://agency.example/feed.xml',
    existing = 'https://agency.example/old',
    fresh = 'https://agency.example/new';
  let published = false;
  const fetch = fetcher((u) =>
    u.includes('api.openai.com')
      ? mockTriage([triaged('approval-claims')])
      : u === url
        ? new Response(feed(published ? [existing, fresh] : [existing]))
        : new Response(pageText),
  );
  const args = { url, jurisdiction: 'federal', linkedRules: [], watchLinks: false };
  const source = await alice.action(api.policy.sourceManagement.add, args);
  await bob.action(api.policy.sourceManagement.add, args);
  expect(source.message).toContain('Found 1 items');
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('sourceChecks')
        .withIndex('by_sourceKey', (q) => q.eq('sourceKey', url))
        .collect(),
    ),
  ).toHaveLength(1);
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(0);
  published = true;
  fetch.mockClear();
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  await fanouts(t);
  await fanouts(t);
  expect(fetch.mock.calls.filter(([u]) => u === url)).toHaveLength(1);
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
  expect(await alice.query(api.policies.updates, {})).toHaveLength(1);
  expect(await bob.query(api.policies.updates, {})).toHaveLength(1);
  fetch.mockClear();
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(0);
});

test('unusable triage fails open to a Not triaged update, retaining both failed billed attempts', async () => {
  const { t, alice } = await workspace(),
    key = 'ecfr:12:1002:1002.4';
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
      .unique();
    await ctx.db.patch('sourceChecks', must(s)._id, { fingerprint: '2020-01-01' });
  });
  const { response } = await import('../pipelineTest.helpers');
  fetcher((url) =>
    url.includes('api.openai.com')
      ? response('{"bad":"output"}')
      : url.includes('/versions/')
        ? Response.json({ meta: { latest_amendment_date: '2026-10-27' } })
        : new Response(pageText),
  );
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
  await fanouts(t);
  const updates = await alice.query(api.policies.updates, {});
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({
    status: 'not_triaged',
    proposedCheck: '',
    key: 'fair-lending',
  });
  expect(updates[0]?.triageError).toContain('Missing policy triage decisions');
  const sources = await alice.query(api.policy.sourceManagement.list, {});
  expect(sources.find((s) => s.sourceKey === key)?.lastUpdateId).toBe(updates[0]?._id);
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans).toHaveLength(2);
  expect(
    spans.every(
      (s) => s.status === 'failed' && s.operation === 'policy_triage' && s.costUsd !== null,
    ),
  ).toBe(true);
});
