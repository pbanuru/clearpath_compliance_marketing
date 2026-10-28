import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Submission context shares the existing findings/phone scroller. */
export function DetailsPopover({ children }: { children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !host) return;
    const position = { top: host.scrollTop, left: host.scrollLeft };
    host.scrollTo(0, 0);
    const media = window.matchMedia('(max-width: 700px)');
    const close = () => setOpen(false);
    media.addEventListener('change', close);
    content.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target) &&
        !content.current?.contains(event.target)
      )
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      media.removeEventListener('change', close);
      host.scrollTo(position);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, host]);
  const details = (
    <aside
      ref={content}
      id={id}
      hidden={!open}
      role="dialog"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
      className="cp-header-popover"
      aria-label="Submission details"
    >
      {children}
    </aside>
  );
  return (
    <div
      className="cp-header-details-wrap"
      ref={container}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget) &&
          !content.current?.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="cp-header-details"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (!open)
            setHost(
              document.querySelector<HTMLElement>(
                window.matchMedia('(max-width: 700px)').matches
                  ? '.cp-review-columns'
                  : '.cp-findings-pane',
              ),
            );
          setOpen(!open);
        }}
      >
        Details
      </button>
      {host ? createPortal(details, host) : details}
    </div>
  );
}
