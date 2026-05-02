import { invoke } from '@tauri-apps/api/core';
import type { PluginEntry, PluginFormat } from '../types';

export const pluginService = {
  scanPlugins(formats: PluginFormat[], extraPaths: string[]): Promise<PluginEntry[]> {
    return invoke('scan_plugins', { formats, extraPaths });
  },
};
