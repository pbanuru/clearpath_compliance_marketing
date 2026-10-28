import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Asset, Finding, ReviewDetail } from './model';
import { TextMaterial } from './TextMaterial';
import { MediaPlayer } from './MediaPlayer';
import { revealMaterialHighlight } from './materialScroll';

function revealImageRegion(container: HTMLDivElement | null) {
  revealMaterialHighlight(container?.querySelector('.cp-image-region.selected'));
}

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
  const imageStage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    revealImageRegion(imageStage.current);
  }, [selected?._id]);
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
  return (
    <div className="cp-asset-viewer" data-asset-id={asset._id} data-kind={asset.kind}>
      {asset.kind === 'image' || asset.kind === 'webpage' ? (
        <div className="cp-image-stage" ref={imageStage}>
          <div className="cp-image-wrap">
            <img
              src={urls.original}
              alt={asset.name}
              onLoad={() => revealImageRegion(imageStage.current)}
              onError={() => setFailed(true)}
            />
            {findings
              .filter((f) => f.location?.region)
              .map((finding) => {
                const box = finding.location?.region;
                return (
                  box && (
                    <button
                      key={finding._id}
                      className={`cp-image-region ${finding.severity} ${selected?._id === finding._id ? 'selected' : ''}`}
                      title={finding.title}
                      aria-label={`Select finding: ${finding.title}`}
                      aria-pressed={selected?._id === finding._id}
                      onClick={() => onSelect(finding)}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`,
                      }}
                    />
                  )
                );
              })}
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
