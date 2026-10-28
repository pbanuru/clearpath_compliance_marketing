import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { workspace, must, feed, fetcher, mockTriage, triaged, pageText, job } from './test.helpers';

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

test('daily planning and source execution find an active watcher after 500 paused subscriptions', async () => {
  const { t } = await workspace();
  const url = 'https://agency.example/late-active';
  await t.run(async (ctx) => {
    await ctx.db.insert('sourceChecks', {
      sourceKey: url,
      monitor: { type: 'page', url },
      fingerprint: '',
      text: '',
      lastCheckedAt: 0,
    });
    for (let index = 0; index <= 500; index++)
      await ctx.db.insert('workspaceSources', {
        owner: index === 500 ? 'https://auth.example|alice' : `paused-${index}`,
        sourceKey: url,
        label: 'Shared page',
        jurisdiction: 'federal',
        monitor: { type: 'page', url },
        linkedRules: ['fair-lending'],
        paused: index < 500,
        createdAt: Date.now(),
      });
  });
  const runId = must(await t.mutation(internal.policy.monitorState.begin, {}));
  await t.mutation(internal.policy.dailyPlanning.plan, { id: runId });
  const planned = must(
    await t.run((ctx) =>
      ctx.db
        .query('sourceJobs')
        .withIndex('by_sourceKey', (q) => q.eq('sourceKey', url))
        .first(),
    ),
  );
  const fetch = fetcher(() => new Response(pageText));
  await t.action(internal.policy.checkSource.run, { jobId: planned._id });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe(url);
  expect(await t.run((ctx) => ctx.db.get('sourceJobs', planned._id))).toMatchObject({
    status: 'succeeded',
  });
});

test('a shared feed classifies and fans out to all 501 active subscribers with one fetch and shared triage', async () => {
  const { t, alice, bob } = await workspace();
  const url = 'https://agency.example/many-watchers.xml';
  await t.run(async (ctx) => {
    const original = must(
      await ctx.db
        .query('policies')
        .withIndex('by_owner_and_key', (q) =>
          q.eq('owner', 'https://auth.example|alice').eq('key', 'fair-lending'),
        )
        .unique(),
    );
    const initial = must(
      await ctx.db
        .query('policyVersions')
        .withIndex('by_owner_and_key_and_version', (q) =>
          q.eq('owner', original.owner).eq('key', original.key).eq('version', 1),
        )
        .unique(),
    );
    const { _id: _policyId, _creationTime: _policyTime, ...policy } = original;
    const { _id: _versionId, _creationTime: _versionTime, ...version } = initial;
    await ctx.db.insert('sourceChecks', {
      sourceKey: url,
      monitor: { type: 'listing', url, format: 'rss' },
      fingerprint: 'baseline',
      text: '',
      lastCheckedAt: 0,
      listingInitialized: true,
    });
    await ctx.db.insert('sourceSeen', { sourceKey: url, url: 'https://agency.example/old' });
    for (let index = 0; index <= 500; index++) {
      const owner =
        index === 0
          ? original.owner
          : index === 500
            ? 'https://auth.example|bob'
            : `watcher-${index}`;
      if (index) {
        await ctx.db.insert('policies', { ...policy, owner });
        await ctx.db.insert('policyVersions', { ...version, owner });
      }
      await ctx.db.insert('workspaceSources', {
        owner,
        sourceKey: url,
        label: 'Shared feed',
        jurisdiction: 'federal',
        monitor: { type: 'listing', url, format: 'rss' },
        linkedRules: ['fair-lending'],
        paused: false,
        createdAt: Date.now(),
      });
    }
  });
  const fetch = fetcher((u) =>
    u.includes('api.openai.com')
      ? mockTriage([triaged()])
      : new Response(
          u === url ? feed(['https://agency.example/old', 'https://agency.example/new']) : pageText,
        ),
  );
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await alice.query(api.policies.updates, {})).toHaveLength(1);
  expect(await bob.query(api.policies.updates, {})).toHaveLength(1);
  const updates = await t.run((ctx) => ctx.db.query('policyUpdates').collect());
  expect(updates).toHaveLength(501);
  expect(new Set(updates.map((u) => u.owner)).size).toBe(501);
  expect(fetch.mock.calls.filter(([u]) => u === url)).toHaveLength(1);
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
}, 20000);
