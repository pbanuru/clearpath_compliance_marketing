import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import { fixture } from './reviewTest.helpers';
import { ConvexError } from 'convex/values';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test.each([null, '', '  '])(
  'clearing an optional suggestion (%s) removes it from storage and the change request',
  async (suggestedFix) => {
    const { t, alice, bob, reviewId, findingId } = await fixture();
    await alice.mutation(api.findings.edit, { findingId, suggestedFix: 'Add a qualification.' });
    await expect(bob.mutation(api.findings.edit, { findingId, suggestedFix })).rejects.toThrow(
      ConvexError,
    );
    await alice.mutation(api.findings.edit, { findingId, suggestedFix });
    const stored = await t.run((ctx) => ctx.db.get('findings', findingId));
    expect(stored).not.toHaveProperty('suggestedFix');
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    const detail = await alice.query(api.reviews.get, { reviewId });
    const decision = detail.decisions.find((d) => d.version === 1);
    expect(decision?.acceptedFindingIds).toContain(findingId);
    const changes = detail.findings.filter((f) => decision?.acceptedFindingIds.includes(f._id));
    expect(changes).toHaveLength(1);
    expect(changes[0]).not.toHaveProperty('suggestedFix');
    expect(changes[0]?.suggestedFix ?? changes[0]?.explanation).toBe(stored?.explanation);
  },
);

test('omitting the suggestion preserves it while editing another field', async () => {
  const { alice, reviewId, findingId } = await fixture();
  const suggestedFix = 'Add a qualification.';
  await alice.mutation(api.findings.edit, { findingId, suggestedFix });
  await alice.mutation(api.findings.edit, { findingId, severity: 'recommended' });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.findings.find((f) => f._id === findingId)).toMatchObject({
    suggestedFix,
    severity: 'recommended',
  });
});

test.each(['title', 'explanation'] as const)(
  'required %s still cannot be cleared',
  async (field) => {
    const { alice, reviewId, findingId } = await fixture();
    const before = await alice.query(api.reviews.get, { reviewId });
    await expect(alice.mutation(api.findings.edit, { findingId, [field]: '  ' })).rejects.toThrow(
      ConvexError,
    );
    expect(await alice.query(api.reviews.get, { reviewId })).toEqual(before);
  },
);

test('dismissal reason updates the current dismissal event without a second event', async () => {
  const { alice, bob, reviewId, findingId } = await fixture();
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  const initial = await alice.query(api.reviews.get, { reviewId });
  const dismissal = initial.events.find((e) => e.type === 'finding_dismissed');
  await expect(
    bob.mutation(api.findings.setStatus, {
      findingId,
      status: 'dismissed',
      reason: 'Unauthorized',
    }),
  ).rejects.toThrow('not found');
  for (const reason of ['Already qualified', 'Not applicable'])
    await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed', reason });
  const updated = await alice.query(api.reviews.get, { reviewId });
  expect(updated.events).toHaveLength(initial.events.length);
  expect(updated.events.filter((e) => e.type === 'finding_dismissed')).toEqual([
    { ...dismissal, detail: 'Not applicable' },
  ]);
  expect(updated.findings.find((f) => f._id === findingId)?.dismissReason).toBe('Not applicable');
  expect(updated.review.counts).toEqual(initial.review.counts);
  await alice.mutation(api.findings.setStatus, { findingId, status: 'open' });
  await alice.mutation(api.findings.setStatus, {
    findingId,
    status: 'dismissed',
    reason: 'Second dismissal',
  });
  await alice.mutation(api.findings.setStatus, {
    findingId,
    status: 'dismissed',
    reason: 'Updated second reason',
  });
  const reopened = await alice.query(api.reviews.get, { reviewId });
  const events = reopened.events.filter((e) => e.type === 'finding_dismissed');
  expect(events).toHaveLength(2);
  expect(events.map((e) => e.detail)).toEqual(['Not applicable', 'Updated second reason']);
});
