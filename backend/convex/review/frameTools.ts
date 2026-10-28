import type { Doc } from '../_generated/dataModel';
import type { Content, MediaContext } from './mediaInput';
import { dataUrl } from './mediaInput';
import { record, string } from './parsing';

export const MAX_TOOL_ROUNDS = 10;
export const MAX_TOOL_FRAMES = 48;
export function nearestFrame<T extends { at: number }>(frames: T[], at: number): T | undefined {
  return frames.reduce<T | undefined>(
    (nearest, frame) =>
      !nearest || Math.abs(frame.at - at) < Math.abs(nearest.at - at) ? frame : nearest,
    undefined,
  );
}
export const frameTool = {
  type: 'function',
  name: 'get_video_frames',
  strict: true,
  description:
    'Inspect video at any useful times: returns the nearest stored frames, labeled with their actual seconds. Use this to check text, legibility, and timing. The 10-round/48-frame ceiling only prevents runaway loops; request as many useful frames as needed.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['assetId', 'times'],
    properties: {
      assetId: { type: 'string' },
      times: { type: 'array', items: { type: 'number' } },
    },
  },
};
export type ToolUsage = {
  frameToolRounds: number;
  frameToolFrames: number;
  frameToolCeilingHit: boolean;
};
export async function getVideoFrames(
  raw: string,
  assets: Doc<'assets'>[],
  context: MediaContext,
  usage: ToolUsage,
): Promise<Content[]> {
  const args = record(JSON.parse(raw));
  const asset = assets.find((a) => a._id === string(args.assetId));
  if (!asset || asset.kind !== 'video') throw new Error('Video is not in this review.');
  if (
    !Array.isArray(args.times) ||
    args.times.some((t) => typeof t !== 'number' || !Number.isFinite(t) || t < 0)
  )
    throw new Error('Frame times must be nonnegative finite seconds.');
  const frames = asset.content.frames ?? [];
  const parts: Content[] = [];
  const times: unknown[] = args.times;
  for (const value of times) {
    if (typeof value !== 'number') throw new Error('Invalid frame time.');
    const time = value;
    if (usage.frameToolFrames >= MAX_TOOL_FRAMES) {
      usage.frameToolCeilingHit = true;
      break;
    }
    const frame = nearestFrame(frames, time);
    if (!frame) continue;
    parts.push(
      {
        type: 'input_text',
        text: `Asset ${asset._id} | requested ${time}s | actual video frame at ${frame.at.toFixed(2)} seconds`,
      },
      { type: 'input_image', image_url: await dataUrl(frame, context), detail: 'high' },
    );
    usage.frameToolFrames++;
  }
  if (usage.frameToolFrames >= MAX_TOOL_FRAMES) usage.frameToolCeilingHit = true;
  if (!parts.length)
    parts.push({
      type: 'input_text',
      text: 'No additional frames are available within the runaway-loop guard. Complete the structured review with the evidence already received.',
    });
  return parts;
}
