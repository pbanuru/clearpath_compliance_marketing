import type { Infer } from 'convex/values';
import type { usage } from './types';

// Source: https://developers.openai.com/api/docs/pricing, read 2026-10-28.
// Standard tier, global processing. USD; estimates, not provider invoices.
export const PRICING_VERSION = 'openai-standard-2026-10-28';
export function price(model: string, measured: Infer<typeof usage>): number | null {
  if (model === 'whisper-1' || model === 'gpt-transcribe') {
    if (
      measured.audioSeconds === undefined ||
      !Number.isFinite(measured.audioSeconds) ||
      measured.audioSeconds < 0
    )
      return null;
    return (measured.audioSeconds / 60) * (model === 'whisper-1' ? 0.006 : 0.0045);
  }
  if (model !== 'gpt-6.1-sol') return null;
  const { inputTokens, cachedInputTokens = 0, outputTokens } = measured;
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    ![inputTokens, cachedInputTokens, outputTokens].every((n) => Number.isFinite(n) && n >= 0) ||
    cachedInputTokens > inputTokens
  )
    return null;
  const [input, cached, output] = inputTokens > 272000 ? [4, 0.2, 15] : [2, 0.1, 10];
  // Cached input is included in input; reasoning is included in output.
  return (
    ((inputTokens - cachedInputTokens) * input +
      cachedInputTokens * cached +
      outputTokens * output) /
    1_000_000
  );
}
