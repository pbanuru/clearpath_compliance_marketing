import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import {
  workspace,
  feed,
  pageText,
  triaged,
  mockTriage,
  job,
  fanouts,
  fetcher,
  requestLibraries,
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

test.each([false, true])(
  'shared publications resolve each workspace library without lost alerts (partial output: %s)',
  async (partial) => {
    const { t, alice, bob } = await workspace();
    const keys: string[] = [];
    for (const [index, user] of [alice, bob].entries())
      keys.push(
        await user.mutation(api.policy.customRules.add, {
          title: `State payment rule ${index}`,
          kind: 'state_rule',
          jurisdiction: index ? 'NY' : 'CA',
          check: `Workspace ${index} payment disclosure.`,
          appliesTo: {},
        }),
      );
    const url = 'https://agency.example/shared-feed.xml';
    let published = false;
    const fetch = fetcher((u, init) => {
      if (u.includes('api.openai.com')) {
        const libraries = requestLibraries(init);
        expect(libraries).toHaveLength(1);
        const key = libraries[0]?.rules[0]?.id;
        const index = keys.findIndex((candidate) => candidate === key);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(init?.body).not.toContain(keys[1 - index]);
        expect(init?.body).not.toContain('https://auth.example|');
        return mockTriage(
          partial && index === 1
            ? []
            : [
                {
                  ...triaged(key),
                  proposedCheck: `Updated workspace ${index} payment disclosure.`,
                },
              ],
        );
      }
      return new Response(
        u === url
          ? feed(
              published
                ? ['https://agency.example/old', 'https://agency.example/new']
                : ['https://agency.example/old'],
            )
          : pageText,
      );
    });
    for (const [index, user] of [alice, bob].entries())
      await user.action(api.policy.sourceManagement.add, {
        url,
        jurisdiction: 'federal',
        linkedRules: [keys[index] ?? ''],
        watchLinks: false,
      });
    published = true;
    fetch.mockClear();
    await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
    await fanouts(t);
    await fanouts(t);
    for (const [index, user] of [alice, bob].entries()) {
      const updates = await user.query(api.policies.updates, {});
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject(
        partial && index === 1
          ? { key: null, status: 'not_triaged' }
          : {
              key: keys[index],
              proposedCheck: `Updated workspace ${index} payment disclosure.`,
              status: 'open',
            },
      );
      expect(updates[0]).not.toHaveProperty('owners');
    }
    expect(fetch.mock.calls.filter(([u]) => u === url)).toHaveLength(1);
    expect(fetch.mock.calls.filter(([u]) => u === 'https://agency.example/new')).toHaveLength(1);
    expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(
      partial ? 3 : 2,
    );
    const before = fetch.mock.calls.length;
    await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
    expect(fetch.mock.calls).toHaveLength(before + 1);
  },
);
