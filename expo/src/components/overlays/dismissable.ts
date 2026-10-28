type Entry = {
  content: HTMLElement;
  trigger: HTMLElement | null;
  dismiss: () => void;
  blocked: () => boolean;
  modal?: boolean;
  restoreFocus?: boolean;
};
let active: Entry | undefined;
const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
let locks = 0;
let overflow = '';
function lockScroll() {
  if (locks++ === 0) {
    overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  return () => {
    if (--locks === 0) document.body.style.overflow = overflow;
  };
}
function restore(entry: Entry) {
  if (entry.modal) {
    queueMicrotask(() => {
      if (!active) focusTrigger(entry);
    });
  } else focusTrigger(entry);
}
function focusTrigger(entry: Entry) {
  if (entry.restoreFocus === false) return;
  const trigger = entry.trigger;
  if (trigger?.isConnected && !trigger.closest('[inert]') && trigger.getClientRects().length)
    trigger.focus({ preventScroll: true });
  else
    document
      .querySelector<HTMLElement>('[data-overlay-focus-fallback]')
      ?.focus({ preventScroll: true });
}
function inside(entry: Entry, event: Event) {
  if (event.target === entry.content && entry.content instanceof HTMLDialogElement) {
    const point =
      typeof TouchEvent !== 'undefined' && event instanceof TouchEvent
        ? event.touches[0]
        : event instanceof MouseEvent
          ? event
          : undefined;
    const rect = entry.content.getBoundingClientRect();
    if (
      point &&
      (point.clientX < rect.left ||
        point.clientX > rect.right ||
        point.clientY < rect.top ||
        point.clientY > rect.bottom)
    )
      return false;
  }
  return event.composedPath().includes(entry.content);
}

/** One dismissal lifecycle for floating panels, inline disclosures and modal dialogs. */
export function registerDismissable(entry: Entry) {
  if (active && active !== entry) {
    if (active.blocked()) {
      entry.dismiss();
      return () => undefined;
    }
    const previous = active;
    active = undefined;
    previous.dismiss();
  }
  active = entry;
  const unlock = entry.modal ? lockScroll() : () => undefined;
  function dismiss() {
    if (active !== entry || entry.blocked()) return;
    if (entry.modal) {
      // Cleanup restores focus after the modal and its inert background are gone.
      entry.dismiss();
    } else {
      active = undefined;
      restore(entry);
      entry.dismiss();
    }
  }
  function pointer(event: PointerEvent) {
    if (
      !inside(entry, event) &&
      (!entry.trigger || !event.composedPath().includes(entry.trigger))
    ) {
      dismiss();
      if (
        event.target instanceof Element &&
        !event.target.closest('button, a[href], input, select, textarea, [tabindex]')
      ) {
        const finish = () => {
          document.removeEventListener('click', finish, true);
          document.removeEventListener('pointercancel', finish, true);
          setTimeout(() => {
            if (!active) restore(entry);
          }, 0);
        };
        if (event.pointerType === 'touch') {
          // Touch's compatibility mousedown can move focus after pointerup.
          document.addEventListener('click', finish, true);
          document.addEventListener('pointercancel', finish, true);
        } else finish();
      }
    }
  }
  function key(event: KeyboardEvent) {
    if (active !== entry) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (
      entry.modal &&
      !(entry.content instanceof HTMLDialogElement) &&
      event.key === 'Tab'
    ) {
      const controls = [...entry.content.querySelectorAll<HTMLElement>(focusable)].filter(
        (el) => !el.closest('[inert]') && el.getClientRects().length,
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  function preventBackgroundScroll(event: Event) {
    if (active === entry && !inside(entry, event)) event.preventDefault();
  }
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', key, true);
  if (entry.modal) {
    document.addEventListener('wheel', preventBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', preventBackgroundScroll, {
      capture: true,
      passive: false,
    });
  }
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', key, true);
    document.removeEventListener('wheel', preventBackgroundScroll, true);
    document.removeEventListener('touchmove', preventBackgroundScroll, true);
    unlock();
    if (active === entry) {
      active = undefined;
      restore(entry);
    }
  };
}
