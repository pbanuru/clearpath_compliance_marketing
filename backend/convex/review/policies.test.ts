import { expect, test } from 'vitest';
import { applicablePolicies } from './policies';

test('a personal-loan social review excludes card and email policies', () => {
  const selected = new Map(applicablePolicies('personal_loan', 'social').map((p) => [p.id, p]));
  expect(selected.get('approval-claims')).toMatchObject({ id: 'approval-claims' });
  expect(selected.get('card-promo-rate')).toBeUndefined();
  expect(selected.get('email-can-spam')).toBeUndefined();
});
