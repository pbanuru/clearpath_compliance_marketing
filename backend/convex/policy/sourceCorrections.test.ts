import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { must, workspace } from './test.helpers';
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
test('corrected source URLs preserve pauses and removed sources, isolate owners, and share a single baseline job', async () => {
  const { t, alice, bob } = await workspace();
  await bob.mutation(api.policies.initialize, {});
  const current = 'https://search.ftc.gov/feeds/press-release.xml';
  const legacy = 'https://www.ftc.gov/feeds/press-release.xml';
  for (const client of [alice, bob]) {
    const s = must(
      (await client.query(api.policy.sourceManagement.list, {})).find(
        (s) => s.sourceKey === current,
      ),
    );
    await t.run((ctx) =>
      ctx.db.patch('workspaceSources', s._id, {
        sourceKey: legacy,
        monitor: { type: 'listing', url: legacy, format: 'rss' },
        paused: client === alice,
      }),
    );
  }
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', current))
      .unique();
    await ctx.db.delete('sourceChecks', must(s)._id);
  });
  await alice.mutation(api.policies.initialize, {});
  expect(
    (await alice.query(api.policy.sourceManagement.list, {})).find((s) => s.sourceKey === current)
      ?.paused,
  ).toBe(true);
  expect(
    (await bob.query(api.policy.sourceManagement.list, {})).some((s) => s.sourceKey === legacy),
  ).toBe(true);
  await bob.mutation(api.policies.initialize, {});
  expect(
    (await t.run((ctx) => ctx.db.query('sourceJobs').collect())).filter(
      (j) => j.sourceKey === current,
    ),
  ).toHaveLength(1);
  const s = must(
    (await alice.query(api.policy.sourceManagement.list, {})).find((s) => s.sourceKey === current),
  );
  await alice.mutation(api.policy.sourceManagement.remove, { id: s._id });
  await alice.mutation(api.policies.initialize, {});
  expect(
    (await alice.query(api.policy.sourceManagement.list, {})).some((s) => s.sourceKey === current),
  ).toBe(false);
});
