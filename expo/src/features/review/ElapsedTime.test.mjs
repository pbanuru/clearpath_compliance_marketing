// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ElapsedTime } from './ElapsedTime';

it('uses the operation start time, advances, and releases its interval when finished', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(() => root.render(createElement(ElapsedTime, { startedAt: 35000 })));
    expect(host.textContent).toBe('1:05');
    await act(() => vi.advanceTimersByTime(2000));
    expect(host.textContent).toBe('1:07');
    await act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
