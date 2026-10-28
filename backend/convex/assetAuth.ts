import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

export async function requireOwner(ctx: Pick<QueryCtx | MutationCtx | ActionCtx, 'auth'>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Sign in to access your assets.');
  return identity.tokenIdentifier;
}
