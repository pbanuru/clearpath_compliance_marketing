import { httpUrl } from './urls';
import type { Doc } from '../_generated/dataModel';
import { record, string } from '../review/parsing';
import { mainText } from './listings';
import type { Infer } from 'convex/values';
import type { evidence } from './tables';

export type Signal = {
  fingerprint: string;
  keys: string[];
  evidence: Infer<typeof evidence>;
  kind: 'amended' | 'page_changed' | 'new_rule';
};
export async function fetchText(url: string) {
  httpUrl(url);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { Accept: 'application/json, application/xml, text/html, */*' },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${response.statusText}`);
  const text = await response.text();
  if (
    !text.trim() ||
    text.length > 6000000 ||
    /<title>[^<]*(?:access denied|just a moment|request access)/i.test(text)
  )
    throw new Error(`${url}: empty, oversized, or blocked source response`);
  return text;
}
export async function hash(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function difference(old: string, text: string) {
  let i = 0;
  while (i < old.length && i < text.length && old[i] === text[i]) i++;
  return `Previously: ${old.slice(Math.max(0, i - 160), i + 900)}\nNow: ${text.slice(Math.max(0, i - 160), i + 2200)}`;
}
export function retainedText(text: string) {
  if (new TextEncoder().encode(text).byteLength > 750000)
    throw new Error('Source text exceeds 750 KB; narrow the source to a section or smaller page.');
  return text;
}
export async function snapshot(row: Pick<Doc<'sourceChecks'>, 'monitor' | 'fingerprint' | 'text'>) {
  const m = row.monitor;
  if (!m || m.type === 'internal' || m.type === 'listing')
    throw new Error('Unsupported snapshot source.');
  if (m.type === 'page') {
    const text = retainedText(mainText(await fetchText(m.url)));
    if (text.length < 100) throw new Error(`${m.url}: no substantive page text`);
    return {
      fingerprint: await hash(text),
      text,
      evidence: { url: m.url, excerpt: difference(row.text, text) },
    };
  }
  const filters = new URLSearchParams({
    part: m.part,
    ...(m.section ? { section: m.section } : {}),
  });
  const base = 'https://www.ecfr.gov/api/versioner/v1';
  const obj = record(
    JSON.parse(await fetchText(`${base}/versions/title-${m.title}.json?${filters}`)),
  );
  const meta = record(obj.meta),
    date = string(meta.latest_amendment_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid eCFR amendment date.');
  const url = `https://www.ecfr.gov/current/title-${m.title}/part-${m.part}${m.section ? `/section-${m.section}` : ''}`;
  const at = async (date: string) =>
    retainedText(mainText(await fetchText(`${base}/full/${date}/title-${m.title}.xml?${filters}`)));
  // Repair date-only legacy baselines before comparing a newer amendment.
  const previous =
    row.text || (row.fingerprint && date > row.fingerprint ? await at(row.fingerprint) : '');
  const text = !row.fingerprint || !row.text || date > row.fingerprint ? await at(date) : row.text;
  return {
    fingerprint: date,
    text,
    evidence: {
      url,
      amendmentDate: date,
      excerpt: previous ? difference(previous, text) : text.slice(0, 10000),
    },
  };
}
export async function federalRegister(since: string): Promise<Signal[]> {
  const q = new URLSearchParams({
    per_page: '100',
    order: 'oldest',
    'conditions[publication_date][gte]': since,
  });
  for (const a of [
    'consumer-financial-protection-bureau',
    'federal-trade-commission',
    'federal-communications-commission',
  ])
    q.append('conditions[agencies][]', a);
  for (const t of ['RULE', 'PRORULE']) q.append('conditions[type][]', t);
  let url: string | null = `https://www.federalregister.gov/api/v1/documents.json?${q}`;
  const results: Signal[] = [];
  for (let page = 0; url && page < 10; page++) {
    const obj = record(JSON.parse(await fetchText(url)));
    if (!Array.isArray(obj.results)) throw new Error('Invalid Federal Register results.');
    for (const value of obj.results) {
      const d = record(value),
        number = string(d.document_number);
      results.push({
        fingerprint: `fr:${number}`,
        keys: [],
        kind: 'new_rule',
        evidence: {
          url: string(d.html_url),
          documentNumber: number,
          documentTitle: string(d.title),
          publicationDate: string(d.publication_date),
          excerpt: `${string(d.type)}: ${typeof d.abstract === 'string' ? d.abstract : ''}`.slice(
            0,
            12000,
          ),
        },
      });
    }
    url = typeof obj.next_page_url === 'string' ? obj.next_page_url : null;
  }
  if (url)
    throw new Error(
      'Federal Register backlog exceeds ten pages; cursor retained for manual recovery.',
    );
  return results;
}
