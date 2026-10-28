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
