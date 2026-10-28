import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { readableError, type Span } from '../review/openai';
import { mainText, listingEntries } from './listings';
import { fetchText, snapshot, federalRegister, hash, difference, type Signal } from './sources';
import { classify } from './classify';
import { loadLibraries, loadMonitors } from './loadLibraries';
import { isTransient } from './sourceJobs';
import type { Infer } from 'convex/values';
import type { sourceDraft } from './tables';

export const run = internalAction({
  args: { jobId: v.id('sourceJobs') },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const loaded = await ctx.runMutation(internal.policy.sourceJobs.start, { jobId });
    if (!loaded) return null;
    const { source: s, job } = loaded,
      spans: Span[] = [],
      signals: Signal[] = [],
      urls: string[] = [];
    let fingerprint = s.fingerprint,
      text = s.text,
      listingInitialized = s.listingInitialized,
      error: string | undefined;
    let drafts: { fingerprint: string; drafts: Infer<typeof sourceDraft>[] }[] = [];
    try {
      const monitors = await loadMonitors(ctx, s.sourceKey);
      if (!monitors.length) {
        await ctx.runMutation(internal.policy.sourceJobs.finish, {
          jobId,
          attempt: job.attempts,
          urls: [],
          signals: [],
          spans,
          transient: false,
        });
        return null;
      }
      if (s.sourceKey === 'federal-register') {
        signals.push(
          ...(await federalRegister(
            s.fingerprint || new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          )),
        );
        fingerprint = new Date(Date.now()).toISOString().slice(0, 10);
      } else if (s.monitor?.type === 'ecfr') {
        const snap = await snapshot(s);
        fingerprint = snap.fingerprint;
        text = snap.text;
        if (s.fingerprint && fingerprint > s.fingerprint)
          signals.push({
            fingerprint: `${s.sourceKey}:${fingerprint}`,
            keys: [],
            kind: 'amended',
            evidence: snap.evidence,
          });
      } else {
        const m = monitors.find((m) => m.type === 'page' || m.type === 'listing');
        if (!m) throw new Error('No page URL configured.');
        const html = await fetchText(m.url);
        const fullText = mainText(html);
        text = fullText.slice(0, 150000);
        fingerprint = await hash(fullText);
        if (monitors.some((m) => m.type === 'page')) {
          if (text.length < 100) throw new Error(`${m.url}: no substantive page text`);
          if (s.fingerprint && s.fingerprint !== fingerprint)
            signals.push({
              // Snapshot hashes may recur. The job identifies this occurrence
              // and remains stable across retries and replayed executions.
              fingerprint: `${s.sourceKey}:page:${jobId}:${fingerprint}`,
              keys: [],
              kind: 'page_changed',
              evidence: { url: m.url, excerpt: difference(s.text, fullText) },
            });
        }
        const entries = new Map<string, { url: string; title: string }>();
        for (const m of monitors)
          if (m.type === 'listing') for (const e of listingEntries(html, m)) entries.set(e.url, e);
        if (monitors.some((m) => m.type === 'listing')) {
          if (!entries.size) throw new Error('Listing contains no eligible URLs.');
          const listed = [...entries.keys()];
          if (listed.length > 500)
            throw new Error('Listing exceeds 500 eligible URLs; narrow the listing.');
          const unseen = await ctx.runQuery(internal.policy.monitorState.unseen, {
            sourceKey: s.sourceKey,
            urls: listed,
          });
          if (!s.listingInitialized) urls.push(...unseen);
          else {
            if (unseen.length > 100)
              throw new Error(
                'More than 100 new pages; source baseline retained for manual recovery.',
              );
            for (const url of unseen) {
              const html = await fetchText(url),
                excerpt = mainText(html);
              if (excerpt.length < 100) throw new Error(`${url}: no substantive page text`);
              signals.push({
                fingerprint: `${s.sourceKey}:url:${url}`,
                keys: [],
                kind: 'new_rule',
                evidence: {
                  url,
                  documentTitle:
                    entries.get(url)?.title ||
                    mainText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url),
                  excerpt: excerpt.slice(0, 14000),
                },
              });
              urls.push(url);
            }
          }
          listingInitialized = true;
        }
      }
      const unique = [...new Map(signals.map((s) => [s.fingerprint, s])).values()];
      const unknown = await ctx.runQuery(internal.policy.sourceJobs.unknown, {
        fingerprints: unique.map((s) => s.fingerprint),
      });
      const fresh = unique.filter((s) => unknown.includes(s.fingerprint));
      if (fresh.length) {
        const libraries = await loadLibraries(ctx, s.sourceKey);
        drafts = await classify(fresh, spans, libraries);
      }
    } catch (cause) {
      error = readableError(cause);
    }
    await ctx.runMutation(internal.policy.sourceJobs.finish, {
      jobId,
      attempt: job.attempts,
      fingerprint,
      text,
      listingInitialized,
      urls,
      signals: drafts,
      spans,
      error,
      transient: error ? isTransient(error) : false,
    });
    return null;
  },
});
