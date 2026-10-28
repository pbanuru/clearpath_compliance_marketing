import { useEffect, useRef, useState } from 'react';
import type { Finding, ReviewDetail } from './model';
import { timecode } from './model';
import { TextMaterial } from './TextMaterial';

export function MediaPlayer({
  kind,
  url,
  poster,
  selected,
  findings,
  transcript,
  onSelect,
  onTime,
  onError,
}: {
  kind: 'audio' | 'video';
  url: string;
  poster?: string | null;
  selected?: Finding;
  findings: Finding[];
  transcript?: ReviewDetail['transcripts'][number];
  onSelect: (finding: Finding) => void;
  onTime?: (seconds: number) => void;
  onError: () => void;
}) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const start = selected?.location?.startSeconds;
  useEffect(() => {
    if (media.current && start !== undefined) media.current.currentTime = start;
  }, [selected?._id, start]);
  function seekSelected() {
    if (media.current && start !== undefined) media.current.currentTime = start;
  }
  const props = {
    controls: true,
    src: url,
    preload: 'metadata',
    ref: (element: HTMLMediaElement | null) => {
      media.current = element;
    },
    onLoadedMetadata: () => {
      setDuration(media.current?.duration ?? 0);
      seekSelected();
    },
    onTimeUpdate: () => {
      const value = Math.floor(media.current?.currentTime ?? 0);
      setCurrent(value);
      onTime?.(value);
    },
    onError,
  };
  return (
    <div className="cp-media-player">
      {kind === 'video' ? <video {...props} poster={poster ?? undefined} /> : <audio {...props} />}
      {!!duration && Number.isFinite(duration) && (
        <div className="cp-marker-strip" aria-label="Finding locations in the recording">
          <div
            className="cp-playhead"
            style={{ left: `${Math.min(100, (current / duration) * 100)}%` }}
          />
          {findings
            .filter((f) => f.location?.startSeconds !== undefined)
            .map((f) => (
              <button
                key={f._id}
                type="button"
                className={`cp-time-marker ${f.severity} ${f._id === selected?._id ? 'selected' : ''}`}
                style={{
                  left: `${((f.location?.startSeconds ?? 0) / duration) * 100}%`,
                  width: `${Math.max(2, (((f.location?.endSeconds ?? (f.location?.startSeconds ?? 0) + 1) - (f.location?.startSeconds ?? 0)) / duration) * 100)}%`,
                }}
                title={`${timecode(f.location?.startSeconds ?? 0)}: ${f.title}`}
                aria-label={`Go to ${timecode(f.location?.startSeconds ?? 0)}: ${f.title}`}
                onClick={() => {
                  onSelect(f);
                  if (media.current) media.current.currentTime = f.location?.startSeconds ?? 0;
                }}
              />
            ))}
        </div>
      )}
      {start !== undefined && (
        <p className="cp-small">
          Selected finding: {timecode(start)}
          {selected?.location?.endSeconds !== undefined
            ? `–${timecode(selected.location.endSeconds)}`
            : ''}
        </p>
      )}
      {transcript?.status === 'succeeded' && (
        <section className="cp-transcript">
          <h3>Transcript</h3>
          {transcript.segments.map((segment, i) => (
            <div key={i} className="cp-transcript-line">
              <button
                className="cp-transcript-time"
                type="button"
                onClick={() => {
                  if (media.current) media.current.currentTime = segment.start;
                }}
              >
                {timecode(segment.start)}
              </button>
              <TextMaterial
                text={segment.text}
                findings={findings}
                selected={selected}
                onSelect={onSelect}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
