import type { TextBlock } from './webpageTypes';

// Bound both UTF-8 bytes and array length, retaining larger visible blocks first.
export function limitBlocks(blocks: TextBlock[]) {
  const encoder = new TextEncoder();
  const sizes = blocks.map((block) => encoder.encode(JSON.stringify(block)).length + 1);
  let bytes = sizes.reduce((sum, size) => sum + size, 2),
    count = blocks.length;
  const dropped = new Set<number>();
  const smallest = blocks
    .map((b, i) => ({ i, area: b.width * b.height }))
    .sort((a, b) => a.area - b.area);
  for (const { i } of smallest) {
    if (bytes <= 180000 && count <= 1500) break;
    dropped.add(i);
    bytes -= sizes[i] ?? 0;
    count--;
  }
  return { blocks: blocks.filter((_, i) => !dropped.has(i)), blocksTruncated: dropped.size > 0 };
}
