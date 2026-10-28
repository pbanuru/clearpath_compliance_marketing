import type { ActionCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { internal } from '../_generated/api';

export async function awaitExtractions(
  ctx: ActionCtx,
  assets: Doc<'assets'>[],
  owner: string,
): Promise<Doc<'assetExtractions'>[]> {
  const assetIds = assets.filter((a) => a.kind === 'video' || a.kind === 'audio').map((a) => a._id);
  if (!assetIds.length) return [];
  await ctx.runMutation(internal.assetExtractionState.ensure, { assetIds, owner });
  let rows: Doc<'assetExtractions'>[] = [];
  for (let poll = 0; poll < 45; poll++) {
    rows = await ctx.runQuery(internal.assetExtractionState.list, { assetIds, owner });
    if (rows.every((r) => r.status === 'succeeded' || r.status === 'failed')) return rows;
    if (poll < 44) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return rows;
}
