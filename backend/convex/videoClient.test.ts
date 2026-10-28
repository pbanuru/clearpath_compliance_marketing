import { afterEach, expect, test, vi } from 'vitest';
import { videoPoster } from '../../expo/src/features/assets/media';
import { MAX_VIDEO_SECONDS, VideoLengthError, videoLengthMessage } from './videoLimits';

afterEach(() => vi.unstubAllGlobals());

test.each([MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS + 1, MAX_VIDEO_SECONDS + 0.01])(
  'client checks metadata duration %s before capturing or uploading',
  async (duration) => {
    class Video extends EventTarget {
      duration = duration;
      videoWidth = 16;
      videoHeight = 16;
      readyState = 2;
      time = 0;
      set src(value: string) {
        if (value) queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
      }
      get currentTime() {
        return this.time;
      }
      set currentTime(value: number) {
        this.time = value;
        queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
      }
      removeAttribute() {
        return undefined;
      }
      load() {
        return undefined;
      }
    }
    const drawImage = vi.fn();
    const createElement = vi.fn((tag: string) =>
      tag === 'video'
        ? new Video()
        : {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage }),
            toBlob: (callback: (blob: Blob) => void) =>
              callback(new Blob(['frame'], { type: 'image/jpeg' })),
          },
    );
    vi.stubGlobal(
      'document',
      Object.assign(new EventTarget(), { visibilityState: 'visible', createElement }),
    );
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:video', revokeObjectURL: vi.fn() });
    vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    const result = videoPoster(file);
    if (duration > MAX_VIDEO_SECONDS) {
      await expect(result).rejects.toBeInstanceOf(VideoLengthError);
      await expect(result).rejects.toMatchObject({ message: videoLengthMessage(duration) });
      expect(drawImage).not.toHaveBeenCalled();
      expect(createElement.mock.calls.map(([tag]) => tag)).toEqual(['video']);
    } else {
      const captured = await result;
      expect(captured.frames).toHaveLength(MAX_VIDEO_SECONDS);
      expect(captured.frames.at(-1)?.at).toBe(MAX_VIDEO_SECONDS - 1);
      expect(captured.poster.size).toBeGreaterThan(0);
    }
  },
);
