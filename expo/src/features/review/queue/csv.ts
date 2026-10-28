const headings = [
  'Submission title',
  'Product',
  'Channel',
  'Where it runs',
  'Campaign',
  'Version',
  'Decision outcome',
  'Decided by',
  'Decided at (ISO)',
  'Note',
  'Accepted findings',
  'Dismissed count',
  'Rule versions applied',
  'AI cost (USD)',
  'Review link',
];
export function decisionCsv(rows: (string | number)[][]) {
  function quote(value: string | number) {
    const text = String(value);
    // Keep spreadsheet programs from evaluating a submitted title or note as a formula.
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return (
    '\uFEFF' + [headings, ...rows].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n'
  );
}
