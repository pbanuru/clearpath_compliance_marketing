import type { Infer } from 'convex/values';
import type { span, usage } from './types';
import { isRecord, record, string } from './parsing';
import { price, PRICING_VERSION } from './pricing';

type Usage = Infer<typeof usage>;
export type Span = Infer<typeof span>;
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function usageFrom(body: unknown): Usage {
  if (!isRecord(body)) return {};
  if (!isRecord(body.usage)) return {};
  const u = body.usage;
  return {
    inputTokens: number(u.input_tokens),
    outputTokens: number(u.output_tokens),
    cachedInputTokens: isRecord(u.input_tokens_details)
      ? number(u.input_tokens_details.cached_tokens)
      : undefined,
    reasoningTokens: isRecord(u.output_tokens_details)
      ? number(u.output_tokens_details.reasoning_tokens)
      : undefined,
  };
}
export function outputText(body: unknown): string {
  const obj = record(body);
  if (obj.status !== undefined && obj.status !== 'completed')
    throw new Error('OpenAI review did not complete.');
  if (!Array.isArray(obj.output)) throw new Error('OpenAI returned no review output.');
  const chunks: string[] = [];
  for (const item of obj.output)
    if (isRecord(item) && item.type === 'message' && Array.isArray(item.content)) {
      for (const content of item.content)
        if (isRecord(content) && content.type === 'output_text') chunks.push(string(content.text));
    }
  if (!chunks.length) throw new Error('OpenAI returned no structured review (possibly a refusal).');
  return chunks.join('');
}
export function readableError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1500) : String(error).slice(0, 1500);
}
export async function callOpenAI<T>(args: {
  key: string;
  model: string;
  operation: 'review' | 'policy_triage' | 'recheck';
  body: string;
  parse: (body: unknown) => T;
  spans: Span[];
}): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now();
    let usage: Usage = {},
      requestId: string | undefined,
      responseModel = args.model;
    let retryable = true;
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${args.key}`,
          'Content-Type': 'application/json',
        },
        body: args.body,
        signal: AbortSignal.timeout(120000),
      });
      requestId = response.headers.get('x-request-id') ?? undefined;
      retryable = response.ok || response.status === 429 || response.status >= 500;
      const body: unknown = await response.json();
      usage = usageFrom(body);
      if (isRecord(body) && typeof body.model === 'string') responseModel = body.model;
      if (!response.ok) {
        const detail =
          isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
            ? body.error.message.slice(0, 600)
            : response.statusText;
        throw new Error(`OpenAI ${args.operation} failed (${response.status}): ${detail}`);
      }
      const result = args.parse(body);
      const costUsd = price(responseModel, usage);
      args.spans.push({
        provider: 'openai',
        operation: args.operation,
        model: responseModel,
        attempt,
        status: 'succeeded',
        requestId,
        startedAt,
        durationMs: Date.now() - startedAt,
        usage,
        costUsd,
        costBasis: costUsd === null ? 'unknown' : 'rate_estimate',
        pricingVersion: PRICING_VERSION,
      });
      return result;
    } catch (error) {
      const costUsd = price(responseModel, usage);
      args.spans.push({
        provider: 'openai',
        operation: args.operation,
        model: responseModel,
        attempt,
        status: 'failed',
        requestId,
        startedAt,
        durationMs: Date.now() - startedAt,
        usage,
        costUsd,
        costBasis: costUsd === null ? 'unknown' : 'rate_estimate',
        pricingVersion: PRICING_VERSION,
        error: readableError(error),
      });
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new Error('OpenAI retry limit reached.');
}
