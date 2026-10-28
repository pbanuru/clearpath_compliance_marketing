import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import { matches } from './library';
import { seedCitations } from './citationSeeds';

export async function policyByKey(ctx: QueryCtx, owner: string, key: string) {
  const p = await ctx.db
    .query('policies')
    .withIndex('by_owner_and_key', (q) => q.eq('owner', owner).eq('key', key))
    .unique();
  if (!p) throw new ConvexError('Policy not found.');
  return p;
}
export async function policyVersion(ctx: QueryCtx, p: Doc<'policies'>) {
  const version = await ctx.db
    .query('policyVersions')
    .withIndex('by_owner_and_key_and_version', (q) =>
      q.eq('owner', p.owner).eq('key', p.key).eq('version', p.currentVersion),
    )
    .unique();
  if (!version) throw new ConvexError('Policy version not found.');
  return version;
}
export async function candidates(
  ctx: QueryCtx,
  owner: string,
  appliesTo: Doc<'policyVersions'>['appliesTo'],
  jurisdiction?: string,
) {
  const rows = await ctx.db
    .query('reviews')
    .withIndex('by_owner_and_status_and_updatedAt', (q) =>
      q.eq('owner', owner).eq('status', 'approved'),
    )
    .take(501);
  if (rows.length > 500)
    throw new ConvexError(
      'This workspace exceeds 500 approved reviews. A batched rollout is required.',
    );
  return rows.filter((r) => r.usage !== 'retired' && matches({ appliesTo, jurisdiction }, r));
}
export function validateText(check: string, summary: string) {
  if (!check.trim() || check.length > 12000 || !summary.trim() || summary.length > 2000)
    throw new ConvexError(
      'Enter a check (up to 12,000 characters) and change summary (up to 2,000).',
    );
}
export async function createVersion(
  ctx: MutationCtx,
  p: Doc<'policies'>,
  old: Pick<Doc<'policyVersions'>, 'title' | 'appliesTo' | 'check' | 'jurisdiction'>,
  check: string,
  summary: string,
  createdBy: 'reviewer' | 'source_update',
) {
  validateText(check, summary);
  const version = p.currentVersion + 1;
  const versionId = await ctx.db.insert('policyVersions', {
    owner: p.owner,
    key: p.key,
    version,
    title: old.title,
    jurisdiction: old.jurisdiction,
    appliesTo: old.appliesTo,
    check: check.trim(),
    changeSummary: summary.trim(),
    createdBy,
    createdAt: Date.now(),
  });
  const citationUrl = seedCitations[p.key]?.url ?? p.source.url;
  if (p.kind !== 'clearpath_standard' && citationUrl)
    await ctx.scheduler.runAfter(0, internal.policy.citations.retrieve, {
      id: versionId,
      url: citationUrl,
      expectedStart: seedCitations[p.key]?.excerpt.slice(0, 80),
    });
  await ctx.db.patch('policies', p._id, { currentVersion: version, lastChangedAt: Date.now() });
  const rows = await candidates(ctx, p.owner, old.appliesTo, old.jurisdiction);
  for (const r of rows) {
    const id = await ctx.db.insert('policyRechecks', {
      owner: p.owner,
      reviewId: r._id,
      version: r.currentVersion,
      key: p.key,
      fromVersion: p.currentVersion,
      toVersion: version,
      title: old.title,
      changeSummary: summary.trim(),
      oldCheck: old.check,
      newCheck: check.trim(),
      createdAt: Date.now(),
      status: 'queued',
    });
    await ctx.db.patch('reviews', r._id, { pendingRechecks: (r.pendingRechecks ?? 0) + 1 });
    await ctx.scheduler.runAfter(0, internal.policy.recheck.run, { id });
  }
  return rows.length;
}
