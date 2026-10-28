import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import { fixture } from './reviewTest.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

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
