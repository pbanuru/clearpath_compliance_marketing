import type { QueryCtx } from '../_generated/server';

export const RULE_LIMIT = 250;
export const capacityError = `This workspace supports up to ${RULE_LIMIT} rules.`;

export async function policyRows(ctx: QueryCtx, owner: string) {
  const rows = await ctx.db
    .query('policies')
    .withIndex('by_owner_and_key', (q) => q.eq('owner', owner))
    .take(RULE_LIMIT + 1);
  if (rows.length > RULE_LIMIT)
    throw new Error('This workspace exceeds its rule limit. Review the library before continuing.');
  return rows;
}

export async function requireRuleCapacity(ctx: QueryCtx, owner: string) {
  if ((await policyRows(ctx, owner)).length >= RULE_LIMIT) throw new Error(capacityError);
}
