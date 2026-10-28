import './citations.css';
export function PolicyCitation({
  citation,
  label,
  error,
}: {
  citation?: { url: string; excerpt: string; retrievedAt: number };
  label: string;
  error?: string;
}) {
  if (!citation)
    return error ? <p className="cp-small cp-error">Source passage unavailable: {error}</p> : null;
  const cfr = citation.url.match(/title-(\d+).*section-([\d.]+)(?:#p-[\d.]+(.*))?/);
  const citationLabel = cfr
    ? `${cfr[1] ?? ''} CFR ${cfr[2] ?? ''}${cfr[3] ?? ''}`
    : citation.url.includes('native-advertising-guide-businesses')
      ? 'FTC Native Advertising: A Guide for Businesses (2015)'
      : label;
  return (
    <figure className="cp-citation">
      <blockquote>{citation.excerpt}</blockquote>
      <figcaption>
        <cite>{citationLabel}</cite>
        <a href={citation.url} target="_blank" rel="noreferrer">
          Open at source ↗
        </a>
      </figcaption>
    </figure>
  );
}
