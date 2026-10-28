import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import { fixture } from './reviewTest.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function incomplete() {
  const data = await fixture();
  await data.t.run(async (ctx) => {
    await ctx.db.patch('findings', data.findingId, { source: 'ai', status: 'open' });
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', data.reviewId).eq('number', 1))
      .unique();
    if (!version) throw new Error('Missing version');
    await ctx.db.patch('reviewVersions', version._id, {
      analysis: { status: 'succeeded', extractionNotes: ['Transcript unavailable.'] },
    });
    // Fresh AI findings have no human activity. Remove the fixture's manual
    // finding event so each case starts with a genuinely untouched finding.
    const events = await ctx.db
      .query('reviewEvents')
      .withIndex('by_reviewId_and_at', (q) => q.eq('reviewId', data.reviewId))
      .collect();
    for (const event of events) if (event.findingId) await ctx.db.delete('reviewEvents', event._id);
  });
  return data;
}

test.each(['accepted', 'dismissed', 'edited', 'reopened'] as const)(
  'retry preserves %s AI findings and refuses to replace human work',
  async (activity) => {
    const { alice, reviewId, findingId } = await incomplete();
    if (activity === 'edited')
      await alice.mutation(api.findings.edit, { findingId, title: 'Human correction' });
    else {
      await alice.mutation(api.findings.setStatus, {
        findingId,
        status: activity === 'reopened' ? 'accepted' : activity,
        reason: activity === 'dismissed' ? 'Human dismissal' : undefined,
      });
      if (activity === 'reopened')
        await alice.mutation(api.findings.setStatus, { findingId, status: 'open' });
    }
    const before = await alice.query(api.reviews.get, { reviewId });
    await expect(alice.mutation(api.reviews.retryAnalysis, { reviewId })).rejects.toThrow(
      'after its findings have been reviewed',
    );
    const after = await alice.query(api.reviews.get, { reviewId });
    expect(after).toEqual(before);
    expect(after.review.status).toBe('in_review');
  },
);

test('incomplete analysis can retry before any AI finding is reviewed', async () => {
  const { alice, reviewId } = await incomplete();
  await alice.mutation(api.reviews.retryAnalysis, { reviewId });
  const after = await alice.query(api.reviews.get, { reviewId });
  expect(after.review.status).toBe('checking');
  expect(after.versions[0]?.analysis.status).toBe('queued');
});
