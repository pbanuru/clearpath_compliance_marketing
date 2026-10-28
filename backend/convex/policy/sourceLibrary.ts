import { v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import { policy } from '../review/policies';
import type { Infer } from 'convex/values';
import { currentPolicies } from './library';
import { monitor } from './tables';
export type Library = { owners: string[]; keys: string[]; rules: Infer<typeof policy>[] };
export const monitors = internalQuery({
  args: { sourceKey: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ monitors: v.array(monitor), isDone: v.boolean(), cursor: v.string() }),
  handler: async (ctx, { sourceKey, cursor }) => {
    const page = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey_and_paused', (q) => q.eq('sourceKey', sourceKey).eq('paused', false))
      .paginate({ numItems: 100, maximumBytesRead: 1024 * 1024, cursor });
    return {
      monitors: [...new Map(page.page.map((s) => [JSON.stringify(s.monitor), s.monitor])).values()],
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});
export const rules = internalQuery({
  args: { sourceKey: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    libraries: v.array(
      v.object({ owners: v.array(v.string()), keys: v.array(v.string()), rules: v.array(policy) }),
    ),
    isDone: v.boolean(),
    cursor: v.string(),
  }),
  handler: async (ctx, { sourceKey, cursor }) => {
    const watchers = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey_and_paused', (q) => q.eq('sourceKey', sourceKey).eq('paused', false))
      .paginate({ numItems: 1, cursor });
    const libraries: Library[] = [];
    for (const w of watchers.page)
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
        libraries.push({
          owners: [w.owner],
          keys: [...new Set(w.linkedRules.filter((key) => rules.some((p) => p.id === key)))].sort(),
          rules,
        });
      }
    return { libraries, isDone: watchers.isDone, cursor: watchers.continueCursor };
  },
});
