import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { workspace } from './test.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('an editor opened at an earlier policy version cannot overwrite an intervening source update', async () => {
  const { t, alice } = await workspace();
  const add = (fingerprint: string) =>
    t.run((ctx) =>
      ctx.db.insert('policyUpdates', {
        owner: 'https://auth.example|alice',
        key: 'fair-lending',
        fingerprint,
        title: 'Fair lending update',
        kind: 'amended',
        appliesTo: {},
        detectedAt: Date.now(),
        evidence: {
          url: 'https://www.ecfr.gov/current/title-12/part-1002/section-1002.4',
          excerpt: 'A creditor shall not discriminate against an applicant.',
        },
        aiSummary: 'Clarify fair lending obligations.',
        proposedCheck: 'Earlier proposal.',
        status: 'open',
      }),
    );
  const staleUpdate = await add('earlier-proposal');
  const interveningUpdate = await add('intervening-proposal');
  const openedVersion = (await alice.query(api.policies.list, {})).find(
    (p) => p.key === 'fair-lending',
  )?.currentVersion;
  expect(openedVersion).toBe(1);
  await alice.mutation(api.policies.apply, {
    updateId: interveningUpdate,
    check: 'Intervening reviewer-approved check.',
    expectedVersion: 1,
  });
  await expect(
    alice.mutation(api.policies.apply, {
      updateId: staleUpdate,
      check: 'Earlier proposal.',
      expectedVersion: openedVersion ?? 0,
    }),
  ).rejects.toThrow('This policy changed');
  const history = await alice.query(api.policies.history, { key: 'fair-lending' });
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({ version: 2, check: 'Intervening reviewer-approved check.' });
  expect(
    (await alice.query(api.policies.updates, {})).find((u) => u._id === staleUpdate)?.status,
  ).toBe('open');
});
