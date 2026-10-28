import { useId, useRef, useState, type ReactNode } from 'react';
import { Popover } from '@/components/overlays/Popover';

export function DetailsPopover({ children }: { children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="cp-header-details-wrap">
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
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={trigger}
        id={id}
        className="cp-header-popover"
        label="Submission details"
        closeOnSelect
      >
        {children}
      </Popover>
    </div>
  );
}
