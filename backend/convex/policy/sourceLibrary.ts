import { v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import { policy, policies } from '../review/policies';
import { policyByKey, policyVersion } from './changes';
export const rules = internalQuery({
  args: { sourceKey: v.string() },
  returns: v.array(policy),
  handler: async (ctx, { sourceKey }) => {
    const watchers = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', sourceKey))
      .take(500);
    const library = new Map(
      policies.filter((p) => p.kind !== 'clearpath_standard').map((p) => [p.id, p]),
    );
    for (const w of watchers)
      if (!w.paused)
        for (const key of w.linkedRules) {
          const p = await policyByKey(ctx, w.owner, key),
            version = await policyVersion(ctx, p);
          library.set(key, {
            id: key,
            title: version.title,
            kind: p.kind,
            appliesTo: version.appliesTo,
            check: version.check,
            jurisdiction: p.jurisdiction,
            source: { label: p.source.label, url: p.source.url },
          });
        }
    return [...library.values()];
  },
});
