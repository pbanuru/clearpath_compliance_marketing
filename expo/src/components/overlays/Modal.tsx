import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { containDialogFocus } from '@/features/review/dialog';
import { useDismissable } from './useDismissable';

export function Modal({
  open,
  onClose,
  busy = false,
  children,
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  className: string;
  labelledBy: string;
}) {
  const content = useRef<HTMLDialogElement>(null);
  useDismissable({ open, onClose, busy, content, modal: true });
  useEffect(() => {
    if (!open) return;
    const node = content.current;
    node?.showModal();
    return () => node?.close();
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={content}
      className={className}
      aria-labelledby={labelledBy}
      data-overlay-open="true"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        containDialogFocus(event);
        event.stopPropagation();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
