import type { Infer } from 'convex/values';
import type { policy } from './policies';
import { applicablePolicies } from './policies';
import { CLEARPATH_FACTS } from './prompt';
import { isRecord } from './parsing';
import type { quickContext, quickRule } from './quickCheckTypes';

import { QUICK_CHECK_AS_CONTEXT } from './quickCheckConfig';
export const QUICK_CHECK_BANDS = { likely: 0.7, possible: 0.35 } as const;
export function band(probability: number) {
  return probability >= QUICK_CHECK_BANDS.likely
    ? 'likely'
    : probability >= QUICK_CHECK_BANDS.possible
      ? 'possible'
      : 'low';
}
export function questions(product: string, channel: string, library?: Infer<typeof policy>[]) {
  return applicablePolicies(product, channel, library).map((rule) => ({
    name: rule.id,
    type: 'predicate' as const,
    instructions: `Does this marketing material, as a consumer would experience it, likely conflict with this rule? Rule: ${rule.title}. What to check: ${rule.check}. Facts about ClearPath: ${CLEARPATH_FACTS}`,
  }));
}
export function parseQuickCheck(
  body: unknown,
  product: string,
  channel: string,
  library?: Infer<typeof policy>[],
): Infer<typeof quickRule>[] {
  const rules = applicablePolicies(product, channel, library);
  if (!isRecord(body) || !Array.isArray(body.answers) || body.answers.length !== rules.length)
    throw new Error('Decisions returned an incomplete set of answers.');
  const answers = new Map<string, Record<string, unknown>>();
  for (const answer of body.answers) {
    if (!isRecord(answer) || typeof answer.name !== 'string' || answers.has(answer.name))
      throw new Error('Decisions returned an invalid or duplicate answer name.');
    answers.set(answer.name, answer);
  }
  return rules.map((rule) => {
    const answer = answers.get(rule.id);
    const base = {
      ruleId: rule.id,
      title: rule.title,
      source: { label: rule.source.label, url: rule.source.url },
    };
    if (answer?.type === 'refusal')
      return { ...base, probability: null, band: null, refusal: true };
    if (
      answer?.type !== 'predicate' ||
      typeof answer.probability !== 'number' ||
      !Number.isFinite(answer.probability) ||
      answer.probability < 0 ||
      answer.probability > 1
    )
      throw new Error(`Decisions returned an invalid probability for ${rule.id}.`);
    return {
      ...base,
      probability: answer.probability,
      band: band(answer.probability),
      refusal: false,
    };
  });
}
export function risk(rules: Infer<typeof quickRule>[]) {
  return {
    likely: rules.filter((r) => r.band === 'likely').length,
    possible: rules.filter((r) => r.band === 'possible').length,
  };
}
export function leads(rules: Infer<typeof quickRule>[]) {
  if (!QUICK_CHECK_AS_CONTEXT || !rules.length) return '';
  return (
    'A fast classifier estimated these rule-conflict probabilities; treat them as leads to verify against the material, not conclusions.\n' +
    rules
      .map((r) => `${r.ruleId}: ${r.refusal ? 'refusal (unassessed)' : String(r.probability)}`)
      .join('\n')
  );
}
export async function contextHash(
  context: Infer<typeof quickContext>,
  library?: Infer<typeof policy>[],
) {
  const text = JSON.stringify({
    assetIds: context.assetIds,
    product: context.product,
    channel: context.channel,
    jurisdictions: [...new Set(context.jurisdictions)].sort(),
    offerTerms: context.offerTerms ?? '',
    notes: context.notes ?? '',
    questions: questions(context.product, context.channel, library).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    sources: applicablePolicies(context.product, context.channel, library)
      .map((p) => [p.id, p.source.label, p.source.url])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    bands: QUICK_CHECK_BANDS,
    version: 2,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
