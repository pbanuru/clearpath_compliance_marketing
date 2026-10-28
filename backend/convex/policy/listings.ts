import type { Infer } from 'convex/values';
import type { monitor } from './tables';

export const listingSources: Infer<typeof monitor>[] = [
  {
    type: 'listing',
    url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/',
    format: 'rss',
  },
  // Circulars now redirect to Guidance; the official sitemap retains both paths.
  { type: 'listing', url: 'https://www.consumerfinance.gov/sitemap.xml', format: 'sitemap' },
  { type: 'listing', url: 'https://search.ftc.gov/feeds/press-release.xml', format: 'rss' },
  { type: 'listing', url: 'https://search.ftc.gov/feeds/business-blog-gd.xml', format: 'rss' },
];
export function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
      const code = n.startsWith('x') ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, n: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n] ?? '',
    );
}
export function mainText(html: string) {
  const main = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? html;
  return decode(
    main
      .replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}
function publicationLink(body: string) {
  const rss = body.match(/<link\b[^>]*>([^<]+|<!\[CDATA\[[\s\S]*?\]\]>)<\/link>/i)?.[1];
  if (rss) return rss;
  const links = [...body.matchAll(/<link\b([^>]*)>/gi)]
    .map((match) => {
      const attributes = new Map(
        [...(match[1] ?? '').matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((a) => [
          a[1]?.toLowerCase(),
          a[3],
        ]),
      );
      return {
        url: attributes.get('href'),
        rel: attributes.get('rel'),
        type: attributes.get('type'),
      };
    })
    .filter((link) => link.url && (!link.rel || link.rel === 'alternate'));
  return (
    links.find((link) => !link.type || /^(text\/html|application\/xhtml\+xml)$/i.test(link.type)) ??
    links[0]
  )?.url;
}
export function listingEntries(
  text: string,
  m: Extract<Infer<typeof monitor>, { type: 'listing' }>,
) {
  const entries: { url: string; title: string }[] = [];
  if (m.format === 'rss') {
    if (!/<(?:rss|feed)\b/i.test(text)) throw new Error('Expected an RSS or Atom feed.');
    for (const match of text.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)) {
      const body = match[1] ?? '';
      const url = publicationLink(body);
      if (url)
        entries.push({
          url: decode(url).trim(),
          title: mainText(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
        });
    }
  } else if (m.format === 'sitemap') {
    if (/<sitemapindex\b/i.test(text))
      throw new Error('Use a leaf sitemap URL, not a sitemap index.');
    if (!/<urlset\b/i.test(text)) throw new Error('Expected a sitemap URL set.');
    for (const loc of text.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi))
      entries.push({ url: decode(loc[1] ?? ''), title: '' });
  } else {
    const main = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? text;
    for (const a of main.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
      entries.push({ url: decode(a[1] ?? ''), title: mainText(a[2] ?? '') });
  }
  const unique = new Map<string, { url: string; title: string }>();
  for (const e of entries) {
    try {
      const u = new URL(e.url, m.url);
      u.hash = '';
      if (!['http:', 'https:'].includes(u.protocol) || u.pathname.match(/\.(pdf|zip|png|jpg)$/i))
        continue;
      // Restrict the broad CFPB sitemap to compliance guidance, including circulars.
      if (
        m.url === 'https://www.consumerfinance.gov/sitemap.xml' &&
        !/^\/compliance\/(circulars|guidance)\//.test(u.pathname)
      )
        continue;
      unique.set(u.href, { url: u.href, title: e.title });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // Invalid URL links are not eligible source items.
    }
  }
  return [...unique.values()];
}
