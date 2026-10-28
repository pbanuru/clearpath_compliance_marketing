import { FiFile, FiFileText, FiGlobe, FiHeadphones, FiImage, FiVideo } from 'react-icons/fi';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import type { Finding, ReviewDetail, Version } from './model';
import { AssetViewer } from './AssetViewer';
import { CompareMaterial } from './CompareMaterial';

const typeIcons = {
  image: FiImage,
  text: FiFileText,
  document: FiFile,
  webpage: FiGlobe,
  video: FiVideo,
  audio: FiHeadphones,
};

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
    <section className="cp-material-panel" aria-label="Resources" tabIndex={0}>
      {(previous || version.assets.length > 1) && (
        <div className="cp-material-toolbar">
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
          {version.assets.length > 1 && (
            <div className="cp-asset-tabs" role="tablist" aria-label="Material files">
              {version.assets.map((a, i) => {
                const Icon = typeIcons[a.kind];
                const count = findings.filter(
                  (finding) => finding.location?.assetId === a._id,
                ).length;
                return (
                  <button
                    key={a._id}
                    id={`asset-tab-${a._id}`}
                    role="tab"
                    type="button"
                    aria-selected={asset?._id === a._id}
                    aria-label={`${a.name}, ${count} ${count === 1 ? 'finding' : 'findings'}`}
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
                    <Icon aria-hidden="true" />
                    <span className="cp-asset-name">{a.name}</span>
                    <span className="cp-asset-count" aria-hidden="true">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div
        id="material-viewer"
        role={version.assets.length > 1 ? 'tabpanel' : undefined}
        aria-label={version.assets.length === 1 ? asset?.name : undefined}
        aria-labelledby={version.assets.length > 1 && asset ? `asset-tab-${asset._id}` : undefined}
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
