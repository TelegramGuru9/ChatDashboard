'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

interface ThemeCtx {
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
}

const ThemeContext = createContext<ThemeCtx>({ appearance: 'system', setAppearance: () => {} });

function applyAppearance(a: Appearance) {
  const dark =
    a === 'dark' ||
    (a === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  // Sync state from localStorage on mount
  useEffect(() => {
    const saved = (localStorage.getItem('appearance') as Appearance) || 'system';
    setAppearanceState(saved);
    applyAppearance(saved);
  }, []);

  // Listen for OS preference changes when in 'system' mode
  useEffect(() => {
    if (appearance !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyAppearance('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [appearance]);

  const setAppearance = (a: Appearance) => {
    setAppearanceState(a);
    localStorage.setItem('appearance', a);
    applyAppearance(a);
  };

  return (
    <ThemeContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
