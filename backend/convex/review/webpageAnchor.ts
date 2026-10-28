import type { Doc } from '../_generated/dataModel';

// Exact substring matching after joining adjacent DOM blocks with a space/newline.
// Always union measured DOM boxes; never infer a box from the quote's length.
export function webpageAnchor(asset: Doc<'assets'>, quote?: string) {
  if (asset.kind !== 'webpage' || !asset.content.blocks || !asset.content.size || !quote)
    return undefined;
  const { blocks, size } = asset.content;
  for (const separator of [' ', '\n']) {
    const text = blocks.map((b) => b.text).join(separator);
    const start = text.indexOf(quote);
    if (start < 0) continue;
    const end = start + quote.length;
    let offset = 0;
    const matched = blocks.filter((block) => {
      const overlaps = offset < end && offset + block.text.length > start;
      offset += block.text.length + separator.length;
      return overlaps;
    });
    if (!matched.length) continue;
    const x = Math.min(...matched.map((b) => b.x));
    const y = Math.min(...matched.map((b) => b.y));
    const right = Math.max(...matched.map((b) => b.x + b.width));
    const bottom = Math.max(...matched.map((b) => b.y + b.height));
    return {
      x: x / size.width,
      y: y / size.height,
      width: (right - x) / size.width,
      height: (bottom - y) / size.height,
    };
  }
  return undefined;
}
