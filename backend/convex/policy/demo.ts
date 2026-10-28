import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { requireOwner } from '../assetAuth';
import { ensurePolicies } from './library';
import { createVersion, policyByKey, policyVersion } from './changes';
export const exampleText =
  'When an ad shows a representative payment example, it must also show the total amount repaid over the loan term.';
export const applyExample = mutation({
  args: { expectedVersion: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ensurePolicies(ctx, owner);
    const p = await policyByKey(ctx, owner, 'advertised-rate-available'),
      old = await policyVersion(ctx, p);
    if (p.currentVersion !== args.expectedVersion)
      throw new Error('The standard changed. Reload before applying the example update.');
    if (old.check.includes(exampleText))
      throw new Error('This example standard update has already been applied.');
    return createVersion(
      ctx,
      p,
      old,
      `${old.check} ${exampleText}`,
      'Payment examples must also show the total amount repaid.',
      'reviewer',
    );
  },
});
