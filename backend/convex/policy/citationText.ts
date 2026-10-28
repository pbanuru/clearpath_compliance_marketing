import { mainText } from './listings';
import { fetchText } from './sources';
import { record } from '../review/parsing';

/** Return an exact contiguous passage, shortening only at a sentence boundary. */
export function passage(text: string) {
  const clipped = text.slice(0, 600);
  const end = clipped.lastIndexOf('. ');
  return text.length > 600 && end > 100 ? clipped.slice(0, end + 1) : clipped;
}
export async function retrieveCitation(url: string, check: string, expectedStart?: string) {
  const target = new URL(url);
  const section = target.pathname.match(/section-([\d.]+)/)?.[1];
  const title = target.pathname.match(/title-(\d+)/)?.[1];
  let excerpt: string;
  if (target.hostname === 'www.ecfr.gov' && section && title) {
    const filters = new URLSearchParams({ part: section.split('.')[0] ?? '', section });
    const base = 'https://www.ecfr.gov/api/versioner/v1';
    const metadata = record(
      JSON.parse(await fetchText(`${base}/versions/title-${title}.json?${filters}`)),
    );
    const date: unknown = record(metadata.meta).latest_issue_date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error('Citation: invalid eCFR issue date.');
    const xml = await fetchText(`${base}/full/${date}/title-${title}.xml?${filters}`);
    const paragraphs = [...xml.matchAll(/<P\b[^>]*>([\s\S]*?)<\/P>/g)].map((m) =>
      mainText(m[1] ?? ''),
    );
    const components = decodeURIComponent(target.hash).match(/\(([^)]+)\)/g);
    const prefix = components?.at(-1);
    const found = paragraphs.find((p) =>
      expectedStart ? p.startsWith(expectedStart) : prefix ? p.startsWith(prefix) : p.length > 80,
    );
    if (!found) throw new Error('Citation: eCFR paragraph not found.');
    excerpt = passage(found);
  } else {
    const html = await fetchText(target.origin + target.pathname + target.search);
    const main =
      html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? html;
    const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => mainText(m[1] ?? ''))
      .filter((p) => p.length >= 80);
    const words = new Set(check.toLowerCase().match(/[a-z]{5,}/g) ?? []);
    const score = (p: string) => [...words].filter((w) => p.toLowerCase().includes(w)).length;
    paragraphs.sort((a, b) => score(b) - score(a));
    if (!paragraphs[0] || score(paragraphs[0]) < 2)
      throw new Error('Citation: no matching substantive passage found.');
    excerpt = passage(paragraphs[0]);
    target.hash = ':~:text=' + encodeURIComponent(excerpt.slice(0, 100));
  }
  return { url: target.href, excerpt, retrievedAt: Date.now() };
}
