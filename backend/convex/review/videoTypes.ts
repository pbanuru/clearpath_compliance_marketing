import { v } from 'convex/values';

export const extractionKind = v.union(v.literal('transcript'), v.literal('video_timeline'));
export const videoEvent = v.object({
  start: v.number(),
  end: v.number(),
  kind: v.union(
    v.literal('on_screen_text'),
    v.literal('spoken_claim'),
    v.literal('visual'),
    v.literal('scene'),
  ),
  text: v.string(),
  prominence: v.object({
    size: v.union(v.literal('small'), v.literal('medium'), v.literal('large')),
    contrast: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    position: v.string(),
  }),
  notes: v.string(),
});
