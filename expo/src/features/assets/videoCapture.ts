const hiddenMessage = 'Waiting for this tab to be visible to read the video';
type Progress = (message: string) => void;

export function waitForVisible(onProgress: Progress) {
  if (document.visibilityState !== 'hidden') return Promise.resolve();
  onProgress(hiddenMessage);
  return new Promise<void>((resolve) => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onVisibility);
      onProgress('Reading video…');
      resolve();
    }
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
  });
}

/** Count only visible time: background tabs can suspend the media decoder. */
export function waitForMedia(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'seeked',
  start: () => void,
  onProgress: Progress,
  timeoutMessage: string,
  decodeMessage: string,
) {
  return new Promise<void>((resolve, reject) => {
    let remaining = 30000;
    let startedAt = 0;
    let timer: number | undefined;
    let started = false;
    let ready = false;
    function pause() {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
    }
    function cleanup() {
      pause();
      video.removeEventListener(event, onReady);
      video.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onVisibility);
    }
    function onError() {
      cleanup();
      reject(new Error(decodeMessage));
    }
    function onReady() {
      ready = true;
      if (document.visibilityState === 'hidden') return;
      cleanup();
      resolve();
    }
    function onVisibility() {
      pause();
      if (document.visibilityState === 'hidden') {
        onProgress(hiddenMessage);
        return;
      }
      onProgress(event === 'loadeddata' ? 'Reading video…' : 'Reading video frames…');
      if (ready) {
        cleanup();
        resolve();
        return;
      }
      startedAt = performance.now();
      timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(timeoutMessage));
      }, remaining);
      if (!started) {
        started = true;
        start();
      }
    }
    video.addEventListener(event, onReady);
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
  });
}
