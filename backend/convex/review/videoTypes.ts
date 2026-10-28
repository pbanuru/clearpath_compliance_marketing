import { v } from 'convex/values';

export const extractionKind = v.union(v.literal('transcript'), v.literal('video_timeline'));
export const videoEvent = v.object({
  start: v.number(),
  end: v.number(),
  kind: v.union(
    v.literal('on_screen_text'),
    v.literal('character'),
    v.literal('visual'),
    v.literal('scene'),
  ),
  text: v.string(),
  size: v.optional(v.union(v.literal('small'), v.literal('medium'), v.literal('large'))),
  contrast: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'))),
  position: v.optional(v.string()),
  who: v.optional(v.string()),
  doing: v.optional(v.string()),
  says_gist: v.optional(v.string()),
  notes: v.string(),
});
// Existing observations remain readable without a production data migration.
// New extraction completions use the strict event-kind validator above.
export const storedVideoEvent = videoEvent.extend({
  kind: v.string(),
  prominence: v.optional(
    v.object({
      size: v.union(v.literal('small'), v.literal('medium'), v.literal('large')),
      contrast: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
      position: v.string(),
    }),
  ),
});
