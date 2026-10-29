import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDismissable } from './useDismissable';
import './overlays.css';

export function Popover({
  open,
  onClose,
  anchor,
  children,
  className,
  id,
  label,
  placement = 'bottom-end',
  closeOnSelect = false,
  focusOnOpen = true,
  stylePosition = false,
  dimBackdrop = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  className: string;
  id?: string;
  label: string;
  placement?: 'bottom-end' | 'bottom-start' | 'top-end';
  closeOnSelect?: boolean;
  focusOnOpen?: boolean;
  stylePosition?: boolean;
  dimBackdrop?: boolean;
  busy?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  useDismissable({ open, onClose, content, trigger: anchor, focusOnOpen, busy });
  useLayoutEffect(() => {
    if (!open || stylePosition) return;
    const place = () => {
      const node = content.current,
        trigger = anchor.current;
      if (!node || !trigger) return;
      const a = trigger.getBoundingClientRect(),
        b = node.getBoundingClientRect();
      let top = placement === 'top-end' ? a.top - b.height - 8 : a.bottom + 8;
      if (top + b.height > innerHeight - 12) top = a.top - b.height - 8;
      if (top < 12) top = Math.min(a.bottom + 8, innerHeight - b.height - 12);
      const left = placement === 'bottom-start' ? a.left : a.right - b.width;
      node.style.left = `${Math.max(12, Math.min(left, innerWidth - b.width - 12))}px`;
      node.style.top = `${Math.max(12, top)}px`;
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (content.current) observer.observe(content.current);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      observer.disconnect();
    };
  }, [open, anchor, placement, stylePosition]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <>
      {dimBackdrop && <div className="cp-overlay-shade" aria-hidden="true" />}
      <div
        ref={content}
        id={id}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={className}
        data-overlay-open="true"
        style={
          stylePosition
            ? { zIndex: 1000 }
            : {
                boxSizing: 'border-box',
                position: 'fixed',
                inset: 'auto',
                margin: 0,
                zIndex: 1000,
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: 'calc(100dvh - 24px)',
                overflowY: 'auto',
              }
        }
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          if (closeOnSelect && event.target instanceof HTMLSelectElement) onClose();
        }}
        onClick={(event) => {
          if (
            closeOnSelect &&
            event.target instanceof Element &&
            event.target.closest('button:not(:disabled), a[href]')
          )
            onClose();
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
