import type { Doc } from '../_generated/dataModel';
import { storage } from '../assetStorage';
import { callOpenAI, readableError } from './openai';
import type { Span } from './openai';
import { record } from './parsing';
import { assemblyTranscript } from './assemblyai';
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
  assemblyKey?: string;
  spans: Span[];
  cached: Extraction[];
  extractions: SavedExtraction[];
  texts: Map<string, string>;
  bytes: number;
  allowMissingTranscript?: boolean;
};

async function download(file: File): Promise<Blob> {
  const response = await fetch(await storage.getUrl(file.key, { expiresIn: 900 }), {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Unable to read ${file.name} (${response.status}).`);
  return response.blob();
}
async function dataUrl(file: File, context: MediaContext) {
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
function parseTranscript(body: unknown) {
  const result = record(body);
  if (!Array.isArray(result.segments))
    throw new Error('OpenAI returned no timestamped transcript segments.');
  return result.segments.map((value: unknown) => {
    const segment = record(value);
    if (
      typeof segment.start !== 'number' ||
      typeof segment.end !== 'number' ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end < segment.start ||
      typeof segment.text !== 'string'
    )
      throw new Error('Invalid transcript segment.');
    return { start: segment.start, end: segment.end, text: segment.text };
  });
}
async function transcript(
  asset: Doc<'assets'> & { kind: 'audio' | 'video' },
  context: MediaContext,
) {
  const cached =
    context.cached.find((e) => e.assetId === asset._id && e.status === 'succeeded') ??
    context.extractions.find((e) => e.assetId === asset._id && e.status === 'succeeded');
  if (cached) return boundTranscript(cached).segments;
  const file = asset.content.original;
  let primaryError = 'ASSEMBLYAI_API_KEY is missing.';
  if (context.assemblyKey) {
    try {
      const result = await assemblyTranscript(
        context.assemblyKey,
        await storage.getUrl(file.key, { expiresIn: 900 }),
        context.spans,
      );
      context.extractions.push({
        owner: context.owner,
        assetId: asset._id,
        kind: 'transcript',
        status: 'succeeded',
        ...result,
        createdAt: Date.now(),
      });
      return result.segments;
    } catch (failure) {
      primaryError = readableError(failure);
    }
  }
  try {
    if (!context.key) throw new Error('OPENAI_API_KEY is missing.');
    if (file.size > 25_000_000)
      throw new Error('OpenAI fallback cannot transcribe files larger than 25 MB.');
    const body = new FormData();
    body.append('file', await download(file), file.name);
    body.append('model', 'whisper-1');
    body.append('response_format', 'verbose_json');
    body.append('timestamp_granularities[]', 'segment');
    const segments = await callOpenAI({
      key: context.key,
      model: 'whisper-1',
      operation: 'transcription',
      body,
      parse: parseTranscript,
      spans: context.spans,
    });
    const bounded = boundTranscript({ segments });
    context.extractions.push({
      owner: context.owner,
      assetId: asset._id,
      kind: 'transcript',
      status: 'succeeded',
      ...bounded,
      model: 'whisper-1',
      createdAt: Date.now(),
    });
    return bounded.segments;
  } catch (error) {
    context.extractions.push({
      owner: context.owner,
      assetId: asset._id,
      kind: 'transcript',
      status: 'failed',
      segments: [],
      model: 'whisper-1',
      error: `AssemblyAI: ${primaryError} OpenAI: ${readableError(error)}`,
      createdAt: Date.now(),
    });
    throw new Error(`AssemblyAI: ${primaryError} OpenAI: ${readableError(error)}`);
  }
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
      try {
        const segments = await transcript(asset, context);
        const extraction =
          context.extractions.find((e) => e.assetId === asset._id) ??
          context.cached.find((e) => e.assetId === asset._id);
        const bounded = extraction ? boundTranscript(extraction) : undefined;
        const limitNote = bounded ? transcriptLimitNote(bounded) : null;
        if (limitNote) parts.push({ type: 'input_text', text: limitNote });
        context.texts.set(asset._id, segments.map((s) => s.text).join('\n'));
        parts.push({
          type: 'input_text',
          text: segments.length
            ? `Transcript:\n${segments.map((s) => `[${s.start.toFixed(2)}–${s.end.toFixed(2)}s] ${s.text}`).join('\n')}`
            : bounded?.segmentsTruncated
              ? 'No transcript text fits the storage limit; listen to the original.'
              : 'Transcript contains no speech.',
        });
      } catch (error) {
        if (!context.allowMissingTranscript) throw error;
        parts.push({
          type: 'input_text',
          text: 'Speech could not be transcribed. Spoken claims have not been checked; assess only the available visual evidence.',
        });
      }

      if (asset.kind === 'video') {
        const frames = asset.content.frames;
        if (frames?.length)
          for (const frame of frames)
            parts.push(
              {
                type: 'input_text',
                text: `Asset ${asset._id} | video frame at ${frame.at.toFixed(2)} seconds`,
              },
              { type: 'input_image', image_url: await dataUrl(frame, context), detail: 'high' },
            );
        else
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
      break;
    }
  }
  return parts;
}
