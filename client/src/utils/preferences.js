import { useEffect, useState } from 'react';

const KEY = 'canban.prefs';
const EVENT = 'canban-prefs';
export const DEFAULT_PREFS = {
  theme: 'light',
  homePage: 'foryou',
  hiddenNav: [],
};

export function getPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // preferences are best-effort when storage is unavailable
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  return next;
}

export function usePrefs() {
  const [prefs, setState] = useState(getPrefs);
  useEffect(() => {
    const sync = () => setState(getPrefs());
    const onStorage = (e) => { if (e.key === KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return [prefs, setPrefs];
}

export function resolveTheme(theme, prefersDark) {
  if (theme === 'dark') return 'dark';
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return 'light';
}

/** Keeps <html data-theme> in sync with the preference and, for "system", the OS setting. */
export function useApplyTheme() {
  const [prefs] = usePrefs();
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(prefs.theme, media?.matches);
    };
    apply();
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [prefs.theme]);
}
