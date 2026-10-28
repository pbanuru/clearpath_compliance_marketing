import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity } from '../reviewTest.helpers';
import { subscribe } from './library';
import { workspace, fetcher, must } from './test.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('global run summaries never expose private source URLs or errors from another workspace', async () => {
  const { t, alice, bob } = await workspace();
  const url = 'https://agency.example/private-source?customer=alice-secret';
  await t.run((ctx) =>
    subscribe(ctx, aliceIdentity.tokenIdentifier, { type: 'page', url }, 'Private source', []),
  );
  const runId = must(await t.mutation(internal.policy.monitorState.begin, {}));
  const jobId = await t.run((ctx) =>
    ctx.db.insert('sourceJobs', {
      sourceKey: url,
      runId,
      status: 'queued',
      attempts: 0,
    }),
  );
  fetcher(() => new Response('Missing', { status: 404, statusText: 'Not Found' }));
  await t.action(internal.policy.checkSource.run, { jobId });
  const internalRun = must(await t.run((ctx) => ctx.db.get('sourceRuns', runId)));
  expect(internalRun.errors.join(' ')).toContain('alice-secret');
  for (const owner of [alice, bob]) {
    const summary = await owner.query(api.policy.monitorState.latest, {});
    expect(summary.last).not.toHaveProperty('errors');
    expect(JSON.stringify(summary)).not.toContain('alice-secret');
    expect(JSON.stringify(summary)).not.toContain('private-source');
  }
  const ownSources = await alice.query(api.policy.sourceManagement.list, {});
  expect(ownSources.find((s) => s.sourceKey === url)?.lastError).toContain('404');
  expect(await bob.query(api.policy.sourceManagement.list, {})).toEqual([]);
});
