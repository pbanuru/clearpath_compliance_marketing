import { useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';

type Part = 'image' | 'poster' | 'media';

export function useAssetAccess(assetId?: Id<'assets'>) {
  const [accessVersion, setAccessVersion] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const requestedVersion = useRef(accessVersion);
  const retrying = useRef({ image: false, poster: false, media: false });
  const player = useRef<HTMLMediaElement | null>(null);
  const playing = useRef(false);
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const urls = useQuery(api.assets.access, assetId ? { assetId, accessVersion } : 'skip');

  function refresh() {
    // Changing the query arguments can unmount the player while new URLs load.
    if (player.current && !resume.current)
      resume.current = { time: player.current.currentTime, playing: playing.current };
    const version = Math.max(Date.now(), requestedVersion.current + 1);
    requestedVersion.current = version;
    setAccessVersion(version);
  }
  function retry(part: Part) {
    if (requestedVersion.current !== accessVersion) return;
    if (retrying.current[part]) {
      if (part !== 'poster') setFailed(true);
      return;
    }
    retrying.current[part] = true;
    refresh();
  }
  function loaded(part: Part) {
    if (requestedVersion.current !== accessVersion) return;
    retrying.current[part] = false;
    if (part !== 'poster') setFailed(false);
  }
  const mediaEvents = {
    ref: (element: HTMLMediaElement | null) => {
      player.current = element;
    },
    onPlay: () => {
      playing.current = true;
    },
    onPause: () => {
      if (!player.current?.error) playing.current = false;
    },
    onError: () => retry('media'),
    onLoadedMetadata: () => {
      if (requestedVersion.current !== accessVersion) return;
      const element = player.current;
      const saved = resume.current;
      if (!element || !saved) return;
      element.currentTime = saved.time;
      resume.current = null;
      if (saved.playing)
        void element.play().catch((error: unknown) => {
          if (error instanceof Error && error.name !== 'AbortError')
            console.warn('Unable to resume asset preview.', error);
        });
    },
    onLoadedData: () => loaded('media'),
  };
  return {
    urls,
    failed,
    retry,
    loaded,
    mediaEvents,
    reload: () => {
      setFailed(false);
      retrying.current = { image: false, poster: false, media: false };
      refresh();
    },
  };
}
