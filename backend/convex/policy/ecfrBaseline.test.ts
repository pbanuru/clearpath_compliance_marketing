import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { retainedText } from './sources';
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

test.each([false, true])(
  'eCFR retains the initial full text and sends a late amendment in triage evidence (legacy date-only: %s)',
  async (legacy) => {
    const { t, alice } = await workspace();
    const key = 'ecfr:12:1002:1002.4',
      prefix = 'An unchanged provision of this regulation. '.repeat(6000);
    const old = 'Lenders must disclose the payment amount.',
      next = 'Lenders must disclose the payment amount and the total amount repaid.';
    let amended = legacy;
    if (legacy)
      await t.run(async (ctx) => {
        const row = must(
          await ctx.db
            .query('sourceChecks')
            .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
            .unique(),
        );
        await ctx.db.patch('sourceChecks', row._id, { fingerprint: '2026-10-01', text: '' });
      });
    const fetch = fetcher((url, init) => {
      if (url.includes('api.openai.com')) {
        expect(init?.body).toContain(next);
        expect(init?.body).toContain(old);
        return mockTriage([triaged()]);
      }
      if (url.includes('/versions/'))
        return Response.json({
          meta: { latest_amendment_date: amended ? '2026-10-28' : '2026-10-01' },
        });
      expect(url).toMatch(/\/full\/2026-10-(01|28)\/title-12\.xml\?part=1002&section=1002.4/);
      return new Response(
        `<DIV1><P>${prefix}${url.includes('2026-10-28') ? next : old}</P></DIV1>`,
      );
    });
    const source = () =>
      t.run((ctx) =>
        ctx.db
          .query('sourceChecks')
          .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
          .unique(),
      );
    if (!legacy) {
      await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
      expect(must(await source()).text).toContain(old);
      expect(must(await source()).text.length).toBeGreaterThan(150000);
      expect(await alice.query(api.policies.updates, {})).toEqual([]);
      expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(0);
      amended = true;
    }
    await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
    await fanouts(t);
    const updates = await alice.query(api.policies.updates, {});
    expect(updates).toHaveLength(1);
    expect(updates[0]?.evidence.excerpt).toContain(next);
    expect(updates[0]?.evidence.excerpt).toContain(old);
    expect(must(await source()).text).toContain(next);
    await t.action(internal.policy.checkSource.run, { jobId: await job(t, key) });
    expect(fetch.mock.calls.filter(([u]) => u.includes('/full/'))).toHaveLength(2);
    expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
  },
);

test('oversized extracted baselines fail visibly instead of saving a text prefix', () => {
  expect(() => retainedText('x'.repeat(750001))).toThrow('Source text exceeds 750 KB');
});
