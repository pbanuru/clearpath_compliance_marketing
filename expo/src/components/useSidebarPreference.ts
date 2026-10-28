import { useState, useSyncExternalStore } from 'react';

const key = 'clearpath-sidebar-expanded';
const event = 'clearpath-sidebar-preference';
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(event, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(event, onChange);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('Could not read sidebar preference.', error);
    return null;
  }
}
export function useSidebarPreference(defaultExpanded: boolean) {
  const [local, setLocal] = useState<boolean>();
  const saved = useSyncExternalStore(subscribe, snapshot, () => null);
  return [
    local ?? (saved === null ? defaultExpanded : saved === 'true'),
    (expanded: boolean) => {
      setLocal(expanded);
      try {
        localStorage.setItem(key, String(expanded));
        window.dispatchEvent(new Event(event));
      } catch (error) {
        console.warn('Could not save sidebar preference.', error);
      }
    },
  ] as const;
}
