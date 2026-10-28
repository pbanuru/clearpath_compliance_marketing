import type { Doc } from '../_generated/dataModel';
import { storage } from '../assetStorage';
import type { Span } from './openai';
import { boundTranscript, transcriptLimitNote } from './transcriptLimits';

type File = { key: string; name: string; mimeType: string; size: number };
export type Extraction = Doc<'assetExtractions'>;
export type SavedExtraction = Omit<Extraction, '_id' | '_creationTime'>;
export type Content =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'high' }
  | { type: 'input_file'; filename: string; file_data: string };
export type MediaContext = {
  owner: string;
  key: string;
  spans: Span[];
  cached: Extraction[];
  extractions: SavedExtraction[];
  texts: Map<string, string>;
  bytes: number;
  notes?: string[];
};

async function download(file: File): Promise<Blob> {
  const response = await fetch(await storage.getUrl(file.key, { expiresIn: 900 }), {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Unable to read ${file.name} (${response.status}).`);
  return response.blob();
}
export async function dataUrl(file: File, context: MediaContext) {
  context.bytes += file.size;
  if (context.bytes > 40 * 1024 * 1024)
    throw new Error(
      'This bundle exceeds the 40 MB inline AI media limit. Review by hand or submit smaller files.',
    );
  const bytes = new Uint8Array(await (await download(file)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${file.mimeType};base64,${btoa(binary)}`;
}
export async function assetInput(asset: Doc<'assets'>, context: MediaContext): Promise<Content[]> {
  const parts: Content[] = [
    { type: 'input_text', text: `Asset ${asset._id} | kind: ${asset.kind} | name: ${asset.name}` },
  ];
  switch (asset.kind) {
    case 'text':
      context.texts.set(asset._id, asset.content.text);
      parts.push({ type: 'input_text', text: asset.content.text });
      break;
    case 'image':
      parts.push({
        type: 'input_image',
        image_url: await dataUrl(asset.content.original, context),
        detail: 'high',
      });
      break;
    case 'document':
      parts.push({
        type: 'input_file',
        filename: asset.content.original.name,
        file_data: await dataUrl(asset.content.original, context),
      });
      break;
    case 'webpage':
      parts.push({ type: 'input_text', text: `Captured webpage: ${asset.content.sourceUrl}` });
      if (asset.content.capture.mimeType === 'application/pdf')
        parts.push({
          type: 'input_file',
          filename: asset.content.capture.name,
          file_data: await dataUrl(asset.content.capture, context),
        });
      else if (asset.content.capture.mimeType.startsWith('image/'))
        parts.push({
          type: 'input_image',
          image_url: await dataUrl(asset.content.capture, context),
          detail: 'high',
        });
      else throw new Error('This webpage capture format cannot be reviewed by AI.');
      break;
    case 'audio':
    case 'video': {
      const extraction = context.cached.find(
        (e) => e.assetId === asset._id && e.kind === 'transcript',
      );
      const bounded = extraction?.status === 'succeeded' ? boundTranscript(extraction) : undefined;
      const segments = bounded?.segments ?? [];
      const limitNote = bounded ? transcriptLimitNote(bounded) : null;
      if (limitNote) parts.push({ type: 'input_text', text: limitNote });
      if (limitNote) context.notes?.push(`Asset ${asset._id}: ${limitNote}`);
      context.texts.set(asset._id, segments.map((s) => s.text).join('\n'));
      parts.push({
        type: 'input_text',
        text:
          extraction?.status === 'succeeded'
            ? `Transcript:\n${segments.map((s) => `[${s.start.toFixed(2)}–${s.end.toFixed(2)}s] ${s.text}`).join('\n') || (bounded?.segmentsTruncated ? 'No transcript text fits the storage limit; listen to the original.' : 'No speech.')}${bounded?.words ? `\nWord timings (seconds): ${JSON.stringify(bounded.words)}` : ''}`
            : `Transcript unavailable: ${extraction?.error ?? 'Extraction is still pending after the bounded wait.'} Spoken claims have not been fully checked.`,
      });
      if (extraction?.status !== 'succeeded')
        context.notes?.push(
          `Asset ${asset._id} transcript: ${extraction?.error ?? 'Still pending after bounded wait.'}`,
        );
      if (asset.kind === 'video') {
        const timeline = context.cached.find(
          (e) => e.assetId === asset._id && e.kind === 'video_timeline',
        );
        parts.push({
          type: 'input_text',
          text:
            timeline?.status === 'succeeded'
              ? `Visual timeline (seconds, model observations): ${JSON.stringify((timeline.timeline ?? []).filter((e) => ['on_screen_text', 'character', 'visual', 'scene'].includes(e.kind)))}`
              : `Visual timeline unavailable: ${timeline?.error ?? 'Still pending after bounded wait.'} Use browser frames only.`,
        });
        if (timeline?.status !== 'succeeded')
          context.notes?.push(
            `Asset ${asset._id} visual timeline: ${timeline?.error ?? 'Still pending after bounded wait.'}`,
          );
        parts.push(
          { type: 'input_text', text: `Asset ${asset._id} video poster` },
          {
            type: 'input_image',
            image_url: await dataUrl(asset.content.poster, context),
            detail: 'high',
          },
        );
        const allFrames = asset.content.frames ?? [];
        const frames = Array.from(
          new Set(
            Array.from(
              { length: Math.min(4, allFrames.length) },
              (_, i) =>
                allFrames[
                  Math.round(
                    (i * (allFrames.length - 1)) / Math.max(1, Math.min(4, allFrames.length) - 1),
                  )
                ],
            ),
          ),
        ).filter((f): f is NonNullable<typeof f> => !!f);
        if (frames.length)
          for (const frame of frames)
            parts.push(
              {
                type: 'input_text',
                text: `Asset ${asset._id} | video frame at ${frame.at.toFixed(2)} seconds`,
              },
              { type: 'input_image', image_url: await dataUrl(frame, context), detail: 'high' },
            );
        else {
          context.notes?.push(`Asset ${asset._id}: video frames unavailable.`);
          parts.push(
            {
              type: 'input_text',
              text: `Asset ${asset._id} | video poster only: sampled frames are unavailable. Visual timing cannot be assessed.`,
            },
            {
              type: 'input_image',
              image_url: await dataUrl(asset.content.poster, context),
              detail: 'high',
            },
          );
        }
      }
      break;
    }
  }
  return parts;
}
