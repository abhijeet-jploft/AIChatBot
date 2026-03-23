import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'sa_ui_theme';

const ThemeContext = createContext(null);

export function SaThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === 'dark' || s === 'light') return s;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const setTheme = useCallback((t) => {
    setThemeState(t === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useSaTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useSaTheme must be used within SaThemeProvider');
  return ctx;
}
