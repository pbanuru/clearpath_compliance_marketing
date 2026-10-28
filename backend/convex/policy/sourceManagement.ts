import type { Id } from '../_generated/dataModel';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { action, mutation, query, internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { requireOwner } from '../assetAuth';
import { ensurePolicies, subscribe, sourceKey } from './library';
import { monitor } from './tables';
import { fetchText, hash, snapshot } from './sources';
import { mainText, listingEntries } from './listings';
import { readableError } from '../review/openai';
import { policyByKey } from './changes';
import { isTransient } from './sourceJobs';
import schema from '../schema';
import { httpUrl, detect } from './urls';

export const list = query({
  args: {},
  returns: v.array(
    schema.doc('workspaceSources').extend({
      lastCheckedAt: v.optional(v.number()),
      lastSuccessAt: v.optional(v.number()),
      lastError: v.optional(v.string()),
      lastChange: v.optional(v.number()),
      lastUpdateId: v.optional(v.id('policyUpdates')),
      attempts: v.number(),
      jobStatus: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx),
      rows = await ctx.db
        .query('workspaceSources')
        .withIndex('by_owner_and_sourceKey', (q) => q.eq('owner', owner))
        .take(250);
    return Promise.all(
      rows.map(async (r) => {
        const s = await ctx.db
          .query('sourceChecks')
          .withIndex('by_sourceKey', (q) => q.eq('sourceKey', r.sourceKey))
          .unique();
        const j = await ctx.db
          .query('sourceJobs')
          .withIndex('by_sourceKey', (q) => q.eq('sourceKey', r.sourceKey))
          .order('desc')
          .first();
        const change = await ctx.db
          .query('policyUpdates')
          .withIndex('by_owner_and_sourceKey', (q) =>
            q.eq('owner', owner).eq('sourceKey', r.sourceKey),
          )
          .order('desc')
          .first();
        return {
          ...r,
          lastCheckedAt: s?.lastCheckedAt,
          lastSuccessAt: s?.lastSuccessAt,
          lastError: s?.lastError,
          lastChange: change?.status === 'dismissed' ? undefined : change?.detectedAt,
          lastUpdateId: change?.status === 'dismissed' ? undefined : change?._id,
          attempts: j?.attempts ?? 0,
          jobStatus: j?.status ?? 'not_checked',
        };
      }),
    );
  },
});
export const setPaused = mutation({
  args: { id: v.id('workspaceSources'), paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx),
      s = await ctx.db.get('workspaceSources', args.id);
    if (!s || s.owner !== owner) throw new Error('Source not found.');
    await ctx.db.patch('workspaceSources', s._id, { paused: args.paused });
    return null;
  },
});
export const remove = mutation({
  args: { id: v.id('workspaceSources') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const owner = await requireOwner(ctx),
      s = await ctx.db.get('workspaceSources', id);
    if (!s || s.owner !== owner) throw new Error('Source not found.');
    await ctx.db.delete('workspaceSources', id);
    return null;
  },
});
export const register = internalMutation({
  args: {
    owner: v.string(),
    monitor,
    label: v.string(),
    jurisdiction: v.string(),
    linkedRules: v.array(v.string()),
    fingerprint: v.string(),
    text: v.string(),
    urls: v.array(v.string()),
    error: v.optional(v.string()),
    transient: v.boolean(),
    startedAt: v.number(),
  },
  returns: v.id('workspaceSources'),
  handler: async (ctx, args) => {
    await ensurePolicies(ctx, args.owner);
    if (!/^(federal|[A-Z]{2})$/.test(args.jurisdiction))
      throw new Error('Use federal or a two-letter state jurisdiction.');
    for (const key of args.linkedRules) await policyByKey(ctx, args.owner, key);
    const key = sourceKey(args.monitor),
      old = await ctx.db
        .query('sourceChecks')
        .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
        .unique();
    const patch = {
      lastCheckedAt: Date.now(),
      lastError: args.error,
      ...(!args.error ? { lastSuccessAt: Date.now() } : {}),
    };
    if (!old)
      await ctx.db.insert('sourceChecks', {
        sourceKey: key,
        monitor: args.monitor,
        fingerprint: args.fingerprint,
        text: args.text,
        listingInitialized: !args.error && args.monitor.type === 'listing',
        ...patch,
      });
    else
      await ctx.db.patch('sourceChecks', old._id, {
        ...patch,
        ...(!old.fingerprint && !args.error
          ? {
              fingerprint: args.fingerprint,
              text: args.text,
              listingInitialized: args.monitor.type === 'listing',
            }
          : {}),
      });
    if (args.monitor.type === 'listing' && !old?.listingInitialized && !args.error)
      for (const url of args.urls) {
        const seen = await ctx.db
          .query('sourceSeen')
          .withIndex('by_sourceKey_and_url', (q) => q.eq('sourceKey', key).eq('url', url))
          .unique();
        if (!seen) await ctx.db.insert('sourceSeen', { sourceKey: key, url });
      }
    if (args.monitor.type === 'listing' && !old?.listingInitialized && !args.error) {
      const s =
        old ??
        (await ctx.db
          .query('sourceChecks')
          .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
          .unique());
      if (s) await ctx.db.patch('sourceChecks', s._id, { listingInitialized: true });
    }
    const id = await subscribe(
      ctx,
      args.owner,
      args.monitor,
      args.label,
      args.linkedRules,
      key,
      args.jurisdiction,
    );
    await ctx.db.patch('workspaceSources', id, {
      label: args.label,
      jurisdiction: args.jurisdiction,
      monitor: args.monitor,
      linkedRules: args.linkedRules,
    });
    const retry = !!args.error && args.transient;
    const jobId = await ctx.db.insert('sourceJobs', {
      sourceKey: key,
      status: retry ? 'queued' : args.error ? 'failed' : 'succeeded',
      attempts: 1,
      lastError: args.error,
      startedAt: args.startedAt,
      finishedAt: retry ? undefined : Date.now(),
      ...(!args.error ? { lastSuccessAt: Date.now() } : {}),
    });
    await ctx.db.insert('sourceAttempts', {
      jobId,
      sourceKey: key,
      attempt: 1,
      startedAt: args.startedAt,
      durationMs: Date.now() - args.startedAt,
      status: args.error ? 'failed' : 'succeeded',
      error: args.error,
    });
    if (retry) await ctx.scheduler.runAfter(5 * 60000, internal.policy.checkSource.run, { jobId });
    return id;
  },
});
export const add = action({
  args: {
    url: v.string(),
    label: v.optional(v.string()),
    jurisdiction: v.string(),
    linkedRules: v.array(v.string()),
    watchLinks: v.boolean(),
  },
  returns: v.object({
    id: v.id('workspaceSources'),
    message: v.string(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx),
      url = httpUrl(args.url),
      startedAt = Date.now();
    let m: Infer<typeof monitor> = detect(url, '', args.watchLinks),
      text = '',
      fingerprint = '',
      urls: string[] = [],
      error: string | undefined;
    try {
      if (m.type === 'ecfr') {
        const s = await snapshot({ monitor: m, fingerprint: '', text: '' });
        fingerprint = s.fingerprint;
        text = s.text;
      } else {
        const html = await fetchText(url);
        m = detect(url, html, args.watchLinks);
        if (m.type === 'listing') {
          urls = listingEntries(html, m).map((e) => e.url);
          if (!urls.length) throw new Error('No items found in the listing.');
          fingerprint = await hash(mainText(html));
          text = mainText(html).slice(0, 150000);
        } else {
          const fullText = mainText(html);
          text = fullText.slice(0, 150000);
          if (text.length < 100) throw new Error('No substantive page text found.');
          fingerprint = await hash(fullText);
        }
      }
    } catch (cause) {
      error = readableError(cause);
    }
    const id: Id<'workspaceSources'> = await ctx.runMutation(
      internal.policy.sourceManagement.register,
      {
        owner,
        monitor: m,
        label: args.label?.trim() || new URL(url).hostname,
        jurisdiction: args.jurisdiction,
        linkedRules: args.linkedRules,
        fingerprint,
        text,
        urls,
        error,
        transient: error ? isTransient(error) : false,
        startedAt,
      },
    );
    return {
      id,
      error,
      message: error
        ? `Could not fetch: ${error}`
        : m.type === 'listing'
          ? `Found ${urls.length} items; you will be alerted to new ones.`
          : m.type === 'ecfr'
            ? `eCFR source connected. Latest amendment: ${fingerprint}.`
            : `Page connected; ${text.length.toLocaleString()} characters recorded as the baseline.`,
    };
  },
});
export const retry = mutation({
  args: { id: v.id('workspaceSources') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const owner = await requireOwner(ctx),
      s = await ctx.db.get('workspaceSources', id);
    if (!s || s.owner !== owner || s.paused) throw new Error('Active source not found.');
    const last = await ctx.db
      .query('sourceJobs')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', s.sourceKey))
      .order('desc')
      .first();
    if (
      last &&
      (last.status === 'running' ||
        last.status === 'queued' ||
        Date.now() - (last.finishedAt ?? 0) < 60000)
    )
      throw new Error('A check is running or finished recently. Try again in a minute.');
    const jobId = await ctx.db.insert('sourceJobs', {
      sourceKey: s.sourceKey,
      status: 'queued',
      attempts: 0,
    });
    await ctx.scheduler.runAfter(0, internal.policy.checkSource.run, { jobId });
    return null;
  },
});
