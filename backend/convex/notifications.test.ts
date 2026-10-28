import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { fixture, aliceIdentity, setup } from './reviewTest.helpers';
import { queued } from './pipelineTest.helpers';
import { adjustUnread, notify } from './notificationModel';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const paginationOpts = { numItems: 10, cursor: null };

test('notifications require sign-in and isolate lists, counts, and writes by owner', async () => {
  const { t, alice, bob, reviewId } = await fixture();
  const id = await t.run((ctx) =>
    notify(ctx, aliceIdentity.tokenIdentifier, {
      type: 'analysis_ready',
      title: 'AI check finished: Ad',
      link: { kind: 'review', id: reviewId },
    }),
  );
  if (!id) throw new Error('Expected notification');
  const anonymous = setup();
  for (const call of [
    anonymous.query(api.notifications.list, { filter: 'all', paginationOpts }),
    anonymous.query(api.notifications.unreadCount, {}),
    anonymous.mutation(api.notifications.markRead, { id }),
    anonymous.mutation(api.notifications.markAllRead, {}),
  ])
    await expect(call).rejects.toThrow('Sign in');
  expect(
    (await alice.query(api.notifications.list, { filter: 'all', paginationOpts })).page,
  ).toHaveLength(1);
  expect((await bob.query(api.notifications.list, { filter: 'all', paginationOpts })).page).toEqual(
    [],
  );
  expect(
    (await bob.query(api.notifications.list, { filter: 'unread', paginationOpts })).page,
  ).toEqual([]);
  expect(await bob.query(api.notifications.unreadCount, {})).toBe(0);
  await expect(bob.mutation(api.notifications.markRead, { id })).rejects.toThrow('not found');
  await bob.mutation(api.notifications.markAllRead, {});
  expect(await alice.query(api.notifications.unreadCount, {})).toBe(1);
  await alice.mutation(api.notifications.markRead, { id });
  await alice.mutation(api.notifications.markRead, { id });
  expect(await alice.query(api.notifications.unreadCount, {})).toBe(0);
  expect(
    (await alice.query(api.notifications.list, { filter: 'unread', paginationOpts })).page,
  ).toEqual([]);
});

