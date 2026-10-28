import { v } from 'convex/values';
import { env, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { assetInput } from './mediaInput';
import type { Content, MediaContext } from './mediaInput';
import { readableError } from './openai';
import type { Span } from './openai';
import { runQuickCheck } from './quickCheckRun';
import { leads } from './quickCheckLogic';
import { reviewWithFrames } from './respond';
import { awaitExtractions } from './extractions';
import { systemPrompt } from './prompt';

export const run = internalAction({
  args: { reviewId: v.id('reviews'), version: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await ctx.runMutation(internal.review.state.start, args);
    if (!loaded) return null;
    const spans: Span[] = [];
    const context: MediaContext = {
      owner: loaded.review.owner,
      key: env.OPENAI_API_KEY ?? '',
      spans,
      cached: loaded.extractions,
      extractions: [],
      texts: new Map(),
      bytes: 0,
      notes: [],
    };
    const usage = { frameToolRounds: 0, frameToolFrames: 0, frameToolCeilingHit: false };
    let result = null,
      error: string | undefined;
    try {
      if (!context.key)
        throw new Error(
          'OPENAI_API_KEY is missing from this Convex deployment. Configure it and retry analysis; you can still review by hand.',
        );
      // Publish the fast rule picture before starting the detailed review.
      const quick = await runQuickCheck(
        ctx,
        loaded.review.owner,
        {
          assetIds: loaded.version.assetIds,
          product: loaded.review.product,
          channel: loaded.review.channel,
          jurisdictions: loaded.review.jurisdictions,
          offerTerms: loaded.review.offerTerms,
          notes: loaded.review.notes,
        },
        { ...args, runKey: loaded.runKey },
      );
      context.cached = await awaitExtractions(ctx, loaded.assets, loaded.review.owner);
      const content: Content[] = [
        {
          type: 'input_text',
          text: JSON.stringify({
            title: loaded.review.title,
            product: loaded.review.product,
            channel: loaded.review.channel,
            jurisdictions: loaded.review.jurisdictions,
            offerTerms: loaded.review.offerTerms,
            goLiveDate: loaded.review.goLiveDate,
            notes: loaded.review.notes,
            previousAcceptedFindings: loaded.previous.map((f) => ({
              findingId: f._id,
              severity: f.severity,
              policyId: f.policyId,
              title: f.title,
              explanation: f.explanation,
              suggestedFix: f.suggestedFix,
              location: f.location,
            })),
            responses: loaded.version.responses,
            submitterNote: loaded.version.submitterNote,
          }),
        },
      ];
      const hints = leads(quick.rules);
      if (hints) content.push({ type: 'input_text', text: hints });
      for (const asset of loaded.assets) content.push(...(await assetInput(asset, context)));
      result = await reviewWithFrames({
        context,
        content,
        assets: loaded.assets,
        previous: loaded.previous,
        instructions: systemPrompt(loaded.review.product, loaded.review.channel),
        usage,
      });
    } catch (failure) {
      error = readableError(failure);
    }
    if (usage.frameToolCeilingHit)
      context.notes?.push('Requested video frames were limited by the inspection ceiling.');
    const completion = {
      ...args,
      runKey: loaded.runKey,
      spans,
      extractions: context.extractions,
      extractionNotes: context.notes,
      ...usage,
    };
    try {
      await ctx.runMutation(internal.review.state.finish, { ...completion, result, error });
    } catch (failure) {
      await ctx.runMutation(internal.review.state.finish, {
        ...completion,
        extractions: [],
        result: null,
        error: `Unable to save the AI findings: ${readableError(failure)}`,
      });
    }
    return null;
  },
});
