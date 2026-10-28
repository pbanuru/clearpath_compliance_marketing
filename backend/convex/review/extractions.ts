import type { ActionCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { requireVideoDuration } from '../videoLimits';

export async function awaitExtractions(
  ctx: ActionCtx,
  assets: Doc<'assets'>[],
  owner: string,
): Promise<Doc<'assetExtractions'>[]> {
  const assetIds = assets.filter((a) => a.kind === 'video' || a.kind === 'audio').map((a) => a._id);
  if (!assetIds.length) return [];
  await ctx.runMutation(internal.assetExtractionState.ensure, { assetIds, owner });
  let rows: Doc<'assetExtractions'>[] = [];
  function checkVideoDurations(requireKnown: boolean) {
    for (const asset of assets) {
      if (asset.kind !== 'video') continue;
      const transcript = rows.find((r) => r.assetId === asset._id && r.kind === 'transcript');
      if (requireKnown || transcript?.durationSeconds !== undefined)
        requireVideoDuration(transcript?.durationSeconds);
    }
  }
  // Keep slow, successful primary evidence in the first read rather than
  // proceeding while generation is still inside its request deadline.
  for (let poll = 0; poll < 120; poll++) {
    rows = await ctx.runQuery(internal.assetExtractionState.list, { assetIds, owner });
    checkVideoDurations(false);
    if (rows.every((r) => r.status === 'succeeded' || r.status === 'failed')) {
      checkVideoDurations(true);
      return rows;
    }
    if (poll < 119) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  checkVideoDurations(true);
  return rows;
}
