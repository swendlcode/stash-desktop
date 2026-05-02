import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

export const playerService = {
  async getAudioUrl(id: string): Promise<string> {
    const path = await invoke<string>('decode_audio', { id });
    return convertFileSrc(path);
  },

  assetUrl(path: string): string {
    return convertFileSrc(path);
  },
};
