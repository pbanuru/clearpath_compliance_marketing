import { useState } from 'react';
import { useQuery } from 'convex/react';
import { FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Asset, Finding, ReviewDetail } from './model';
import { TextMaterial } from './TextMaterial';
import { MediaPlayer } from './MediaPlayer';

export function AssetViewer({
  asset,
  findings = [],
  selected,
  transcript,
  onSelect = () => undefined,
  onTime,
}: {
  asset: Asset;
  findings?: Finding[];
  selected?: Finding;
  transcript?: ReviewDetail['transcripts'][number];
  onSelect?: (finding: Finding) => void;
  onTime?: (seconds: number) => void;
}) {
  const [accessVersion, setAccessVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const urls = useQuery(
    api.assets.access,
    asset.kind === 'text' ? 'skip' : { assetId: asset._id, accessVersion },
  );
  if (asset.kind === 'text')
    return (
      <TextMaterial
        text={asset.content.text}
        findings={findings}
        selected={selected}
        onSelect={onSelect}
      />
    );
  if (!urls?.original)
    return (
      <p className="cp-preview-loading" role="status">
        Loading material…
      </p>
    );
  const region = selected?.location?.region;
  return (
    <div className="cp-asset-viewer">
      {asset.kind === 'image' || asset.kind === 'webpage' ? (
        <div className="cp-image-stage">
          <div className="cp-image-wrap">
            <img src={urls.original} alt={asset.name} onError={() => setFailed(true)} />
            {region && (
              <div
                className="cp-image-region"
                aria-label="Selected finding image region"
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.width * 100}%`,
                  height: `${region.height * 100}%`,
                }}
              >
                <span>Selected issue</span>
              </div>
            )}
          </div>
        </div>
      ) : asset.kind === 'video' || asset.kind === 'audio' ? (
        <MediaPlayer
          kind={asset.kind}
          url={urls.original}
          poster={urls.poster}
          selected={selected}
          findings={findings}
          transcript={transcript}
          onSelect={onSelect}
          onTime={onTime}
          onError={() => setFailed(true)}
        />
      ) : (
        <iframe
          key={`${asset._id}-${selected?.location?.page ?? 1}`}
          className="cp-pdf"
          src={`${urls.original}#page=${selected?.location?.page ?? 1}`}
          title={asset.name}
        />
      )}
      {failed && (
        <div className="cp-error" role="alert">
          This browser could not preview this file. Open the original, or reload the preview.
          <button
            className="cp-button"
            onClick={() => {
              setFailed(false);
              setAccessVersion(Date.now());
            }}
          >
            <FiRefreshCw /> Reload preview
          </button>
        </div>
      )}
      <a
        className="cp-open-original cp-small"
        href={urls.original}
        target="_blank"
        rel="noreferrer"
      >
        {asset.kind === 'document' ? 'Open PDF' : 'Open original'} <FiExternalLink />
      </a>
    </div>
  );
}
