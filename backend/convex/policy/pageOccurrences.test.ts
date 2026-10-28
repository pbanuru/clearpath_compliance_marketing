import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { workspace, fetcher, mockTriage, triaged, job, fanouts, must } from './test.helpers';

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

test('recurring page text creates a new change occurrence while job replays and unchanged checks stay silent', async () => {
  const { t, alice, bob } = await workspace();
  const url = 'https://agency.example/marketing-guidance';
  let content = 'A';
  const fetch = fetcher((u) =>
    u.includes('api.openai.com')
      ? mockTriage([triaged()])
      : new Response(
          `<main>${`Requirement ${content}: disclose payment terms. `.repeat(10)}</main>`,
        ),
  );
  for (const user of [alice, bob])
    await user.action(api.policy.sourceManagement.add, {
      url,
      jurisdiction: 'federal',
      linkedRules: ['fair-lending'],
      watchLinks: false,
    });
  let completedJob;
  for (const [index, next] of ['B', 'C', 'B', 'C'].entries()) {
    content = next;
    completedJob = await job(t, url);
    await t.action(internal.policy.checkSource.run, { jobId: completedJob });
    await fanouts(t);
    expect(await alice.query(api.policies.updates, {})).toHaveLength(index + 1);
    expect(await bob.query(api.policies.updates, {})).toHaveLength(index + 1);
    if (index === 1) {
      const update = must(
        (await alice.query(api.policies.updates, {})).find((u) =>
          u.evidence.excerpt.includes('Requirement C'),
        ),
      );
      await alice.mutation(api.policies.apply, {
        updateId: update._id,
        check: 'Follow requirement C.',
        expectedVersion: 1,
      });
    }
  }
  const updates = await alice.query(api.policies.updates, {});
  expect(new Set(updates.map((u) => u.fingerprint)).size).toBe(4);
  expect(updates.filter((u) => u.status === 'applied')).toHaveLength(1);
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(4);
  const before = fetch.mock.calls.length;
  await t.action(internal.policy.checkSource.run, { jobId: must(completedJob) });
  expect(fetch.mock.calls).toHaveLength(before);
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  await fanouts(t);
  expect(await alice.query(api.policies.updates, {})).toHaveLength(4);
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(4);
});
