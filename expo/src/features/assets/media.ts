import { ConvexError } from 'convex/values';
import { waitForMedia, waitForVisible } from './videoCapture';

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data;
  return error instanceof Error ? error.message : fallback;
}

export function putFile(url: string, file: Blob, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type);
    request.setRequestHeader('If-None-Match', '*');
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onerror = () =>
      reject(new Error('Upload interrupted. Check your connection and retry.'));
    request.onload = () => {
      // A retry may find bytes already accepted by R2; finalization verifies them.
      if ((request.status >= 200 && request.status < 300) || request.status === 412) resolve();
      else reject(new Error(`Upload failed (${request.status}). Please retry.`));
    };
    request.send(file);
  });
}

export async function videoPoster(
  file: File,
  onProgress: (message: string) => void = () => undefined,
): Promise<{ poster: Blob; frames: { blob: Blob; at: number }[] }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    await waitForMedia(
      video,
      'loadeddata',
      () => {
        video.src = url;
      },
      onProgress,
      'Video preview timed out. Try a browser-playable video.',
      'This browser cannot decode the video to create a poster. Try MP4 or WebM.',
    );
    if (!video.videoWidth || !video.videoHeight)
      throw new Error('The video has no decodable picture.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 768 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create a video poster.');
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('The video has no valid duration.');
    const last = Math.max(0, duration - 1);
    const count = Math.min(16, Math.max(2, Math.ceil(duration)));
    const times = [...new Set(Array.from({ length: count }, (_, i) => (i * last) / (count - 1)))];
    const frames: { blob: Blob; at: number }[] = [];
    for (const at of times) {
      if (Math.abs(video.currentTime - at) > 0.001) {
        await waitForMedia(
          video,
          'seeked',
          () => {
            video.currentTime = at;
          },
          onProgress,
          'Video frame capture timed out.',
          'Unable to decode video frame.',
        );
      }
      await waitForVisible(onProgress);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => {
            if (value) resolve(value);
            else reject(new Error('Your browser could not create a video frame.'));
          },
          'image/jpeg',
          0.8,
        ),
      );
      frames.push({ blob, at });
    }
    const poster = frames[0]?.blob;
    if (!poster) throw new Error('No video frames decoded.');
    return { poster, frames };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
