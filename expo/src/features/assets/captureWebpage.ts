import type { ConvexReactClient } from 'convex/react';
import { saveWebpage, type CapturedWebpage } from './saveWebpage';

function isCapture(value: unknown): value is CapturedWebpage {
  if (!value || typeof value !== 'object') return false;
  return (
    'screenshot' in value &&
    typeof value.screenshot === 'string' &&
    'blocks' in value &&
    Array.isArray(value.blocks) &&
    'size' in value &&
    'title' in value &&
    typeof value.title === 'string' &&
    'finalUrl' in value
  );
}
export async function captureWebpage(
  client: ConvexReactClient,
  url: string,
  onProgress: (message: string) => void,
) {
  onProgress('Capturing the page…');
  const response = await fetch('/api/capture', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Unable to capture this page.',
    );
  if (!isCapture(data)) throw new Error('The capture returned an invalid page. Please retry.');
  return saveWebpage(client, url, data, onProgress);
}
