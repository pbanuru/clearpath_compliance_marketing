import type { Span } from './openai';
import { readableError } from './openai';
import { record, string } from './parsing';
import { price, ASSEMBLYAI_PRICING_VERSION } from './pricing';
import { boundTranscript } from './transcriptLimits';

type Segment = { start: number; end: number; text: string };
const endpoint = 'https://api.assemblyai.com/v2/transcript'; // US processing.
export async function assemblyTranscript(key: string, audioUrl: string, spans: Span[]) {
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(90000);
  let requestId: string | undefined;
  let model = 'universal-3-5-pro';
  let audioSeconds: number | undefined;
  let error: string | undefined;
  try {
    const headers = { authorization: key, 'Content-Type': 'application/json' };
    async function request(url: string, init?: RequestInit) {
      const response = await fetch(url, { ...init, headers, signal });
      const body = record(await response.json());
      if (!response.ok)
        throw new Error(
          `AssemblyAI transcription failed (${response.status}): ${typeof body.error === 'string' ? body.error : 'Request rejected'}`,
        );
      return body;
    }
    let body = await request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        audio_url: audioUrl,
        speech_models: ['universal-3-5-pro'],
        language_detection: true,
      }),
    });
    requestId = string(body.id);
    // One submitted job is one model attempt; polling does not create billed calls.
    for (let poll = 0; body.status !== 'completed'; poll++) {
      if (body.status === 'error')
        throw new Error(`AssemblyAI transcription failed: ${string(body.error)}`);
      if (body.status !== 'queued' && body.status !== 'processing')
        throw new Error('Invalid AssemblyAI job status.');
      if (poll >= 28 || signal.aborted)
        throw new Error('AssemblyAI transcription timed out after 90 seconds.');
      if (poll > 0) await new Promise((resolve) => setTimeout(resolve, 3000));
      body = await request(`${endpoint}/${encodeURIComponent(requestId)}`);
    }
    model = typeof body.speech_model_used === 'string' ? body.speech_model_used : model;
    audioSeconds =
      typeof body.audio_duration === 'number' &&
      Number.isFinite(body.audio_duration) &&
      body.audio_duration >= 0
        ? body.audio_duration
        : undefined;
    if (!Array.isArray(body.words)) throw new Error('AssemblyAI returned no timestamped words.');
    const words: Segment[] = body.words.map((value: unknown) => {
      const word = record(value);
      if (
        typeof word.start !== 'number' ||
        typeof word.end !== 'number' ||
        !Number.isFinite(word.start) ||
        !Number.isFinite(word.end) ||
        word.start < 0 ||
        word.end < word.start
      )
        throw new Error('Invalid AssemblyAI word timing.');
      return { start: word.start / 1000, end: word.end / 1000, text: string(word.text) };
    });
    const segments: Segment[] = [];
    let group: Segment | undefined;
    for (const word of words) {
      if (!group || word.end - group.start > 8 || /[.!?]$/.test(group.text)) {
        group = { ...word };
        segments.push(group);
      } else {
        group.end = word.end;
        group.text += ` ${word.text}`;
      }
    }
    return { ...boundTranscript({ segments, words }), model };
  } catch (failure) {
    error = readableError(failure);
    throw failure;
  } finally {
    const usage = audioSeconds === undefined ? {} : { audioSeconds };
    const costUsd = price(model, usage);
    spans.push({
      provider: 'assemblyai',
      operation: 'transcription',
      model,
      attempt: 1,
      requestId,
      startedAt,
      durationMs: Date.now() - startedAt,
      usage,
      status: error ? 'failed' : 'succeeded',
      error,
      costUsd,
      costBasis: costUsd === null ? 'unknown' : 'rate_estimate',
      pricingVersion: ASSEMBLYAI_PRICING_VERSION,
    });
  }
}
