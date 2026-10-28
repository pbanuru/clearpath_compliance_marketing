import { v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import { policy } from '../review/policies';
import type { Infer } from 'convex/values';
import { currentPolicies } from './library';
export type Library = { owners: string[]; rules: Infer<typeof policy>[] };
export const rules = internalQuery({
  args: { sourceKey: v.string() },
  returns: v.array(v.object({ owners: v.array(v.string()), rules: v.array(policy) })),
  handler: async (ctx, { sourceKey }) => {
    const watchers = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', sourceKey))
      .take(500);
    const libraries = new Map<string, Library>();
    for (const w of watchers)
      if (!w.paused) {
        const rules = (await currentPolicies(ctx, w.owner))
          .filter(
            (p) =>
              p.kind !== 'clearpath_standard' &&
              (!w.linkedRules.length || w.linkedRules.includes(p.key)),
          )
          .map((p) => ({
            id: p.key,
            title: p.title,
            kind: p.kind,
            appliesTo: p.appliesTo,
            check: p.check,
            jurisdiction: p.jurisdiction,
            source: { label: p.source.label, url: p.source.url },
          }));
        const key = JSON.stringify(rules);
        const existing = libraries.get(key);
        if (existing) existing.owners.push(w.owner);
        else libraries.set(key, { owners: [w.owner], rules });
      }
    return [...libraries.values()];
  },
});
