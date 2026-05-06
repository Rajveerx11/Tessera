import { useEffect, useState } from 'react';

/**
 * Reactively reports whether the OS / browser is in dark mode. Used by
 * the Monaco editor to pick `vs-dark` vs `light` and by anything else
 * that needs to mirror system theme.
 */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      setDark(event.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  return dark;
}
