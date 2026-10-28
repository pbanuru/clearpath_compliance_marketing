import { createContext, useContext, type PropsWithChildren } from 'react';
import './theme.css';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<((theme: Theme) => void) | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  function setTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('clearpath-theme', theme);
    } catch (error) {
      console.warn('Could not save color mode preference.', error);
    }
  }
  return <ThemeContext.Provider value={setTheme}>{children}</ThemeContext.Provider>;
}

export function useSetTheme() {
  const setTheme = useContext(ThemeContext);
  if (!setTheme) throw new Error('useSetTheme must be used within ThemeProvider.');
  return setTheme;
}
