import { expect, test } from 'vitest';
import { systemPrompt } from './prompt';

test('the authoritative ClearPath facts immediately follow the opening paragraph', () => {
  const prompt = systemPrompt('personal_loan', 'social');
  const facts =
    'Facts about ClearPath to apply: ClearPath underwrites every credit application, and no ClearPath product approves every applicant. Every application involves a credit check: checking a rate uses a soft inquiry, and applying uses a hard inquiry. Rates, fees, and terms depend on the applicant. Treat claims that contradict these facts (guaranteed or instant approval for everyone, no credit check, one rate for all) as required findings, not needs_context.';
  expect(prompt.split('\n\n')[1]).toBe(facts);
  expect(prompt.split('\n\n')[2]).toMatch(/^Review the complete communication/);
  expect(prompt).toContain('whether a testimonial is from a real customer');
  expect(prompt).toContain('Report a finding only when you can point to the specific content');
  expect(prompt).toContain('approval-claims:');
  expect(prompt).not.toContain('card-promo-rate:');
  expect(prompt).not.toContain('email-can-spam:');
});
