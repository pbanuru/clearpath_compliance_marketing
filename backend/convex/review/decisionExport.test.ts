import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { decisionCsv } from '../../../expo/src/features/review/queue/csv';
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
test('decision export isolates owners and emits one row per decision plus undecided submissions', async () => {
  const { t, alice, bob, reviewId, findingId, input } = await fixture();
  const pending = await alice.mutation(api.reviews.create, { ...input, title: 'Undecided' });
  await alice.mutation(api.reviews.decide, {
    reviewId,
    version: 1,
    outcome: 'changes_requested',
    note: 'Fix the claim, please.',
  });
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: input.assetIds,
    responses: [{ findingId, text: 'Fixed' }],
  });
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', reviewId, { status: 'in_review' });
  });
  await alice.mutation(api.reviews.decide, {
    reviewId,
    version: 2,
    outcome: 'approved',
    note: 'Approved revised material.',
  });
  for (let i = 0; i < 22; i++)
    await alice.mutation(api.reviews.create, { ...input, title: `Pending ${i}` });
  const rows = await alice.action(api.reviews.exportDecisions, { filter: 'all' });
  expect(rows).toHaveLength(25);
  expect(rows.filter((r) => r.reviewId === reviewId).map((r) => [r.version, r.outcome])).toEqual([
    [1, 'changes_requested'],
    [2, 'approved'],
  ]);
  expect(rows.find((r) => r.reviewId === pending)).toMatchObject({
    outcome: '',
    decidedAt: '',
    aiCostUsd: null,
  });
  expect(rows.find((r) => r.version === 1 && r.reviewId === reviewId)?.acceptedFindings).toBe(
    'Remove guarantee',
  );
  expect(await bob.action(api.reviews.exportDecisions, { filter: 'all' })).toEqual([]);
  expect(await alice.action(api.reviews.exportDecisions, { filter: 'approved' })).toHaveLength(2);
  await expect(t.action(api.reviews.exportDecisions, { filter: 'all' })).rejects.toThrow('Sign in');
});
test('CSV has a BOM, quoted cells, CRLF, escaped quotes, line breaks, and safe spreadsheet values', () => {
  const csv = decisionCsv([['=HYPERLINK("bad")', 'Comma, quote " and\nnew line', 2]]);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"Comma, quote "" and\nnew line"');
  expect(csv).toContain('\r\n');
  expect(csv.endsWith('\r\n')).toBe(true);
});
