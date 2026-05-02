import { invoke } from '@tauri-apps/api/core';
import type { Asset, Pack } from '../types';

/**
 * Encode a Uint8Array to base64 in chunks. `btoa` can't take typed arrays
 * directly, and a single `String.fromCharCode(...big)` call blows the stack
 * on multi-MB images, so we chunk it.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export const packService = {
  getPacks(): Promise<Pack[]> {
    return invoke('get_packs');
  },

  getPack(id: string): Promise<Pack> {
    return invoke('get_pack', { id });
  },

  setPackColor(id: string, color: string): Promise<void> {
    return invoke('set_pack_color', { id, color });
  },

  getPackAssets(id: string, limit = 500, offset = 0): Promise<Asset[]> {
    return invoke('get_pack_assets', { id, limit, offset });
  },

  /** Returns the absolute path of a cover image (folder.jpg etc.) or null */
  getPackCover(packRoot: string): Promise<string | null> {
    return invoke('get_pack_cover', { packRoot });
  },

  setPackArtwork(packRoot: string, bytes: Uint8Array, mime: string): Promise<string> {
    const dataBase64 = uint8ToBase64(bytes);
    return invoke('set_pack_artwork', {
      packRoot,
      dataBase64,
      mime,
    });
  },

  clearPackArtwork(packRoot: string): Promise<void> {
    return invoke('clear_pack_artwork', { packRoot });
  },

  getPackDescription(packRoot: string): Promise<string> {
    return invoke('get_pack_description', { packRoot });
  },

  setPackDescription(packRoot: string, description: string): Promise<void> {
    return invoke('set_pack_description', { packRoot, description });
  },

  deletePack(id: string): Promise<void> {
    return invoke('delete_pack', { id });
  },

  rescanPack(id: string): Promise<void> {
    return invoke('rescan_pack', { id });
  },

  /**
   * Fetches an image from an arbitrary URL. If the URL points at an HTML
   * page, the backend follows the `og:image` / `twitter:image` meta tag.
   */
  fetchUrlImage(url: string): Promise<{ bytes: number[]; mime: string; sourceUrl: string }> {
    return invoke('fetch_url_image', { url });
  },
};
