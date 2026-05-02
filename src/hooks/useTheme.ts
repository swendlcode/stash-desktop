import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../services/settingsService';
import type { Settings } from '../types';

export type Theme = 'dark' | 'light';

const SETTINGS_KEY = ['settings'] as const;
const LOCAL_KEY = 'stack:theme';

/**
 * Pulls the persisted theme from settings and applies `data-theme` to the
 * document element so Tailwind's CSS-variable-driven palette repaints the UI.
 *
 * The `<html data-theme>` attribute is also written before React mounts (see
 * applyInitialTheme below) using a localStorage shadow copy, so the very first
 * paint matches the user's choice instead of flashing dark and then swapping.
 */
export function useTheme() {
  const { data: settings } = useQuery<Settings>({
    queryKey: SETTINGS_KEY,
    queryFn: () => settingsService.getSettings(),
  });

  useEffect(() => {
    if (!settings) return;
    const theme: Theme = settings.theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(LOCAL_KEY, theme);
    } catch {
      /* private mode / quota — best effort only */
    }
  }, [settings?.theme]);
}

/**
 * Hook-free helpers for the topbar quick-toggle. Optimistic flip — writes to
 * the DOM and to react-query's settings cache immediately, then persists
 * via the service. The query invalidation in the caller is what guarantees
 * convergence if the persist fails.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(LOCAL_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function readPersistedTheme(): Theme {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Optimistically flips the cached settings entry so the rest of the UI sees the new theme. */
export function patchCachedSettings(qc: ReturnType<typeof useQueryClient>, theme: Theme) {
  qc.setQueryData<Settings | undefined>(['settings'], (prev) =>
    prev ? { ...prev, theme } : prev,
  );
}
