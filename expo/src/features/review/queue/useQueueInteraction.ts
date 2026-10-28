import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { QueueReview } from './model';

export function useQueueInteraction(
  root: RefObject<HTMLDivElement | null>,
  reviews: QueueReview[],
  layout: string,
) {
  const [selected, setSelected] = useState<string | null>(null);
  const positions = useRef(new Map<string, { left: number; top: number }>());
  useLayoutEffect(() => {
    const next = new Map<string, { left: number; top: number }>();
    root.current?.querySelectorAll<HTMLElement>('[data-queue-id]').forEach((node) => {
      const id = node.dataset.queueId;
      if (!id) return;
      const bounds = node.getBoundingClientRect();
      const rect = { left: bounds.left + window.scrollX, top: bounds.top + window.scrollY };
      next.set(id, rect);
      const previous = positions.current.get(id);
      if (previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const x = previous.left - rect.left,
          y = previous.top - rect.top;
        if ((x || y) && Math.abs(y) < 2000)
          node.animate(
            [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
          );
      }
    });
    positions.current = next;
  }, [reviews, layout, root]);
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target.closest(
          'input, textarea, select, [contenteditable], summary, button, [role="dialog"]',
        )
      )
        return;
      if (!['j', 'k', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      const links = [
        ...(root.current?.querySelectorAll<HTMLAnchorElement>('.q-item-link') ?? []),
      ].filter((node) => node.getClientRects().length);
      if (!links.length) return;
      const index = links.findIndex(
        (node) => node.closest<HTMLElement>('[data-queue-id]')?.dataset.queueId === selected,
      );
      if (event.key === 'Enter') {
        if (index < 0 || target.closest('a')) return;
        event.preventDefault();
        links[index]?.click();
        return;
      }
      event.preventDefault();
      const step = event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1;
      const next =
        links[
          Math.max(
            0,
            Math.min(
              links.length - 1,
              index < 0 ? (step > 0 ? 0 : links.length - 1) : index + step,
            ),
          )
        ];
      next?.focus({ preventScroll: true });
      next?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [root, selected]);
  return { selected, setSelected };
}
function subscribePhone(callback: () => void) {
  const media = window.matchMedia('(max-width: 700px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export function useQueueView() {
  const [view, setView] = useState<'list' | 'board'>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      return localStorage.getItem('clearpath-queue-view') === 'board' ? 'board' : 'list';
    } catch (error) {
      console.warn('Could not read queue view preference.', error);
      return 'list';
    }
  });
  const phone = useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia('(max-width: 700px)').matches,
    () => false,
  );
  return {
    view: phone ? ('list' as const) : view,
    phone,
    changeView: (next: 'list' | 'board') => {
      setView(next);
      try {
        localStorage.setItem('clearpath-queue-view', next);
      } catch (error) {
        console.warn('Could not save queue view preference.', error);
      }
    },
  };
}
