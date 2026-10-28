import type { Infer } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import schema from '../schema';

export const savedExtraction = schema.doc('assetExtractions').omit('_id', '_creationTime');

export async function saveExtractions(
  ctx: MutationCtx,
  owner: string,
  rows: Infer<typeof savedExtraction>[],
) {
  for (const extraction of rows) {
    const asset = await ctx.db.get('assets', extraction.assetId);
    if (extraction.owner !== owner || asset?.owner !== owner)
      throw new Error('Extraction owner mismatch.');
    const old = await ctx.db
      .query('assetExtractions')
      .withIndex('by_assetId_and_kind', (q) =>
        q.eq('assetId', extraction.assetId).eq('kind', extraction.kind),
      )
      .unique();
    if (old && old.owner !== owner) throw new Error('Extraction owner mismatch.');
    const update = {
      ...extraction,
      error: extraction.status === 'succeeded' ? undefined : extraction.error,
    };
    if (!old) await ctx.db.insert('assetExtractions', update);
    else if (old.status !== 'succeeded') await ctx.db.patch('assetExtractions', old._id, update);
  }
}
