// Keep offsets into the original PDF text runs so DOM Ranges can measure each word.
export function pdfQuoteRanges(runs: string[], quote: string) {
  const offsets: { run: number; start: number; end: number }[] = [];
  let text = '';
  function append(value: string, run: number, start: number, end: number) {
    for (const character of value.normalize('NFKC').toLowerCase()) {
      if (character === '\u00ad') continue;
      const normalized = /\s/u.test(character)
        ? ' '
        : /[‘’]/u.test(character)
          ? "'"
          : /[“”]/u.test(character)
            ? '"'
            : character;
      if (normalized === ' ' && text.endsWith(' ')) continue;
      text += normalized;
      // Offsets are UTF-16, as required by Range.setStart/setEnd.
      for (let i = 0; i < normalized.length; i++) offsets.push({ run, start, end });
    }
  }
  runs.forEach((run, index) => {
    let offset = 0;
    for (const character of run) {
      append(character, index, offset, offset + character.length);
      offset += character.length;
    }
    // PDF.js splits lines and words into independent runs, often without spaces.
    append(' ', index, run.length, run.length);
  });
  const needle = quote
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u00ad/gu, '')
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim();
  let source = text;
  let locations = offsets;
  let matched = needle;
  let start = needle ? source.indexOf(needle) : -1;
  if (start < 0 && needle) {
    // Font changes can split a word into separate runs. Ignore layout whitespace
    // only as a fallback, retaining the original glyph offsets for measurement.
    locations = offsets.filter((_, index) => text[index] !== ' ');
    source = text.replaceAll(' ', '');
    matched = needle.replaceAll(' ', '');
    start = source.indexOf(matched);
  }
  if (start < 0) return [];
  const ranges: { run: number; start: number; end: number }[] = [];
  for (let i = start; i < start + matched.length; i++) {
    const offset = locations[i];
    if (!offset || source[i] === ' ' || offset.start === offset.end) continue;
    const previous = ranges.at(-1);
    if (previous?.run === offset.run && previous.end === offset.start) previous.end = offset.end;
    else if (!previous || previous.run !== offset.run || previous.end !== offset.end)
      ranges.push({ ...offset });
  }
  return ranges;
}
