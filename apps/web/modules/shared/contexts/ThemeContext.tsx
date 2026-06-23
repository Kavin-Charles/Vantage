'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useApiToken } from '../lib/useApiToken';
import { apiFetch } from '../lib/api';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vencore_theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const getToken = useApiToken();
  // Always start at the SSR-safe default so server and client markup match on
  // first paint; reconcile with the real stored value in an effect below
  // (a post-hydration state update, which React patches normally — reading
  // localStorage directly in the lazy initializer caused a hydration
  // mismatch, since the server has no localStorage and always sees 'light').
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored !== 'light') setThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  useEffect(() => {
    if (user?.theme && user.theme !== theme) {
      setThemeState(user.theme);
      localStorage.setItem(STORAGE_KEY, user.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.theme]);

  async function setTheme(next: Theme): Promise<void> {
    const previous = theme;
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    try {
      const token = await getToken();
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ theme: next }),
        token,
      });
    } catch (err) {
      setThemeState(previous);
      localStorage.setItem(STORAGE_KEY, previous);
      throw err;
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
