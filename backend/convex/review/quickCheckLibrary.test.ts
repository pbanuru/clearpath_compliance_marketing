import { expect, test } from 'vitest';
import { questions, parseQuickCheck, contextHash } from './quickCheckLogic';
import type { Infer } from 'convex/values';
import type { policy } from './policies';
import type { Id } from '../_generated/dataModel';

test('provided library replaces seeds, respects empty applicability, strips source metadata, and invalidates cached revisions', async () => {
  const common = {
    kind: 'clearpath_standard' as const,
    source: { label: 'ClearPath custom standard', url: null, monitor: { type: 'internal' } },
  };
  const library: Infer<typeof policy>[] = [
    {
      ...common,
      id: 'custom',
      title: 'Custom rule',
      check: 'Include the new disclosure.',
      appliesTo: { products: [], channels: [] },
    },
    {
      ...common,
      id: 'card-only',
      title: 'Card rule',
      check: 'State card fees.',
      appliesTo: { products: ['credit_card'] },
    },
  ];
  const qs = questions('personal_loan', 'social', library);
  expect(qs.map((q) => q.name)).toEqual(['custom']);
  expect(qs[0]?.instructions).toContain('Include the new disclosure.');
  const result = parseQuickCheck(
    { answers: [{ name: 'custom', type: 'predicate', probability: 0.8 }] },
    'personal_loan',
    'social',
    library,
  );
  expect(result[0]).toMatchObject({ ruleId: 'custom', probability: 0.8, band: 'likely' });
  expect(result[0]?.source).toEqual({ label: 'ClearPath custom standard', url: null });
  const assetIds: Id<'assets'>[] = [];
  const context = {
    assetIds,
    product: 'personal_loan' as const,
    channel: 'social' as const,
    jurisdictions: ['US'],
  };
  const before = await contextHash(context, library);
  expect(await contextHash(context, [...library].reverse())).toBe(before);
  expect(
    await contextHash(
      context,
      library.map((r) => ({ ...r, check: 'Changed disclosure requirement.' })),
    ),
  ).not.toBe(before);
  expect(
    await contextHash(
      context,
      library.map((r) => ({ ...r, source: { label: 'Changed authority', url: null } })),
    ),
  ).not.toBe(before);
});
