import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query, internalMutation, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { requireOwner } from './assetAuth';
import { adjustUnread } from './notificationModel';
import schema from './schema';

export const list = query({
  args: {
    filter: v.union(v.literal('all'), v.literal('unread')),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc('notifications')),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const rows = ctx.db.query('notifications');
    return args.filter === 'unread'
      ? rows
          .withIndex('by_owner_and_readAt_and_createdAt', (q) =>
            q.eq('owner', owner).eq('readAt', undefined),
          )
          .order('desc')
          .paginate(args.paginationOpts)
      : rows
          .withIndex('by_owner_and_createdAt', (q) => q.eq('owner', owner))
          .order('desc')
          .paginate(args.paginationOpts);
  },
});
export const unreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const row = await ctx.db
      .query('notificationCounts')
      .withIndex('by_owner', (q) => q.eq('owner', owner))
      .unique();
    return row?.unread ?? 0;
  },
});
export const markRead = mutation({
  args: { id: v.id('notifications') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const owner = await requireOwner(ctx);
    const row = await ctx.db.get('notifications', id);
    if (!row || row.owner !== owner) throw new ConvexError('Notification not found.');
    if (row.readAt === undefined) {
      await ctx.db.patch('notifications', id, { readAt: Date.now() });
      await adjustUnread(ctx, owner, -1);
    }
    return null;
  },
});

async function readBatch(ctx: MutationCtx, owner: string, through: number) {
  const rows = await ctx.db
    .query('notifications')
    .withIndex('by_owner_and_readAt_and_createdAt', (q) =>
      q.eq('owner', owner).eq('readAt', undefined).lte('createdAt', through),
    )
    .take(100);
  for (const row of rows) await ctx.db.patch('notifications', row._id, { readAt: through });
  if (rows.length) await adjustUnread(ctx, owner, -rows.length);
  if (rows.length === 100)
    await ctx.scheduler.runAfter(0, internal.notifications.continueMarkAllRead, { owner, through });
  return null;
}
export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    return readBatch(ctx, owner, Date.now());
  },
});
export const continueMarkAllRead = internalMutation({
  args: { owner: v.string(), through: v.number() },
  returns: v.null(),
  handler: (ctx, { owner, through }) => readBatch(ctx, owner, through),
});
