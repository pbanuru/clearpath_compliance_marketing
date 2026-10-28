import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { FiCommand, FiX } from 'react-icons/fi';
import { Modal } from '@/components/overlays/Modal';
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
  const show = useCallback(() => setOpened((value) => !value), []);
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
  return (
    <ShortcutsContext.Provider value={show}>
      {children}
      <Modal
        open={opened}
        onClose={() => setOpened(false)}
        className="cp-dialog cp-review cp-shortcuts-sheet"
        labelledBy="shortcuts-title"
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
      </Modal>
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
