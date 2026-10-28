import { useState } from 'react';
import { Link } from 'expo-router';
import { useQuery } from 'convex/react';
import { FiArrowLeft } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { products, channels, Status, dateTime, whereRuns, type Finding } from './model';
import { MaterialPanel } from './MaterialPanel';
import { FindingsPanel } from './FindingsPanel';
import { FindingEditor } from './FindingEditor';
import { ExampleGuide } from './ExampleGuide';
import { DecisionBar } from './DecisionBar';
import './detail.css';
import './findings.css';
import './triage.css';
import './decision.css';
import './material.css';
import './highlights.css';

export function Review({ id }: { id: Id<'reviews'> }) {
  const data = useQuery(api.reviews.get, { reviewId: id });
  const policies = useQuery(api.policies.list, {});
  const [number, setNumber] = useState<number>();
  const [selectedId, setSelected] = useState<Id<'findings'> | null>();
  const [assetId, setAsset] = useState<Id<'assets'>>();
  const [mobilePanel, setMobilePanel] = useState('material');
  const [compare, setCompare] = useState(false);
  const [editor, setEditor] = useState<Finding | 'new'>();
  const [seconds, setSeconds] = useState(0);
  if (!data)
    return (
      <main className="cp-page">
        <p role="status">Loading review…</p>
      </main>
    );
  const { review, versions } = data;
  const version = versions.find((v) => v.number === (number ?? review.currentVersion));
  if (!version)
    return (
      <main className="cp-page">
        <h1>Version unavailable</h1>
        <Link href="/">Return to the review queue</Link>
      </main>
    );
  const findings = data.findings.filter((f) => f.version === version.number);
  const selected =
    selectedId === undefined
      ? (findings.find((f) => f.severity === 'required') ?? findings[0])
      : findings.find((f) => f._id === selectedId);
  const previous = versions.find((v) => v.number === version.number - 1);
  const editable = review.status === 'in_review' && version.number === review.currentVersion;
  const selectedAsset =
    version.assets.find((a) => a._id === (assetId ?? selected?.location?.assetId)) ??
    version.assets[0];
  function select(finding: Finding) {
    setSelected(finding._id);
    if (finding.location) setAsset(finding.location.assetId);
    setMobilePanel('findings');
    requestAnimationFrame(() => {
      const phone = window.matchMedia('(max-width: 1023px)').matches;
      const target = `finding-${finding._id}`;
      document.getElementById(target)?.scrollIntoView({ block: phone ? 'start' : 'nearest' });
    });
  }
  return (
    <main className="cp-review" data-mobile-panel={mobilePanel} data-editable={editable}>
      <header className="cp-review-header">
        <Link href="/" asChild>
          <a className="cp-back">
            <FiArrowLeft /> Review queue
          </a>
        </Link>
        <div className="cp-review-title">
          <h1 title={review.title}>{review.title}</h1>
          <div className="cp-actions">
            <Status
              status={
                version.number === review.currentVersion
                  ? review.status
                  : (data.decisions.find((d) => d.version === version.number)?.outcome ??
                    'in_review')
              }
            />
            {review.example && <span className="cp-pill">Example</span>}
          </div>
        </div>
        <p className="cp-review-context">
          {products[review.product]} · {channels[review.channel]} ·{' '}
          {whereRuns(review.jurisdictions)}
        </p>
        <div className="cp-review-meta">
          {versions.length > 1 ? (
            <label className="cp-version-select">
              <select
                aria-label="Review version"
                value={version.number}
                onChange={(e) => {
                  setNumber(Number(e.target.value));
                  setSelected(undefined);
                  setAsset(undefined);
                  setCompare(false);
                  setSeconds(0);
                }}
              >
                {versions.map((v) => (
                  <option key={v.number} value={v.number}>
                    Version {v.number} of {review.currentVersion}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>Version 1</span>
          )}
          <span>Submitted {dateTime(version.createdAt)}</span>
          <span className="cp-cost">
            AI check{' '}
            {data.cost.unknownCalls > 0 || review.status === 'checking'
              ? `${data.cost.knownUsd > 0 ? `$${data.cost.knownUsd.toFixed(2)} + ` : ''}cost pending`
              : `$${data.cost.knownUsd.toFixed(2)}`}
          </span>
        </div>
        {(review.offerTerms || review.notes || review.goLiveDate || version.submitterNote) && (
          <details className="cp-context-details">
            <summary>Submission details</summary>
            {review.offerTerms && (
              <p>
                <strong>Offer terms:</strong> {review.offerTerms}
              </p>
            )}
            {review.goLiveDate && (
              <p>
                <strong>Go-live date:</strong> {review.goLiveDate}
              </p>
            )}
            {review.notes && (
              <p>
                <strong>Notes:</strong> {review.notes}
              </p>
            )}
            {version.submitterNote && (
              <p>
                <strong>Revision note:</strong> {version.submitterNote}
              </p>
            )}
          </details>
        )}
      </header>
      <ExampleGuide data={data} />
      <div className="cp-mobile-segments">
        <button
          type="button"
          aria-pressed={mobilePanel === 'material'}
          onClick={() => setMobilePanel('material')}
        >
          Material
        </button>
        <button
          type="button"
          aria-pressed={mobilePanel === 'findings'}
          onClick={() => setMobilePanel('findings')}
        >
          Findings ({findings.length})
        </button>
      </div>
      <div className="cp-review-columns">
        <MaterialPanel
          version={version}
          previous={previous}
          findings={findings}
          selected={selected}
          selectedAsset={selectedAsset?._id}
          onAsset={(id) => {
            setAsset(id);
            setSelected(null);
            setSeconds(0);
          }}
          onSelect={(finding) => select(finding)}
          onTime={setSeconds}
          compare={compare}
          setCompare={setCompare}
          transcripts={data.transcripts}
        />
        <FindingsPanel
          data={data}
          version={version}
          findings={findings}
          selected={selected}
          editable={editable}
          policies={policies ?? []}
          onSelect={select}
          onEdit={setEditor}
          onAdd={() => {
            const media =
              selectedAsset &&
              document.querySelector<HTMLMediaElement>(
                `[data-asset-id="${selectedAsset._id}"] video, [data-asset-id="${selectedAsset._id}"] audio`,
              );
            if (media) setSeconds(media.currentTime);
            setEditor('new');
          }}
          onRevised={() => {
            setNumber(undefined);
            setAsset(undefined);
            setSelected(undefined);
            setCompare(false);
            setSeconds(0);
            requestAnimationFrame(() =>
              document.querySelector('.cp-findings-panel')?.scrollIntoView({ block: 'start' }),
            );
          }}
        />
      </div>
      {editable && (
        <DecisionBar
          key={version.number}
          reviewId={review._id}
          version={version.number}
          accepted={findings.filter((f) => f.status === 'accepted').length}
          open={findings.filter((f) => f.status === 'open').length}
          requiredOpen={
            findings.filter((f) => f.status === 'open' && f.severity === 'required').length
          }
        />
      )}
      {editor && (
        <FindingEditor
          finding={editor === 'new' ? undefined : editor}
          reviewId={id}
          asset={selectedAsset}
          seconds={seconds}
          policies={policies ?? []}
          onClose={() => setEditor(undefined)}
        />
      )}
    </main>
  );
}
