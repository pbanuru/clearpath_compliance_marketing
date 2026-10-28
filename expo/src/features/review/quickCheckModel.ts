import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';

export type QuickCheck = Doc<'quickChecks'>;
export type QuickRule = QuickCheck['rules'][number];
export const authorities = ['CFPB', 'FTC', 'FCC', 'Platforms', 'ClearPath standards'] as const;
export function authority(source: QuickRule['source']) {
  const text = `${source.label} ${source.url ?? ''}`;
  if (/ClearPath/i.test(source.label)) return 'ClearPath standards';
  if (/meta|google/i.test(text)) return 'Platforms';
  if (/FTC|CAN-SPAM|Endorsement|title-16|Part 255/i.test(text)) return 'FTC';
  if (/FCC|TCPA|title-47|64\.1200/i.test(text)) return 'FCC';
  return 'CFPB';
}
export function clearLabel(rules: QuickRule[], includePercent = false) {
  const clear = rules.filter((r) => r.band === 'low').length;
  return `${clear} of ${rules.length} ${includePercent ? 'rules ' : ''}clear${includePercent ? ` · ${Math.round((clear / rules.length) * 100)}%` : ''}`;
}
export function clearShare(rules: QuickRule[]) {
  return rules.length ? rules.filter((r) => r.band === 'low').length / rules.length : 0;
}
