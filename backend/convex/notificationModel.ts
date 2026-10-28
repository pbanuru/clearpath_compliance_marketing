import { defineTable } from 'convex/server';
import { v, type Infer } from 'convex/values';
import type { MutationCtx } from './_generated/server';

const link = v.union(
  v.object({
    kind: v.literal('review'),
    id: v.id('reviews'),
    findingId: v.optional(v.id('findings')),
  }),
  v.object({ kind: v.literal('policyUpdate'), id: v.string() }),
  v.object({ kind: v.literal('source'), id: v.string() }),
);
const notification = v.object({
  type: v.union(
    v.literal('analysis_ready'),
    v.literal('analysis_failed'),
    v.literal('revision_received'),
    v.literal('recheck_reopened'),
    v.literal('policy_update'),
    v.literal('source_failing'),
  ),
  title: v.string(),
  body: v.optional(v.string()),
  link,
});
export const notificationTables = {
  notifications: defineTable({
    owner: v.string(),
    ...notification.fields,
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index('by_owner_and_createdAt', ['owner', 'createdAt'])
    .index('by_owner_and_readAt_and_createdAt', ['owner', 'readAt', 'createdAt']),
  notificationCounts: defineTable({ owner: v.string(), unread: v.number() }).index('by_owner', [
    'owner',
  ]),
};

export async function adjustUnread(ctx: MutationCtx, owner: string, delta: number) {
  const count = await ctx.db
    .query('notificationCounts')
    .withIndex('by_owner', (q) => q.eq('owner', owner))
    .unique();
  if (count) await ctx.db.patch('notificationCounts', count._id, { unread: count.unread + delta });
  else await ctx.db.insert('notificationCounts', { owner, unread: delta });
}

/** Call inside the event's mutation. Derive owner from the owned resource, never client input. */
export async function notify(ctx: MutationCtx, owner: string, value: Infer<typeof notification>) {
  const actor = await ctx.auth.getUserIdentity();
  if (actor?.tokenIdentifier === owner) return null;
  const id = await ctx.db.insert('notifications', {
    ...value,
    title: value.title.replace(/\s+/g, ' ').trim(),
    body: value.body?.replace(/\s+/g, ' ').trim(),
    owner,
    createdAt: Date.now(),
  });
  await adjustUnread(ctx, owner, 1);
  return id;
}
