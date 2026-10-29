import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Finding, ReviewDetail } from './model';
import { timecode } from './model';
import { TextMaterial } from './TextMaterial';
import type { useAssetAccess } from '@/features/assets/useAssetAccess';

export function MediaPlayer({
  kind,
  url,
  poster,
  selected,
  findings,
  transcript,
  onSelect,
  onTime,
  mediaEvents,
}: {
  kind: 'audio' | 'video';
  url: string;
  poster?: string | null;
  selected?: Finding;
  findings: Finding[];
  transcript?: ReviewDetail['transcripts'][number];
  onSelect: (finding: Finding) => void;
  onTime?: (seconds: number) => void;
  mediaEvents: ReturnType<typeof useAssetAccess>['mediaEvents'];
}) {
  const media = useRef<HTMLMediaElement | null>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const start = selected?.location?.startSeconds;
  useEffect(() => {
    if (media.current && start !== undefined) media.current.currentTime = start;
  }, [selected?._id, start]);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    let frame = 0;
    const paint = () => {
      if (playhead.current && Number.isFinite(element.duration) && element.duration > 0)
        playhead.current.style.left = `${Math.min(100, (element.currentTime / element.duration) * 100)}%`;
    };
    const tick = () => {
      paint();
      if (!element.paused && !element.ended) frame = requestAnimationFrame(tick);
    };
    const play = () => {
      cancelAnimationFrame(frame);
      tick();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      paint();
    };
    element.addEventListener('play', play);
    element.addEventListener('pause', stop);
    element.addEventListener('ended', stop);
    element.addEventListener('seeked', paint);
    element.addEventListener('timeupdate', paint);
    if (element.paused) paint();
    else play();
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('play', play);
      element.removeEventListener('pause', stop);
      element.removeEventListener('ended', stop);
      element.removeEventListener('seeked', paint);
      element.removeEventListener('timeupdate', paint);
    };
  }, [url, kind, duration]);
  function seek(seconds: number) {
    if (!media.current) return;
    media.current.currentTime = seconds;
    setCurrent(seconds);
    if (playhead.current && duration > 0)
      playhead.current.style.left = `${(seconds / duration) * 100}%`;
  }
  function dragPlayhead(event: PointerEvent<HTMLDivElement>) {
    const strip = event.currentTarget.parentElement?.getBoundingClientRect();
    if (strip?.width)
      seek(
        Math.max(0, Math.min(duration, ((event.clientX - strip.left) / strip.width) * duration)),
      );
  }
  function seekSelected() {
    if (media.current && start !== undefined) media.current.currentTime = start;
  }
  const props = {
    ...mediaEvents,
    controls: true,
    src: url,
    preload: 'metadata',
    ref: (element: HTMLMediaElement | null) => {
      media.current = element;
      mediaEvents.ref(element);
    },
    onLoadedMetadata: () => {
      setDuration(media.current?.duration ?? 0);
      seekSelected();
      mediaEvents.onLoadedMetadata();
    },
    onTimeUpdate: () => {
      const value = media.current?.currentTime ?? 0;
      setCurrent(value);
      onTime?.(value);
    },
  };
  return (
    <div className="cp-media-player">
      {kind === 'video' ? <video {...props} poster={poster ?? undefined} /> : <audio {...props} />}
      {!!duration && Number.isFinite(duration) && (
        <div className="cp-marker-strip" aria-label="Finding locations in the recording">
          <input
            className="cp-timeline-seek"
            type="range"
            min={0}
            max={duration}
            step="any"
            value={current}
            aria-label="Seek recording"
            aria-valuetext={`${timecode(current)} of ${timecode(duration)}`}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <div
            className="cp-playhead"
            ref={playhead}
            aria-hidden="true"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragPlayhead(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) dragPlayhead(event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                dragPlayhead(event);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
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
                  seek(f.location?.startSeconds ?? 0);
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
          {transcript.segmentsTruncated && (
            <p className="cp-small">
              Transcript shortened.{' '}
              {transcript.retainedThroughSeconds > 0
                ? `The AI read through ${timecode(transcript.retainedThroughSeconds)}; check the rest of the recording yourself.`
                : 'The AI could not read the speech; check the recording yourself.'}
            </p>
          )}
          <TextMaterial
            text={transcript.segments.map((segment) => segment.text).join('\n')}
            findings={findings}
            selected={selected}
            onSelect={onSelect}
          />
        </section>
      )}
    </div>
  );
}
