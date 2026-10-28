import type { ActionCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { awaitExtractions } from '../review/extractions';

export async function recheckExtractions(ctx: ActionCtx, assets: Doc<'assets'>[], owner: string) {
  const assetIds = assets.filter((a) => a.kind === 'audio' || a.kind === 'video').map((a) => a._id);
  if (!assetIds.length) return [];
  const args = { assetIds, owner };
  await ctx.runMutation(internal.assetExtractionState.ensure, { ...args, retryFailed: true });
  const rows = await ctx.runQuery(internal.assetExtractionState.list, args);
  // Extraction runs in Node; its transactional claim also protects the scheduled copy.
  await Promise.all(
    rows
      .filter((row) => row.status === 'queued')
      .map((row) =>
        ctx.runAction(internal.assetExtraction.run, { assetId: row.assetId, kind: row.kind }),
      ),
  );
  const complete = await awaitExtractions(ctx, assets, owner);
  if (complete.some((row) => row.status !== 'succeeded' || row.segmentsTruncated))
    throw new Error(
      'Material extraction is incomplete; the policy recheck has not passed. Retry when the transcript and visual timeline are available.',
    );
  return complete;
}
