/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import r2 from '@convex-dev/r2/test';
import { api } from '../_generated/api';
import schema from '../schema';

export const aliceIdentity = {
  subject: 'alice',
  issuer: 'https://auth.example',
  tokenIdentifier: 'https://auth.example|alice',
};
export function setup() {
  const t = convexTest(schema, import.meta.glob('../**/*.ts'));
  r2.register(t);
  return t;
}
export async function fixture() {
  const t = setup();
  const alice = t.withIdentity(aliceIdentity);
  const bob = t.withIdentity({
    ...aliceIdentity,
    subject: 'bob',
    tokenIdentifier: 'https://auth.example|bob',
  });
  const assetId = await alice.mutation(api.assets.createText, {
    name: 'Ad',
    text: 'Guaranteed approval in minutes.',
  });
  const input = {
    title: 'Loan ad',
    product: 'personal_loan' as const,
    channel: 'social' as const,
    jurisdictions: ['US'],
    assetIds: [assetId],
  };
  const reviewId = await alice.mutation(api.reviews.create, input);
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', reviewId, { status: 'in_review' });
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', reviewId).eq('number', 1))
      .unique();
    if (!version) throw new Error('Missing version');
    await ctx.db.patch('reviewVersions', version._id, { analysis: { status: 'succeeded' } });
  });
  const findingId = await alice.mutation(api.findings.add, {
    reviewId,
    severity: 'required',
    policyId: 'approval-claims',
    title: 'Remove guarantee',
    explanation: 'Approval is not guaranteed.',
    location: { assetId, quote: 'Guaranteed approval' },
  });
  return { t, alice, bob, assetId, reviewId, findingId, input };
}
