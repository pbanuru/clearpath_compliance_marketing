import type { Infer } from 'convex/values';
import type { monitor } from './tables';
export function httpUrl(value: string) {
  const u = new URL(value.trim());
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Enter an http or https URL without embedded credentials.');
  u.hash = '';
  return u.href;
}
export function detect(url: string, text: string, watchLinks: boolean): Infer<typeof monitor> {
  const u = new URL(url),
    title = u.pathname.match(/title-(\d+)/)?.[1],
    part = u.pathname.match(/part-([\d]+)/)?.[1],
    section = u.pathname.match(/section-([\d.]+)/)?.[1];
  if (u.hostname === 'www.ecfr.gov' || u.hostname === 'ecfr.gov') {
    if (title && (part || section))
      return {
        type: 'ecfr',
        title: Number(title),
        part: part ?? section?.split('.')[0] ?? '',
        ...(section ? { section } : {}),
      };
  }
  if (/<(rss|feed)\b/i.test(text)) return { type: 'listing', url, format: 'rss' };
  if (/<(urlset|sitemapindex)\b/i.test(text)) return { type: 'listing', url, format: 'sitemap' };
  return watchLinks ? { type: 'listing', url, format: 'links' } : { type: 'page', url };
}
