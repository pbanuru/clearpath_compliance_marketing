import { useEffect, useRef } from 'react';
import { FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { useAssetAccess } from '@/features/assets/useAssetAccess';
import type { Asset, Finding, ReviewDetail } from './model';
import { TextMaterial } from './TextMaterial';
import { MediaPlayer } from './MediaPlayer';
import { WebpageMaterial } from './WebpageMaterial';
import { revealMaterialHighlight } from './materialScroll';
import { PdfViewer } from './PdfViewer';

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
  const access = useAssetAccess(asset.kind === 'text' ? undefined : asset._id);
  const { urls, failed } = access;
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
      {asset.kind === 'webpage' ? (
        <WebpageMaterial
          asset={asset}
          url={urls.original}
          selected={selected}
          findings={findings}
          onSelect={onSelect}
          onError={() => access.retry('image')}
          onLoad={() => access.loaded('image')}
        />
      ) : asset.kind === 'image' ? (
        <div className="cp-image-stage" ref={imageStage}>
          <div className="cp-image-wrap">
            <img
              src={urls.original}
              alt={asset.name}
              onLoad={() => {
                access.loaded('image');
                revealImageRegion(imageStage.current);
              }}
              onError={() => access.retry('image')}
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
          mediaEvents={access.mediaEvents}
        />
      ) : (
        <PdfViewer
          key={urls.original}
          url={urls.original}
          name={asset.name}
          selected={selected}
          reload={access.reload}
          findings={findings}
          onSelect={onSelect}
        />
      )}
      {failed && (
        <div className="cp-error" role="alert">
          This browser could not preview this file. Open the original, or reload the preview.
          <button className="cp-button" onClick={access.reload}>
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
