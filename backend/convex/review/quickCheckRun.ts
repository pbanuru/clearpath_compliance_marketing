import type { Infer } from 'convex/values';
import { env } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { callOpenAI, readableError } from './openai';
import type { policy } from './policies';
import type { Span } from './openai';
import { assetInput } from './mediaInput';
import type { MediaContext, Content } from './mediaInput';
import { contextHash, questions, parseQuickCheck } from './quickCheckLogic';
import type { quickContext, quickNote } from './quickCheckTypes';

type Input =
  Exclude<Content, { type: 'input_file' }> | { type: 'input_json'; data: Record<string, unknown> };
export async function runQuickCheck(
  ctx: ActionCtx,
  owner: string,
  context: Infer<typeof quickContext>,
  binding?: { reviewId: Id<'reviews'>; version: number; runKey: string },
  library?: Infer<typeof policy>[],
): Promise<Doc<'quickChecks'>> {
  const hash = await contextHash(context, library);
  const loaded = await ctx.runMutation(internal.review.quickCheckStore.claim, {
    owner,
    contextHash: hash,
    context,
  });
  if (binding)
    await ctx.runMutation(internal.review.quickCheckStore.attach, {
      ...binding,
      id: loaded.check._id,
    });
  if (!loaded.claimed) {
    if (!binding || loaded.check.status !== 'running') return loaded.check;
    // A submitter may submit while its fast check is still in flight. Wait for
    // that shared result so the detailed request receives the same leads.
    const deadline = Date.now() + 270000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const check = await ctx.runQuery(internal.review.quickCheckStore.read, {
        id: loaded.check._id,
      });
      if (check && check.status !== 'running') return check;
    }
    return loaded.check;
  }
  const spans: Span[] = [],
    notes: Infer<typeof quickNote>[] = [];
  const media: MediaContext = {
    owner,
    key: env.OPENAI_API_KEY ?? '',
    assemblyKey: env.ASSEMBLYAI_API_KEY,
    spans,
    cached: loaded.extractions,
    extractions: [],
    texts: new Map(),
    bytes: 0,
    allowMissingTranscript: true,
  };
  let status: Doc<'quickChecks'>['status'] = 'succeeded',
    error: string | undefined;
  let rules: Doc<'quickChecks'>['rules'] = [];
  try {
    const { assetIds: _ids, ...reviewContext } = context;
    const content: Input[] = [{ type: 'input_json', data: reviewContext }];
    let supported = 0;
    for (const asset of loaded.assets) {
      if (
        asset.kind === 'document' ||
        (asset.kind === 'webpage' && asset.content.capture.mimeType === 'application/pdf')
      ) {
        notes.push({
          assetId: asset._id,
          status: 'unsupported',
          message: `${asset.name}: PDF input is unsupported by quick check; the detailed review checks it.`,
        });
        continue;
      }
      if (
        (asset.kind === 'audio' || asset.kind === 'video') &&
        asset.content.original.size > 25_000_000 &&
        !media.assemblyKey
      ) {
        notes.push({
          assetId: asset._id,
          status: 'unsupported',
          message: `${asset.name}: speech exceeds the 25 MB transcription limit and was not checked.`,
        });
        if (asset.kind === 'audio') continue;
      }
      if (!media.key) throw new Error('OPENAI_API_KEY is missing from this Convex deployment.');
      const parts = await assetInput(asset, media);
      if (media.extractions.some((e) => e.assetId === asset._id && e.status === 'failed')) {
        notes.push({
          assetId: asset._id,
          status: 'unsupported',
          message: `${asset.name}: speech could not be transcribed; spoken claims were not checked.`,
        });
        if (asset.kind === 'audio') continue;
      }
      content.push(
        ...parts.filter(
          (p): p is Exclude<Content, { type: 'input_file' }> => p.type !== 'input_file',
        ),
      );
      supported++;
    }
    if (!supported) status = 'unsupported';
    else {
      if (!media.key) throw new Error('OPENAI_API_KEY is missing from this Convex deployment.');
      rules = await callOpenAI({
        key: media.key,
        operation: 'quick_check',
        model: 'gpt-6-luna',
        spans,
        body: JSON.stringify({
          model: 'gpt-6-luna',
          input: [{ role: 'user', content }],
          questions: questions(context.product, context.channel, library),
          // No provider caching: exact repeated checks use the owner-scoped Convex cache.
          prompt_cache_options: { mode: 'explicit' },
        }),
        parse: (body) => parseQuickCheck(body, context.product, context.channel, library),
      });
    }
  } catch (cause) {
    status = 'failed';
    error = readableError(cause);
  }
  return ctx.runMutation(internal.review.quickCheckStore.finish, {
    id: loaded.check._id,
    runKey: loaded.check.runKey,
    status,
    rules,
    notes,
    error,
    spans,
    extractions: media.extractions,
    reviewId: binding?.reviewId,
    version: binding?.version,
  });
}
