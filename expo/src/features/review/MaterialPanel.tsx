import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import type { Finding, ReviewDetail, Version } from './model';
import { AssetViewer } from './AssetViewer';
import { CompareMaterial } from './CompareMaterial';

export function MaterialPanel({
  version,
  previous,
  findings,
  selected,
  selectedAsset,
  onAsset,
  onSelect,
  onTime,
  compare,
  setCompare,
  transcripts,
}: {
  version: Version;
  previous?: Version;
  findings: Finding[];
  selected?: Finding;
  selectedAsset?: Id<'assets'>;
  onAsset: (id: Id<'assets'>) => void;
  onSelect: (finding: Finding) => void;
  onTime: (seconds: number) => void;
  compare: boolean;
  setCompare: (value: boolean) => void;
  transcripts: ReviewDetail['transcripts'];
}) {
  const asset = version.assets.find((a) => a._id === selectedAsset) ?? version.assets[0];
  const previousAsset =
    previous?.assets.find((a) => a.name === asset?.name) ??
    previous?.assets[version.assets.findIndex((a) => a._id === asset?._id)];
  return (
    <section className="cp-material-panel" aria-label="Material">
      <div className="cp-material-toolbar">
        <h2>
          Material{' '}
          <span className="cp-small">
            {version.assets.length} {version.assets.length === 1 ? 'item' : 'items'}
          </span>
        </h2>
        {previous && (
          <label className="cp-compare-toggle">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            Compare with version {previous.number}
          </label>
        )}
      </div>
      <div className="cp-asset-tabs" role="tablist" aria-label="Material files">
        {version.assets.map((a, i) => (
          <button
            key={a._id}
            id={`asset-tab-${a._id}`}
            role="tab"
            type="button"
            aria-selected={asset?._id === a._id}
            tabIndex={asset?._id === a._id ? 0 : -1}
            aria-controls="material-viewer"
            onClick={() => onAsset(a._id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next =
                version.assets[
                  (i + (e.key === 'ArrowRight' ? 1 : -1) + version.assets.length) %
                    version.assets.length
                ];
              if (next) {
                onAsset(next._id);
                document.getElementById(`asset-tab-${next._id}`)?.focus();
              }
            }}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div
        id="material-viewer"
        role="tabpanel"
        aria-labelledby={asset ? `asset-tab-${asset._id}` : undefined}
        className="cp-material-body"
      >
        {asset &&
          (compare && previousAsset && previous ? (
            <CompareMaterial
              previous={previousAsset}
              current={asset}
              previousNumber={previous.number}
              currentNumber={version.number}
            />
          ) : (
            <AssetViewer
              key={asset._id}
              asset={asset}
              findings={findings.filter((f) => f.location?.assetId === asset._id)}
              selected={selected?.location?.assetId === asset._id ? selected : undefined}
              transcript={transcripts.find((t) => t.assetId === asset._id)}
              onSelect={onSelect}
              onTime={onTime}
            />
          ))}
        {compare && !previousAsset && (
          <p className="cp-small">This material was added in version {version.number}.</p>
        )}
      </div>
    </section>
  );
}
