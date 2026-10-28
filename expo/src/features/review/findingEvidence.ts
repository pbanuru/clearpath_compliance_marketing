import { locationLabel, type Finding } from './model';

export function findingEvidence(finding: Finding) {
  const quote = finding.location?.quote?.trim();
  const firstSentence = new Intl.Segmenter('en', { granularity: 'sentence' })
    .segment(finding.explanation)
    [Symbol.iterator]()
    .next().value?.segment;
  const text = quote || firstSentence?.trim() || finding.title;
  const normalize = (value: string) => value.toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
  const location = finding.location;
  let label = locationLabel(finding);
  if (location?.startSeconds !== undefined) {
    const time = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')}`;
    label = `${time(location.startSeconds)}${location.endSeconds !== undefined ? ` to ${time(location.endSeconds)}` : ''}`;
  } else if (location?.page) label = `Page ${location.page}`;
  else if (location?.region) {
    const { x, y, width, height } = location.region;
    const horizontal = x + width / 2;
    const vertical = y + height / 2;
    const row = vertical < 1 / 3 ? 'upper' : vertical > 2 / 3 ? 'lower' : 'middle';
    const column = horizontal < 1 / 3 ? 'left' : horizontal > 2 / 3 ? 'right' : 'center';
    label = `Image, ${row} ${column}`;
  }
  return {
    text,
    quoted: !!quote,
    label,
    repeatsTitle: normalize(text) === normalize(finding.title),
  };
}
