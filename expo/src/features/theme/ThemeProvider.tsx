import { createContext, useContext, type PropsWithChildren } from 'react';
import './theme.css';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<(() => void) | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  // The prepaint restores a stored choice; dark is the default without one.
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme !== 'light';
    const theme: Theme = dark ? 'light' : 'dark';
    root.dataset.theme = theme;
    try {
      localStorage.setItem('clearpath-theme', theme);
    } catch (error) {
      console.warn('Could not save color mode preference.', error);
    }
  }
  return <ThemeContext.Provider value={toggleTheme}>{children}</ThemeContext.Provider>;
}

export function useToggleTheme() {
  const toggleTheme = useContext(ThemeContext);
  if (!toggleTheme) throw new Error('useToggleTheme must be used within ThemeProvider.');
  return toggleTheme;
}
