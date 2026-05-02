export type PluginFormat = 'vst' | 'vst3' | 'au';
export type PluginKind = 'instrument' | 'effect' | 'unknown';

export interface PluginEntry {
  name: string;
  path: string;
  format: PluginFormat;
  kind: PluginKind;
  scope: 'system' | 'user' | 'custom';
}
