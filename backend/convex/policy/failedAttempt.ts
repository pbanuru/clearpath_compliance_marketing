import type { Span } from '../review/openai';
import { PRICING_VERSION } from '../review/pricing';
// Covers failures before a provider response, including interrupted actions.
export function failedAttempt(operation: 'policy_triage' | 'recheck', error: string): Span {
  return {
    provider: 'openai',
    operation,
    model: 'gpt-6.1-sol',
    attempt: 1,
    status: 'failed',
    startedAt: Date.now(),
    durationMs: 0,
    usage: {},
    costUsd: null,
    costBasis: 'unknown',
    pricingVersion: PRICING_VERSION,
    error,
  };
}
