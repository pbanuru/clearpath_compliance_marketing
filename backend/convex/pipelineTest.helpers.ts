import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { aliceIdentity, setup } from './reviewTest.helpers';

export const tokens = {
  input_tokens: 1000,
  input_tokens_details: { cached_tokens: 200 },
  output_tokens: 100,
  output_tokens_details: { reasoning_tokens: 50 },
};
export const summary =
  'The approval guarantee needs review. The material does not establish eligibility for every applicant.';
export function response(raw: string, usage: unknown = tokens, model = 'gpt-6.1-sol') {
  return Response.json(
    {
      status: 'completed',
      model,
      usage,
      output: [{ type: 'message', content: [{ type: 'output_text', text: raw }] }],
    },
    { headers: { 'x-request-id': 'req_stub' } },
  );
}
export function output(assetId: Id<'assets'>, quote = 'Guaranteed approval') {
  return {
    summary,
    findings: [
      {
        severity: 'required',
        policyId: 'approval-claims',
        title: 'Remove approval guarantee',
        explanation: 'A consumer would expect approval. Eligibility has not been established.',
        suggestedFix: 'Check your eligibility. Approval is subject to credit review.',
        confidence: 'high',
        location: {
          assetId,
          quote,
          startSeconds: null,
          endSeconds: null,
          page: null,
          region: null,
        },
      },
    ],
    previous: [],
  };
}
export async function queued() {
  const t = setup();
  const alice = t.withIdentity(aliceIdentity);
  const assetId = await alice.mutation(api.assets.createText, {
    name: 'Ad',
    text: 'Guaranteed approval in minutes.',
  });
  const reviewId = await alice.mutation(api.reviews.create, {
    title: 'Ad',
    product: 'personal_loan',
    channel: 'social',
    jurisdictions: ['US'],
    assetIds: [assetId],
  });
  return { t, alice, assetId, reviewId };
}
