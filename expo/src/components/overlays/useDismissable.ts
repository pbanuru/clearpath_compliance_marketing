import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { registerDismissable } from './dismissable';

export function useDismissable({
  open,
  onClose,
  content,
  trigger,
  busy = false,
  modal = false,
  focusOnOpen = false,
  restoreFocus = true,
}: {
  open: boolean;
  onClose: () => void;
  content: RefObject<HTMLElement | null>;
  trigger?: RefObject<HTMLElement | null>;
  busy?: boolean;
  modal?: boolean;
  focusOnOpen?: boolean;
  restoreFocus?: boolean;
}) {
  const pathname = usePathname();
  const parameters = useGlobalSearchParams();
  const route = JSON.stringify([pathname, parameters]);
  const previousRoute = useRef(route);
  const close = useEffectEvent(onClose);
  const blocked = useEffectEvent(() => busy);
  useEffect(() => {
    if (!open || !content.current) return;
    const element = content.current;
    const cleanup = registerDismissable({
      content: element,
      trigger:
        trigger?.current ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      dismiss: () => close(),
      blocked: () => blocked(),
      modal,
      restoreFocus,
    });
    if (focusOnOpen)
      (
        element.querySelector<HTMLElement>(
          '[autofocus], button:not(:disabled), a[href], input, select, textarea',
        ) ?? element
      ).focus({ preventScroll: true });
    return cleanup;
  }, [open, content, trigger, modal, focusOnOpen, restoreFocus]);
  useEffect(() => {
    if (previousRoute.current === route || busy) return;
    previousRoute.current = route;
    if (open) close();
  }, [route, open, busy]);
}
