import { useId, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
import { Modal } from '@/components/overlays/Modal';
export function PolicyDialog({
  title,
  close,
  children,
  busy = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const titleId = useId();
  return (
    <Modal
      open
      className="cp-dialog cp-review cp-policy-drawer"
      labelledBy={titleId}
      onClose={close}
      busy={busy}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="cp-button quiet" aria-label="Close" disabled={busy} onClick={close}>
          <FiX />
        </button>
      </header>
      {children}
    </Modal>
  );
}
