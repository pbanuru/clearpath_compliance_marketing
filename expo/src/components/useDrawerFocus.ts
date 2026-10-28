import { useEffect, useEffectEvent, type RefObject } from 'react';

const focusable = 'button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]';

export function useDrawerFocus(
  active: boolean,
  drawer: RefObject<HTMLElement | null>,
  toggle: RefObject<HTMLButtonElement | null>,
  opener: RefObject<HTMLButtonElement | null>,
  close: () => void,
) {
  const dismiss = useEffectEvent(close);
  useEffect(() => {
    if (!active) return;
    const toggleElement = toggle.current;
    const openerElement = opener.current;
    toggleElement?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        drawer.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
      ).filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (openerElement?.getClientRects().length) openerElement.focus();
      else toggleElement?.focus();
    };
  }, [active, drawer, toggle, opener]);
}
