'use node';
import { v } from 'convex/values';
import { env, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { storage } from './assetStorage';
import { extractionKind } from './review/videoTypes';
import { transcript } from './review/mediaInput';
import type { MediaContext } from './review/mediaInput';
import { videoTimeline, VIDEO_MODEL } from './review/gemini';
import { readableError } from './review/openai';
import { boundTranscript } from './review/transcriptLimits';
import { VideoLengthError } from './videoLimits';

export const run = internalAction({
  args: { assetId: v.id('assets'), kind: extractionKind },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await ctx.runMutation(internal.assetExtractionState.start, args);
    if (!loaded) return null;
    const { asset, runKey } = loaded;
    const context: MediaContext = {
      owner: asset.owner,
      key: env.OPENAI_API_KEY ?? '',
      assemblyKey: env.ASSEMBLYAI_API_KEY,
      spans: [],
      cached: [],
      extractions: [],
      texts: new Map(),
      bytes: 0,
    };
    let result: {
      segments: { start: number; end: number; text: string }[];
      model: string;
      words?: { start: number; end: number; text: string }[];
      wordsTruncated?: boolean;
      segmentsTruncated?: boolean;
      totalSegments?: number;
      durationSeconds?: number;
      timeline?: Awaited<ReturnType<typeof videoTimeline>>['timeline'];
      error?: string;
    } = { segments: [], model: args.kind === 'transcript' ? 'universal-3-5-pro' : VIDEO_MODEL };
    try {
      if (args.kind === 'video_timeline' && asset.kind === 'video')
        result = {
          segments: [],
          ...(await videoTimeline(
            asset,
            env.GEMINI_API_KEY ?? '',
            await storage.getUrl(asset.content.original.key, { expiresIn: 900 }),
            context.spans,
          )),
        };
      else if (args.kind === 'transcript' && (asset.kind === 'audio' || asset.kind === 'video')) {
        await transcript(asset, context);
        const saved = context.extractions[0];
        if (!saved) throw new Error('Transcription returned no result.');
        result = {
          ...boundTranscript(saved),
          model: saved.model,
          durationSeconds: saved.durationSeconds,
        };
      } else throw new Error('Unsupported extraction kind for asset.');
    } catch (failure) {
      result.error = readableError(failure);
      if (failure instanceof VideoLengthError) result.durationSeconds = failure.durationSeconds;
    }
    await ctx.runMutation(internal.assetExtractionState.finish, {
      ...args,
      runKey,
      ...result,
      spans: context.spans,
    });
    return null;
  },
});
