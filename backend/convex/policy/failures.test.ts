import { must } from './test.helpers';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { workspace, job, fetcher, pageText, feed } from './test.helpers';
import { runIsStale } from './sourceJobs';
import { httpUrl, detect } from './urls';
import { listingEntries } from './listings';
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('transient source errors retry three attempts via scheduler and retain last success and attempt spans', async () => {
  const { t, alice } = await workspace(),
    url = 'https://agency.example/guidance';
  fetcher(() => new Response(pageText));
  await alice.action(api.policy.sourceManagement.add, {
    url,
    jurisdiction: 'federal',
    linkedRules: [],
    watchLinks: false,
  });
  const before = must(
    (await alice.query(api.policy.sourceManagement.list, {})).find((s) => s.sourceKey === url),
  );
  const fetch = fetcher(
    () =>
      new Response('temporarily unavailable', { status: 503, statusText: 'Service Unavailable' }),
  );
  const jobId = await job(t, url);
  await t.action(internal.policy.checkSource.run, { jobId });
  expect(await t.run((ctx) => ctx.db.get('sourceJobs', jobId))).toMatchObject({
    status: 'queued',
    attempts: 1,
  });
  const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  expect(
    scheduled.some(
      (s) => s.name.includes('checkSource') && s.scheduledTime > Date.now() + 4 * 60000,
    ),
  ).toBe(true);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get('sourceJobs', jobId))).toMatchObject({
    status: 'failed',
    attempts: 3,
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('sourceAttempts')
        .withIndex('by_jobId', (q) => q.eq('jobId', jobId))
        .collect(),
    ),
  ).toHaveLength(3);
  const after = must(
    (await alice.query(api.policy.sourceManagement.list, {})).find((s) => s.sourceKey === url),
  );
  expect(after.lastSuccessAt).toBe(before.lastSuccessAt);
  expect(after.lastError).toContain('503');
  expect(after.jobStatus).toBe('failed');
  expect((await alice.query(api.policy.monitorState.badges, {})).failing).toBe(1);
});

test('permanent 404 and invalid feed stop without retry and cannot look unchanged', async () => {
  const { t, alice } = await workspace(),
    url = 'https://agency.example/feed';
  fetcher(() => new Response(feed(['https://agency.example/old'])));
  await alice.action(api.policy.sourceManagement.add, {
    url,
    jurisdiction: 'federal',
    linkedRules: [],
    watchLinks: false,
  });
  let fetch = fetcher(() => new Response('missing', { status: 404, statusText: 'Not Found' }));
  const id = await job(t, url);
  await t.action(internal.policy.checkSource.run, { jobId: id });
  expect(await t.run((ctx) => ctx.db.get('sourceJobs', id))).toMatchObject({
    status: 'failed',
    attempts: 1,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch = fetcher(() => new Response('<html>Not a feed</html>'));
  const invalid = await job(t, url);
  await t.action(internal.policy.checkSource.run, { jobId: invalid });
  expect(await t.run((ctx) => ctx.db.get('sourceJobs', invalid))).toMatchObject({
    status: 'failed',
    lastError: 'Expected an RSS or Atom feed.',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(
    alice.action(api.policy.sourceManagement.add, {
      url: 'file:///etc/passwd',
      jurisdiction: 'federal',
      linkedRules: [],
      watchLinks: false,
    }),
  ).rejects.toThrow('http or https');
});

test('daily staleness uses the persisted completed time even while another run is pending', async () => {
  const { t, alice } = await workspace(),
    now = Date.now();
  const finishedAt = now - 27 * 60 * 60 * 1000;
  await t.run(async (ctx) => {
    await ctx.db.insert('sourceRuns', {
      key: 'daily',
      status: 'succeeded',
      startedAt: finishedAt - 1000,
      finishedAt,
      errors: [],
      checked: 1,
      updates: 0,
    });
    await ctx.db.insert('sourceRuns', {
      key: 'daily',
      status: 'running',
      startedAt: now,
      errors: [],
      checked: 0,
      updates: 0,
    });
  });
  const status = await alice.query(api.policy.monitorState.latest, {});
  expect(status.completedAt).toBe(finishedAt);
  expect(runIsStale({ finishedAt: must(status.completedAt) }, now)).toBe(true);
  expect(runIsStale({ finishedAt: now - 26 * 60 * 60 * 1000 }, now)).toBe(false);
  expect(runIsStale(null, now)).toBe(true);
});

test('sources detect eCFR, Atom, sitemap, and links; parsers do not accept non-http schemes', () => {
  expect(
    detect('https://www.ecfr.gov/current/title-12/part-1026/section-1026.24', '', false),
  ).toEqual({ type: 'ecfr', title: 12, part: '1026', section: '1026.24' });
  expect(detect('https://agency.example/feed', '<feed></feed>', false)).toMatchObject({
    type: 'listing',
    format: 'rss',
  });
  expect(detect('https://agency.example/sitemap.xml', '<urlset></urlset>', false)).toMatchObject({
    type: 'listing',
    format: 'sitemap',
  });
  expect(detect('http://agency.example/page', '<main/>', true)).toMatchObject({
    type: 'listing',
    format: 'links',
  });
  expect(() => httpUrl('javascript:alert(1)')).toThrow('http or https');
  expect(
    listingEntries('<main><a href="javascript:alert(1)">Ignore</a><a href="/new">New</a></main>', {
      type: 'listing',
      format: 'links',
      url: 'http://agency.example/',
    }),
  ).toEqual([{ url: 'http://agency.example/new', title: 'New' }]);
});
