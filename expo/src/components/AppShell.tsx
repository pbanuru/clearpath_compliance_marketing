import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { useSidebarPreference } from './useSidebarPreference';
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import { useDrawerFocus } from './useDrawerFocus';
import './AppShell.css';

const desktopQuery = '(min-width: 1024px)';
function subscribeLayout(onChange: () => void, media: string) {
  const query = window.matchMedia(media);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const serverSnapshot = () => true;

/** Studio's rail/drawer geometry, with independent desktop and phone state. */
export function AppShell({
  header,
  children,
  sidebar,
}: {
  header: ReactNode;
  children: ReactNode;
  sidebar?: (close: () => void) => ReactNode;
}) {
  const review = usePathname().startsWith('/reviews/');
  const media = review ? '(min-width: 768px)' : desktopQuery;
  const desktop = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeLayout(onChange, media), [media]),
    () => window.matchMedia(media).matches,
    serverSnapshot,
  );
  const [expanded, setExpanded] = useSidebarPreference(!review);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const modal = !!sidebar && !desktop && mobileOpen;
  const open = desktop ? expanded : mobileOpen;
  const closeDrawer = () => setMobileOpen(false);
  useDrawerFocus(modal, drawer, toggle, opener, closeDrawer);

  return (
    <div
      className="clearpath-page app-shell"
      data-desktop={desktop}
      data-desktop-expanded={expanded}
      data-mobile-open={mobileOpen}
    >
      <div className="app-shell-header" inert={modal} aria-hidden={modal || undefined}>
        {header}
      </div>
      <div className="app-shell-workspace">
        {sidebar && (
          <aside
            id="app-sidebar"
            ref={drawer}
            className="app-sidebar"
            aria-label="Sidebar"
            role={modal ? 'dialog' : undefined}
            aria-modal={modal || undefined}
            aria-hidden={!desktop && !mobileOpen ? true : undefined}
            inert={!desktop && !mobileOpen}
          >
            <div className="app-sidebar-toolbar">
              <button
                ref={toggle}
                type="button"
                className="app-sidebar-toggle"
                aria-label={open ? 'Close sidebar' : 'Open sidebar'}
                aria-expanded={open}
                aria-controls="app-sidebar-body"
                onClick={() => (desktop ? setExpanded(!expanded) : closeDrawer())}
              >
                {open ? <FiChevronsLeft size={16} /> : <FiChevronsRight size={16} />}
              </button>
            </div>
            <div id="app-sidebar-body" className="app-sidebar-body">
              {sidebar(closeDrawer)}
            </div>
          </aside>
        )}
        <div className="app-shell-content" inert={modal} aria-hidden={modal || undefined}>
          {sidebar && (
            <div className="app-shell-phone-toolbar">
              <button
                ref={opener}
                type="button"
                className="app-sidebar-toggle"
                aria-label="Open sidebar"
                aria-expanded={mobileOpen}
                aria-controls="app-sidebar"
                onClick={() => setMobileOpen(true)}
              >
                <FiChevronsRight size={16} />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
      {sidebar && <div className="app-sidebar-backdrop" aria-hidden="true" onClick={closeDrawer} />}
    </div>
  );
}
