import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { workspace, fetcher, job, fanouts, must, mockTriage, triaged } from './test.helpers';

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

test('page registration retains a complete baseline for a late edit before the first monitor check', async () => {
  const { t, alice } = await workspace();
  const url = 'https://agency.example/long-page',
    prefix = 'Unchanged paragraph. '.repeat(8000);
  let amended = false;
  const old = 'Disclose the payment amount.',
    next = 'Disclose the payment amount and total repaid.';
  const fetch = fetcher((u, init) => {
    if (u.includes('api.openai.com')) {
      expect(init?.body).toContain(old);
      expect(init?.body).toContain(next);
      return mockTriage([triaged()]);
    }
    return new Response(`<main>${prefix}${amended ? next : old}</main>`);
  });
  await alice.action(api.policy.sourceManagement.add, {
    url,
    jurisdiction: 'federal',
    linkedRules: ['fair-lending'],
    watchLinks: false,
  });
  const source = () =>
    t.run((ctx) =>
      ctx.db
        .query('sourceChecks')
        .withIndex('by_sourceKey', (q) => q.eq('sourceKey', url))
        .unique(),
    );
  expect(must(await source()).text).toContain(old);
  expect(must(await source()).text.length).toBeGreaterThan(150000);
  amended = true;
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  await fanouts(t);
  const updates = await alice.query(api.policies.updates, {});
  expect(updates).toHaveLength(1);
  expect(updates[0]?.evidence.excerpt).toContain(next);
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
});

test.each(['page', 'ecfr'] as const)(
  'all %s changed regions reach triage; changes over the evidence budget stop without advancing',
  async (kind) => {
    const { t, alice } = await workspace();
    const url = 'https://agency.example/multiple-changes',
      key = kind === 'page' ? url : 'ecfr:12:1002:1002.4';
    const oldRule = 'Disclose the payment amount.',
      newRule = 'Disclose the total amount repaid.';
    let amended = false,
      wide = false;
    const body = () =>
      `${amended ? 'Updated heading.' : 'Original heading.'} ${'Unchanged paragraph. '.repeat(wide ? 800 : 200)} ${amended ? newRule : oldRule}`;
    const fetch = fetcher((u, init) => {
      if (u.includes('api.openai.com')) {
        expect(init?.body).toContain('Updated heading.');
        expect(init?.body).toContain(newRule);
        expect(init?.body).toContain(oldRule);
        return mockTriage([triaged()]);
      }
      return u.includes('/versions/')
        ? Response.json({
            meta: {
              latest_amendment_date: wide ? '2026-10-29' : amended ? '2026-10-28' : '2026-10-01',
            },
          })
        : new Response(`<main>${body()}</main>`);
    });
    if (kind === 'page')
      await alice.action(api.policy.sourceManagement.add, {
        url,
        jurisdiction: 'federal',
        linkedRules: ['fair-lending'],
        watchLinks: false,
      });
    else await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
    amended = true;
    await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
    await fanouts(t);
    const updates = await alice.query(api.policies.updates, {});
    expect(updates).toHaveLength(1);
    expect(updates[0]?.evidence.excerpt).toContain('Updated heading.');
    expect(updates[0]?.evidence.excerpt).toContain(newRule);
    const source = () =>
      t.run((ctx) =>
        ctx.db
          .query('sourceChecks')
          .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
          .unique(),
      );
    // A later, much larger amendment cannot fit. Its baseline must remain retryable.
    wide = true;
    amended = false;
    const id = await job(t, key);
    const before = must(await source());
    await t.action(internal.policy.checkSource.run, { jobId: id });
    const after = must(await source());
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.text).toBe(before.text);
    expect(after.lastError).toContain('Changed source evidence exceeds 14,000 characters');
    expect(await t.run((ctx) => ctx.db.get('sourceJobs', id))).toMatchObject({ status: 'failed' });
    expect(await alice.query(api.policies.updates, {})).toHaveLength(1);
    expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
  },
);
