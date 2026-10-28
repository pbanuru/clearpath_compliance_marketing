export const MAX_VIDEO_SECONDS = 3 * 60;

export function videoLengthMessage(durationSeconds?: number) {
  const limit = `Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes.`;
  if (durationSeconds === undefined) return limit;
  const wholeSeconds = Math.ceil(durationSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = (wholeSeconds % 60).toString().padStart(2, '0');
  return `${limit} This one is ${minutes}:${seconds}.`;
}

export class VideoLengthError extends Error {
  constructor(readonly durationSeconds: number) {
    super(videoLengthMessage(durationSeconds));
    this.name = 'VideoLengthError';
  }
}

export function requireVideoDuration(durationSeconds?: number) {
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("We couldn't confirm this video's length. Try uploading it again.");
  if (durationSeconds > MAX_VIDEO_SECONDS) throw new VideoLengthError(durationSeconds);
}
