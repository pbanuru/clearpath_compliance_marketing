import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { listingEntries } from './listings';
import {
  workspace,
  feed,
  pageText,
  triaged,
  mockTriage,
  job,
  fanouts,
  fetcher,
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

test.each(['rss', 'atom', 'sitemap', 'links'] as const)(
  'query-addressed publication URLs are retained in %s listings',
  (format) => {
    const link = '/publication?id=123&amp;lang=en#passage';
    const contents = {
      rss: `<rss><channel><item><title>Guidance</title><link>${link}</link></item></channel></rss>`,
      atom: `<feed><entry><title>Guidance</title><link href="${link}"/></entry></feed>`,
      sitemap: `<urlset><url><loc>${link}</loc></url></urlset>`,
      links: `<main><a href="${link}">Guidance</a></main>`,
    };
    expect(
      listingEntries(contents[format], {
        type: 'listing',
        url: 'https://agency.example/feed',
        format: format === 'atom' ? 'rss' : format,
      }).map((entry) => entry.url),
    ).toEqual(['https://agency.example/publication?id=123&lang=en']);
  },
);

test('new query IDs are triaged once and already-seen query IDs stay silent', async () => {
  const { t, alice } = await workspace();
  const url = 'https://agency.example/feed.xml';
  let published = false;
  const fetch = fetcher((u) =>
    u.includes('api.openai.com')
      ? mockTriage([triaged()])
      : new Response(
          u === url
            ? feed(
                published
                  ? [
                      'https://agency.example/publication?id=1',
                      'https://agency.example/publication?id=2',
                    ]
                  : ['https://agency.example/publication?id=1'],
              )
            : pageText,
        ),
  );
  await alice.action(api.policy.sourceManagement.add, {
    url,
    jurisdiction: 'federal',
    linkedRules: [],
    watchLinks: false,
  });
  published = true;
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  await fanouts(t);
  expect((await alice.query(api.policies.updates, {}))[0]?.evidence.url).toBe(
    'https://agency.example/publication?id=2',
  );
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
  expect(await alice.query(api.policies.updates, {})).toHaveLength(1);
});

test('Atom selects the alternate HTML publication, regardless of self and enclosure ordering', async () => {
  const { t, alice } = await workspace();
  const url = 'https://agency.example/atom',
    article = 'https://agency.example/guidance?id=2';
  let published = false;
  const atom = () =>
    `<feed><entry><title>Old</title><link href="https://agency.example/old"/></entry>${published ? `<entry><title>Guidance</title><link href="https://agency.example/api/2" rel="self" type="application/atom+xml"/><link rel="enclosure" href="https://agency.example/audio.mp3"/><link rel="alternate" href="https://agency.example/data/2" type="application/json"/><link type="text/html" href="${article}" rel="alternate"/></entry>` : ''}</feed>`;
  const fetch = fetcher((u) =>
    u.includes('api.openai.com')
      ? mockTriage([triaged()])
      : new Response(u === url ? atom() : pageText),
  );
  await alice.action(api.policy.sourceManagement.add, {
    url,
    jurisdiction: 'federal',
    linkedRules: [],
    watchLinks: false,
  });
  published = true;
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  await fanouts(t);
  expect(fetch.mock.calls.filter(([u]) => u === article)).toHaveLength(1);
  expect(fetch.mock.calls.some(([u]) => /agency\.example\/(api|data)\//.test(u))).toBe(false);
  expect((await alice.query(api.policies.updates, {}))[0]?.evidence.url).toBe(article);
  await t.action(internal.policy.checkSource.run, { jobId: await job(t, url) });
  expect(fetch.mock.calls.filter(([u]) => u.includes('api.openai.com'))).toHaveLength(1);
});

test('Atom self-only links are not mistaken for publications; omitted rel means alternate', () => {
  const monitor = { type: 'listing', format: 'rss', url: 'https://agency.example/feed' } as const;
  expect(
    listingEntries('<feed><entry><link rel="self" href="/api/1"/></entry></feed>', monitor),
  ).toEqual([]);
  expect(
    listingEntries(
      '<feed><entry><link rel="self" href="/api/1"/><link href="/article/1" /></entry></feed>',
      monitor,
    )[0]?.url,
  ).toBe('https://agency.example/article/1');
});
