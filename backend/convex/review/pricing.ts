import type { Infer } from 'convex/values';
import type { usage } from './types';

// Source: https://developers.openai.com/api/docs/pricing, read 2026-10-28.
// Standard tier, global processing. USD; estimates, not provider invoices.
export const PRICING_VERSION = 'openai-standard-2026-10-28';
// https://www.assemblyai.com/pricing, read 2026-10-28. No paid add-ons.
export const ASSEMBLYAI_PRICING_VERSION = 'assemblyai-payg-2026-10-28';
export function price(model: string, measured: Infer<typeof usage>): number | null {
  if (model === 'universal-3-5-pro' || model === 'universal-2') {
    const seconds = measured.audioSeconds;
    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
    return (seconds / 3600) * (model === 'universal-3-5-pro' ? 0.21 : 0.15);
  }
  // Decisions: https://developers.openai.com/api/docs/guides/decisions,
  // read 2026-10-28. Input $0.10/M, cache reads $0.01/M,
  // cache writes $0.125/M; output free. Global Standard processing.
  if (model === 'gpt-6-luna') {
    const { inputTokens, cachedInputTokens = 0, cacheWriteTokens = 0 } = measured;
    if (
      inputTokens === undefined ||
      ![inputTokens, cachedInputTokens, cacheWriteTokens].every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      cachedInputTokens + cacheWriteTokens > inputTokens
    )
      return null;
    const multiplier = inputTokens > 272000 ? 2 : 1;
    return (
      (((inputTokens - cachedInputTokens - cacheWriteTokens) * 0.1 +
        cachedInputTokens * 0.01 +
        cacheWriteTokens * 0.125) *
        multiplier) /
      1_000_000
    );
  }
  const gemini = model === 'gemini-3.1-pro-preview';
  if (model !== 'gpt-6.1-sol' && !gemini) return null;
  const { inputTokens, cachedInputTokens = 0, outputTokens } = measured;
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    ![inputTokens, cachedInputTokens, outputTokens].every((n) => Number.isFinite(n) && n >= 0) ||
    cachedInputTokens > inputTokens
  )
    return null;
  // https://ai.google.dev/gemini-api/docs/pricing, read 2026-10-28. Standard.
  const [input, cached, output] = gemini
    ? inputTokens > 200000
      ? [4, 0.4, 18]
      : [2, 0.2, 12]
    : inputTokens > 272000
      ? [4, 0.2, 15]
      : [2, 0.1, 10];
  // Cached input is included in input; reasoning is included in output.
  return (
    ((inputTokens - cachedInputTokens) * input +
      cachedInputTokens * cached +
      outputTokens * output) /
    1_000_000
  );
}
