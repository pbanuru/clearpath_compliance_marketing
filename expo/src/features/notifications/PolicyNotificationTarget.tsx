import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

/** Uses stable DOM anchors so policy screens can evolve independently. */
export function PolicyNotificationTarget() {
  const { update, source, tab } = useLocalSearchParams<{
    update?: string;
    source?: string;
    tab?: string;
  }>();
  useEffect(() => {
    const id = update ? `policy-update-${update}` : source ? `source-${source}` : undefined;
    if (!id) return;
    const reveal = () => {
      const target = document.getElementById(id);
      if (!target) return false;
      for (let parent = target.parentElement; parent; parent = parent.parentElement)
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      target.tabIndex = -1;
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
      return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [update, source, tab]);
  return null;
}
