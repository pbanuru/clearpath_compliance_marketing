import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Long submission context scrolls with the page, rather than in another pane. */
export function DetailsPopover({ children }: { children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    content.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
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
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div
      className="cp-header-details-wrap"
      ref={container}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
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
        onClick={() => setOpen(!open)}
      >
        Details
      </button>
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
    </div>
  );
}
