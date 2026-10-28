import type { Infer } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { policies as seeds, policy } from '../review/policies';
import { listingSources } from './listings';
import type { monitor } from './tables';
import { seedCitations } from './citationSeeds';
import { correctSources } from './sourceCorrections';

const ecfr: Record<string, [number, string, string?]> = {
  'closed-end-trigger-terms': [12, '1026', '1026.24'],
  'closed-end-rate-as-apr': [12, '1026', '1026.24'],
  'open-end-trigger-terms': [12, '1026', '1026.16'],
  'card-promo-rate': [12, '1026', '1026.16'],
  'prequal-not-preapproval': [12, '1014'],
  'fair-lending': [12, '1002', '1002.4'],
  'email-can-spam': [16, '316'],
  'sms-tcpa': [47, '64', '64.1200'],
  endorsements: [16, '255'],
};
export function seedMonitor(p: Infer<typeof policy>): Infer<typeof monitor> {
  if (p.kind === 'clearpath_standard') return { type: 'internal' };
  const cfr = ecfr[p.id];
  if (cfr)
    return { type: 'ecfr', title: cfr[0], part: cfr[1], ...(cfr[2] ? { section: cfr[2] } : {}) };
  if (!p.source.url) throw new Error('External seed needs a source URL.');
  return { type: 'page', url: p.source.url };
}
export function sourceKey(m: Infer<typeof monitor>) {
  return m.type === 'ecfr'
    ? `ecfr:${m.title}:${m.part}:${m.section ?? ''}`
    : m.type === 'page'
      ? m.url
      : m.type === 'listing'
        ? m.url
        : 'internal';
}
export async function ensurePolicies(ctx: MutationCtx, owner: string) {
  await correctSources(ctx, owner);
  const exists = await ctx.db
    .query('policyWorkspaces')
    .withIndex('by_owner', (q) => q.eq('owner', owner))
    .unique();
  if (!exists) await ctx.db.insert('policyWorkspaces', { owner });
  const current = await ctx.db
    .query('policies')
    .withIndex('by_owner_and_key', (q) => q.eq('owner', owner))
    .take(250);
  const known = new Set(current.map((p) => p.key));
  for (const p of seeds) {
    if (known.has(p.id)) {
      const initial = await ctx.db
        .query('policyVersions')
        .withIndex('by_owner_and_key_and_version', (q) =>
          q.eq('owner', owner).eq('key', p.id).eq('version', 1),
        )
        .unique();
      if (initial?.createdBy === 'seed' && !initial.citation && seedCitations[p.id])
        await ctx.db.patch('policyVersions', initial._id, { citation: seedCitations[p.id] });
      continue;
    }
    const now = Date.now();
    const m = seedMonitor(p);
    if (m.type !== 'internal') await subscribe(ctx, owner, m, p.source.label, [p.id]);
    if (m.type !== 'internal') {
      const sk = sourceKey(m);
      const existing = await ctx.db
        .query('sourceChecks')
        .withIndex('by_sourceKey', (q) => q.eq('sourceKey', sk))
        .unique();
      if (!existing)
        await ctx.db.insert('sourceChecks', {
          sourceKey: sk,
          monitor: m,
          fingerprint: '',
          text: '',
          lastCheckedAt: 0,
        });
    }
    await ctx.db.insert('policies', {
      owner,
      key: p.id,
      kind: p.kind,
      currentVersion: 1,
      source: { ...p.source, monitor: seedMonitor(p) },
      lastChangedAt: now,
    });
    await ctx.db.insert('policyVersions', {
      owner,
      key: p.id,
      version: 1,
      title: p.title,
      appliesTo: p.appliesTo,
      check: p.check,
      changeSummary: 'Initial policy library.',
      createdBy: 'seed',
      createdAt: now,
      citation: seedCitations[p.id],
    });
  }
  if (exists) return;
  for (const m of listingSources)
    if (m.type === 'listing')
      await subscribe(
        ctx,
        owner,
        m,
        new URL(m.url).hostname.includes('ftc')
          ? m.url.includes('press-release')
            ? 'FTC press releases'
            : 'FTC business guidance'
          : m.format === 'sitemap'
            ? 'CFPB guidance and circulars'
            : 'CFPB newsroom',
        [],
      );
  await subscribe(
    ctx,
    owner,
    { type: 'page', url: 'https://www.federalregister.gov/api/v1/documents.json' },
    'Federal Register rules and proposals',
    [],
    'federal-register',
  );
}
export async function subscribe(
  ctx: MutationCtx,
  owner: string,
  m: Infer<typeof monitor>,
  label: string,
  linkedRules: string[],
  key = sourceKey(m),
  jurisdiction = 'federal',
) {
  if (m.type !== 'internal') {
    const existing = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', key))
      .unique();
    if (!existing)
      await ctx.db.insert('sourceChecks', {
        sourceKey: key,
        monitor: m,
        fingerprint: '',
        text: '',
        lastCheckedAt: 0,
      });
  }

  const existing = await ctx.db
    .query('workspaceSources')
    .withIndex('by_owner_and_sourceKey', (q) => q.eq('owner', owner).eq('sourceKey', key))
    .unique();
  if (existing) {
    await ctx.db.patch('workspaceSources', existing._id, {
      linkedRules: [...new Set([...existing.linkedRules, ...linkedRules])],
    });
    return existing._id;
  }
  const allSources = await ctx.db
    .query('workspaceSources')
    .withIndex('by_owner_and_sourceKey', (q) => q.eq('owner', owner))
    .take(250);
  if (allSources.length >= 250)
    throw new Error(
      'This workspace supports up to 250 sources. Remove a source before adding another.',
    );
  return ctx.db.insert('workspaceSources', {
    owner,
    sourceKey: key,
    label,
    jurisdiction,
    monitor: m,
    linkedRules,
    paused: false,
    createdAt: Date.now(),
  });
}
export async function currentPolicies(ctx: QueryCtx, owner: string) {
  const rows = await ctx.db
    .query('policies')
    .withIndex('by_owner_and_key', (q) => q.eq('owner', owner))
    .take(250);
  return Promise.all(
    rows.map(async (p) => {
      const version = await ctx.db
        .query('policyVersions')
        .withIndex('by_owner_and_key_and_version', (q) =>
          q.eq('owner', owner).eq('key', p.key).eq('version', p.currentVersion),
        )
        .unique();
      if (!version) throw new Error('Policy version unavailable.');
      return {
        ...p,
        id: p.key,
        title: version.title,
        appliesTo: version.appliesTo,
        check: version.check,
        citation: version.citation,
        citationError: version.citationError,
      };
    }),
  );
}
export function matches(
  p: { appliesTo: Infer<typeof policy>['appliesTo']; jurisdiction?: string },
  r: { product: string; channel: string; jurisdictions?: string[] },
) {
  return (
    (!p.jurisdiction ||
      p.jurisdiction === 'federal' ||
      !r.jurisdictions ||
      r.jurisdictions.includes('US') ||
      r.jurisdictions.includes(p.jurisdiction)) &&
    (!p.appliesTo.products?.length || p.appliesTo.products.includes(r.product)) &&
    (!p.appliesTo.channels?.length || p.appliesTo.channels.includes(r.channel))
  );
}
