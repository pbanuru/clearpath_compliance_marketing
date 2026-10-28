import { useState } from 'react';

export function useDismissed(name: string) {
  const key = `clearpath-learning-${name}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(key) === 'hidden';
    } catch (error) {
      console.warn('Could not read learning preference.', error);
      return false;
    }
  });
  return [
    dismissed,
    () => {
      setDismissed(true);
      try {
        localStorage.setItem(key, 'hidden');
      } catch (error) {
        console.warn('Could not save learning preference.', error);
      }
    },
  ] as const;
}
export function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]')
  );
}
