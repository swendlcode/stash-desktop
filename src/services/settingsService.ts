import { invoke } from '@tauri-apps/api/core';
import type { Settings } from '../types';

export const settingsService = {
  getSettings(): Promise<Settings> {
    return invoke('get_settings');
  },

  updateSettings(settings: Settings): Promise<Settings> {
    return invoke('update_settings', { settings });
  },

  /** Reads the real OS autostart state and syncs it into the persisted settings. */
  syncAutostart(): Promise<boolean> {
    return invoke('sync_autostart');
  },
};