test('decisions, finding triage, and personal resubmissions never notify the actor', async () => {
  const { alice, reviewId, findingId, input } = await fixture();
  await alice.mutation(api.findings.setStatus, { findingId, status: 'open' });
  await alice.mutation(api.findings.setStatus, { findingId, status: 'accepted' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  await alice.mutation(api.reviews.resubmit, { reviewId, assetIds: input.assetIds, responses: [] });
  expect(await alice.query(api.notifications.unreadCount, {})).toBe(0);
  expect(
    (await alice.query(api.notifications.list, { filter: 'all', paginationOpts })).page,
  ).toEqual([]);
});

test('a revision from another actor can notify its reviewer, with single-line content', async () => {
  const { alice, bob, reviewId } = await fixture();
  await bob.run((ctx) =>
    notify(ctx, aliceIdentity.tokenIdentifier, {
      type: 'revision_received',
      title: 'Revision received:\nLoan ad',
      body: 'Version 2\nis ready',
      link: { kind: 'review', id: reviewId },
    }),
  );
  expect(
    (await alice.query(api.notifications.list, { filter: 'unread', paginationOpts })).page[0],
  ).toMatchObject({
    type: 'revision_received',
    title: 'Revision received: Loan ad',
    body: 'Version 2 is ready',
  });
  expect(await bob.query(api.notifications.unreadCount, {})).toBe(0);
});

test.each([false, true])('ready notification summarizes severity (context=%s)', async (context) => {
  const { t, alice, reviewId } = await queued();
  const started = await t.mutation(internal.review.state.start, { reviewId, version: 1 });
  if (!started) throw new Error('Expected analysis');
  const finding = {
    severity: 'required' as const,
    title: 'Finding',
    policyId: 'other',
    explanation: 'Check the material.',
    suggestedFix: 'Update the copy.',
    confidence: 'high' as const,
  };
  await t.mutation(internal.review.state.finish, {
    reviewId,
    version: 1,
    runKey: started.runKey,
    spans: [],
    extractions: [],
    result: {
      summary: 'Review',
      findings: [
        finding,
        finding,
        finding,
        { ...finding, severity: 'recommended' },
        ...(context ? [{ ...finding, severity: 'needs_context' as const }] : []),
      ],
      previous: [],
    },
  });
  expect(
    (await alice.query(api.notifications.list, { filter: 'all', paginationOpts })).page[0]?.body,
  ).toBe(`3 required · 1 recommended${context ? ' · 1 needs context' : ''}`);
});

test.each([true, false])(
  'analysis completion emits exactly once per run (success=%s)',
  async (success) => {
    const { t, alice, reviewId } = await queued();
    const started = await t.mutation(internal.review.state.start, { reviewId, version: 1 });
    if (!started) throw new Error('Expected running analysis');
    const args = {
      reviewId,
      version: 1,
      runKey: started.runKey,
      spans: [],
      extractions: [],
      result: success ? { summary: 'Clear', findings: [], previous: [] } : null,
      error: success ? undefined : 'Provider unavailable',
    };
    await t.mutation(internal.review.state.finish, { ...args, runKey: 'stale' });
    expect(await alice.query(api.notifications.unreadCount, {})).toBe(0);
    await t.mutation(internal.review.state.finish, args);
    await t.mutation(internal.review.state.finish, args);
    let rows = (await alice.query(api.notifications.list, { filter: 'all', paginationOpts })).page;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: success ? 'analysis_ready' : 'analysis_failed',
      title: `AI check ${success ? 'finished' : 'failed'}: Ad`,
      body: success ? 'No issues found' : 'Review by hand or try the AI check again.',
      link: { kind: 'review', id: reviewId },
    });
    if (!success) {
      await alice.mutation(api.reviews.retryAnalysis, { reviewId });
      const retry = await t.mutation(internal.review.state.start, { reviewId, version: 1 });
      if (!retry) throw new Error('Expected retry');
      await t.mutation(internal.review.state.finish, { ...args, runKey: retry.runKey });
      await t.mutation(internal.review.state.finish, { ...args, runKey: retry.runKey });
      rows = (await alice.query(api.notifications.list, { filter: 'all', paginationOpts })).page;
      expect(rows).toHaveLength(2);
    }
    expect(await alice.query(api.notifications.unreadCount, {})).toBe(rows.length);
    await alice.mutation(api.notifications.markAllRead, {});
    expect(await alice.query(api.notifications.unreadCount, {})).toBe(0);
    expect(
      (await alice.query(api.notifications.list, { filter: 'all', paginationOpts })).page.every(
        (row) => row.readAt !== undefined,
      ),
    ).toBe(true);
  },
);

test('mark all read batches large inboxes and preserves newer arrivals', async () => {
  const { t, alice, reviewId } = await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i < 205; i++)
      await notify(ctx, aliceIdentity.tokenIdentifier, {
        type: 'revision_received',
        title: `Revision ${i}`,
        link: { kind: 'review', id: reviewId },
      });
  });
  await alice.mutation(api.notifications.markAllRead, {});
  await t.run(async (ctx) => {
    await ctx.db.insert('notifications', {
      owner: aliceIdentity.tokenIdentifier,
      type: 'policy_update',
      title: 'Future arrival',
      link: { kind: 'policyUpdate', id: 'future' },
      createdAt: Date.now() + 60000,
    });
    await adjustUnread(ctx, aliceIdentity.tokenIdentifier, 1);
  });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const unread = (await alice.query(api.notifications.list, { filter: 'unread', paginationOpts }))
    .page;
  expect(unread.map((row) => row.title)).toEqual(['Future arrival']);
  expect(await alice.query(api.notifications.unreadCount, {})).toBe(1);
});
