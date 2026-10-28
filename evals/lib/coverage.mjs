// A lead-approved evidence exception: an explanation can explicitly cite a
// bottom-only paid disclosure even when the location points to the byline.
// Suggested fixes are excluded so hypothetical placement advice cannot qualify.
export function citesBottomOnlyDisclosure(finding) {
  const text = [finding.title, finding.explanation, finding.location?.quote].join(' ');
  if (/\bnot\s+only\b/i.test(text)) return false;
  const disclosure = '(?:disclos\\w*|paid[- ]advertis\\w*|compensat\\w*)';
  const bottom = '(?:bottom|footer|end of (?:the )?(?:article|page|story))';
  return (
    new RegExp(`\\b${disclosure}\\b[^.!?]{0,180}\\bonly\\b[^.!?]{0,100}\\b${bottom}\\b`, 'i').test(
      text,
    ) ||
    new RegExp(
      `\\b(?:only|sole)\\b[^.!?]{0,80}\\b${disclosure}\\b[^.!?]{0,180}\\b${bottom}\\b`,
      'i',
    ).test(text)
  );
}
