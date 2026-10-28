import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FiCommand, FiX } from 'react-icons/fi';
import { containDialogFocus } from './dialog';
import { isTyping } from './learning';
import './learning.css';

const ShortcutsContext = createContext<(() => void) | null>(null);
const shortcuts = [
  [
    'Review queue',
    [
      ['J / K or ↓ / ↑', 'Move between submissions'],
      ['Enter', 'Open the selected submission'],
    ],
  ],
  [
    'Findings',
    [
      ['J / K or ↓ / ↑', 'Move between findings'],
      ['A', 'Accept the selected finding'],
      ['D', 'Dismiss the selected finding'],
      ['E', 'Edit the selected finding'],
      ['U', 'Reopen the selected finding'],
    ],
  ],
  [
    'Navigation',
    [
      ['← / →, Home / End', 'Choose a product or material tab'],
      ['Tab / Shift + Tab', 'Move between controls'],
      ['Escape', 'Close a dialog, menu, or drawer'],
      ['?', 'Open keyboard shortcuts'],
    ],
  ],
] as const;
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const show = useCallback(() => {
    document
      .querySelector<HTMLButtonElement>('.app-sidebar[aria-modal="true"] .app-sidebar-toggle')
      ?.click();
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpened(true);
  }, []);
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (
        event.key !== '?' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTyping(event.target) ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      show();
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [show]);
  useEffect(() => {
    if (!opened) return;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (opener.current?.isConnected && !opener.current.closest('[inert]')) opener.current.focus();
      else document.querySelector<HTMLButtonElement>('.app-shell-phone-toolbar button')?.focus();
    };
  }, [opened]);
  return (
    <ShortcutsContext.Provider value={show}>
      {children}
      {opened &&
        typeof document !== 'undefined' &&
        createPortal(
          <dialog
            className="cp-dialog cp-review cp-shortcuts-sheet"
            ref={dialog}
            onClose={() => setOpened(false)}
            aria-labelledby="shortcuts-title"
            onKeyDown={containDialogFocus}
          >
            <header>
              <h2 id="shortcuts-title">Keyboard shortcuts</h2>
              <button
                className="cp-icon"
                aria-label="Close keyboard shortcuts"
                onClick={() => setOpened(false)}
              >
                <FiX />
              </button>
            </header>
            <p className="cp-small">Shortcuts pause while you type.</p>
            {shortcuts.map(([section, rows]) => (
              <section key={section}>
                <h3>{section}</h3>
                <dl>
                  {rows.map(([keys, action]) => (
                    <div key={keys}>
                      <dt>
                        <kbd>{keys}</kbd>
                      </dt>
                      <dd>{action}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </dialog>,
          document.body,
        )}
    </ShortcutsContext.Provider>
  );
}
export function ShortcutsButton({ nav = false }: { nav?: boolean }) {
  const show = useContext(ShortcutsContext);
  if (!show) throw new Error('ShortcutsButton requires ShortcutsProvider.');
  return (
    <button
      type="button"
      className={nav ? 'cp-nav-item cp-shortcuts-nav' : 'cp-shortcuts-link'}
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
      onClick={show}
    >
      {nav && <FiCommand />}
      <span className={nav ? 'nav-label' : ''}>{nav ? 'Keyboard shortcuts' : '? shortcuts'}</span>
    </button>
  );
}
