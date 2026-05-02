import { invoke } from '@tauri-apps/api/core';
import { startDrag } from '@crabnebula/tauri-plugin-drag';

let cachedIcon: string | null = null;
const cachedPackIcons = new Map<string, string>();

async function getIcon(packRoot?: string | null): Promise<string> {
  if (packRoot) {
    const cached = cachedPackIcons.get(packRoot);
    if (cached) return cached;
    const icon = await invoke<string>('get_drag_icon_for_pack', { packRoot });
    cachedPackIcons.set(packRoot, icon);
    return icon;
  }
  if (cachedIcon) return cachedIcon;
  cachedIcon = await invoke<string>('get_drag_icon');
  return cachedIcon;
}

export const dragService = {
  /**
   * Starts a native OS drag-out with the given file paths. The drop target
   * (Finder, FL Studio, Ableton, any DAW) receives real file references, so
   * the DAW imports the sample / MIDI / preset as if the user dragged from
   * Finder.
   */
  async startFileDrag(paths: string[], opts?: { packRoot?: string | null }): Promise<void> {
    if (paths.length === 0) return;
    const icon = await getIcon(opts?.packRoot).catch(() => '');
    await startDrag({ item: paths, icon, mode: 'copy' });
  },

  /**
   * Writes `bytes` to an exports folder via a Rust command and immediately
   * kicks off a native drag-out for that file — used by the sample editor to
   * hand the DAW the rendered result of the current edit.
   */
  async startExportDrag(filename: string, bytes: Uint8Array): Promise<void> {
    const path = await invoke<string>('save_export', {
      filename,
      bytes: Array.from(bytes),
    });
    const icon = await getIcon().catch(() => '');
    await startDrag({ item: [path], icon, mode: 'copy' });
  },
};
