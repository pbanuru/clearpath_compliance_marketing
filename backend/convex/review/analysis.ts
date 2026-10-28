import { v } from 'convex/values';
import { internalAction } from '../_generated/server';

// Stable scheduler entry point; implemented by the pipeline follow-up commit.
export const run = internalAction({
  args: { reviewId: v.id('reviews'), version: v.number() },
  returns: v.null(),
  handler: () => null,
});
