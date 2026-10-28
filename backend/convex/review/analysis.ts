import { v } from 'convex/values';
import { env, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { assetInput } from './mediaInput';
import type { Content, MediaContext } from './mediaInput';
import { callOpenAI, outputText, readableError } from './openai';
import type { Span } from './openai';
import { outputSchema } from './output';
import { parseAnalysis } from './parsing';
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
    };
    let result = null,
      error: string | undefined;
    try {
      if (!context.key)
        throw new Error(
          'OPENAI_API_KEY is missing from this Convex deployment. Configure it and retry analysis; you can still review by hand.',
        );
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
      for (const asset of loaded.assets) content.push(...(await assetInput(asset, context)));
      result = await callOpenAI({
        key: context.key,
        model: 'gpt-6.1-sol',
        operation: 'review',
        spans,
        body: JSON.stringify({
          model: 'gpt-6.1-sol',
          reasoning: { effort: 'high' },
          store: false,
          instructions: systemPrompt(loaded.review.product, loaded.review.channel, loaded.policies),
          input: [{ role: 'user', content }],
          text: {
            format: {
              type: 'json_schema',
              name: 'clearpath_review',
              strict: true,
              schema: outputSchema,
            },
          },
        }),
        parse: (body) =>
          parseAnalysis(
            outputText(body),
            loaded.assets,
            loaded.previous,
            context.texts,
            loaded.policies.map((p) => p.id),
          ),
      });
    } catch (failure) {
      error = readableError(failure);
    }
    const completion = { ...args, runKey: loaded.runKey, spans, extractions: context.extractions };
    try {
      await ctx.runMutation(internal.review.state.finish, { ...completion, result, error });
    } catch (failure) {
      await ctx.runMutation(internal.review.state.finish, {
        ...completion,
        result: null,
        error: `Unable to save the AI findings: ${readableError(failure)}`,
      });
    }
    return null;
  },
});
