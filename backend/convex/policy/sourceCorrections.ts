import type { MutationCtx } from '../_generated/server';
import { internal } from '../_generated/api';
// FTC's public search host serves the agency's pages and feeds; www returned 404/403 in QA.
export const correctedUrls: Record<string, string> = {
  'https://www.ftc.gov/feeds/press-release.xml': 'https://search.ftc.gov/feeds/press-release.xml',
  'https://www.ftc.gov/feeds/business-blog-gd.xml':
    'https://search.ftc.gov/feeds/business-blog-gd.xml',
  'https://www.ftc.gov/news-events/news/press-releases/2022/09/ftc-takes-action-stop-credit-karma-tricking-consumers-allegedly-false-pre-approved-credit-offers':
    'https://search.ftc.gov/legal-library/browse/cases-proceedings/2023138-credit-karma-llc',
  'https://www.ftc.gov/news-events/news/press-releases/2013/03/ftc-staff-revises-online-advertising-disclosure-guidelines':
    'https://search.ftc.gov/business-guidance/blog/2013/03/ftc-reboots-com-disclosures-four-key-points-one-possible-way-bypass-issue-altogether',
  'https://www.ftc.gov/legal-library/browse/enforcement-policy-statement-deceptively-formatted-advertisements':
    'https://search.ftc.gov/legal-library/browse/commission-enforcement-policy-statement-deceptively-formatted-advertisements',
};
export async function correctSources(ctx: MutationCtx, owner: string) {
  const policies = await ctx.db
    .query('policies')
    .withIndex('by_owner_and_key', (q) => q.eq('owner', owner))
    .take(250);
  for (const p of policies) {
    const url = p.source.url && correctedUrls[p.source.url];
    if (url && p.source.monitor.type === 'page')
      await ctx.db.patch('policies', p._id, {
        source: { ...p.source, url, monitor: { type: 'page', url } },
      });
  }
  const subscriptions = await ctx.db
    .query('workspaceSources')
    .withIndex('by_owner_and_sourceKey', (q) => q.eq('owner', owner))
    .take(250);
  for (const s of subscriptions) {
    const url = correctedUrls[s.sourceKey];
    if (!url || !('url' in s.monitor)) continue;
    const monitor = { ...s.monitor, url };
    const shared = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', url))
      .unique();
    if (!shared) {
      await ctx.db.insert('sourceChecks', {
        sourceKey: url,
        monitor,
        fingerprint: '',
        text: '',
        lastCheckedAt: 0,
      });
      const jobId = await ctx.db.insert('sourceJobs', {
        sourceKey: url,
        status: 'queued',
        attempts: 0,
      });
      await ctx.scheduler.runAfter(0, internal.policy.checkSource.run, { jobId });
    }
    const existing = await ctx.db
      .query('workspaceSources')
      .withIndex('by_owner_and_sourceKey', (q) => q.eq('owner', owner).eq('sourceKey', url))
      .unique();
    if (existing) {
      await ctx.db.patch('workspaceSources', existing._id, {
        linkedRules: [...new Set([...existing.linkedRules, ...s.linkedRules])],
      });
      await ctx.db.delete('workspaceSources', s._id);
    } else await ctx.db.patch('workspaceSources', s._id, { sourceKey: url, monitor });
  }
}
