import { useEffect, useRef, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
export function PolicyDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="cp-dialog cp-policy-drawer"
      ref={ref}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          e.clientX < e.currentTarget.getBoundingClientRect().left
        )
          close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="cp-button quiet" aria-label="Close" onClick={close}>
          <FiX />
        </button>
      </header>
      {children}
    </dialog>
  );
}
