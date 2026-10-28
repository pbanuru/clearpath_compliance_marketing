import { ConvexError } from 'convex/values';

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

export async function videoPoster(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Video preview timed out. Try a browser-playable video.')),
        30000,
      );
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(
          new Error('This browser cannot decode the video to create a poster. Try MP4 or WebM.'),
        );
      };
      video.onloadeddata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.src = url;
    });
    if (!video.videoWidth || !video.videoHeight)
      throw new Error('The video has no decodable picture.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create a video poster.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Your browser could not create a video poster.'));
        },
        'image/jpeg',
        0.85,
      ),
    );
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
