import { invoke } from '@tauri-apps/api/core';
import type {
  Asset,
  AssetFilters,
  SortOptions,
  MidiNote,
  SearchResult,
} from '../types';

export interface FacetCount {
  value: string;
  count: number;
}

export interface FacetCounts {
  instruments: FacetCount[];
  subtypes: FacetCount[];
  energyLevels: FacetCount[];
  textures: FacetCount[];
  spaces: FacetCount[];
  roles: FacetCount[];
}

export const assetService = {
  search(
    filters: AssetFilters,
    sort: SortOptions,
    limit = 100,
    offset = 0
  ): Promise<SearchResult> {
    return invoke('search_assets', {
      query: { filters, sort, limit, offset },
    });
  },

  getById(id: string): Promise<Asset | null> {
    return invoke('get_asset', { id });
  },

  assetExists(id: string): Promise<boolean> {
    return invoke('asset_exists', { id });
  },

  toggleFavorite(id: string): Promise<boolean> {
    return invoke('toggle_favorite', { id });
  },

  addTag(id: string, tag: string): Promise<void> {
    return invoke('add_tag', { id, tag });
  },

  removeTag(id: string, tag: string): Promise<void> {
    return invoke('remove_tag', { id, tag });
  },

  incrementPlayCount(id: string): Promise<void> {
    return invoke('increment_play_count', { id });
  },

  getWaveform(id: string): Promise<number[]> {
    return invoke('get_waveform', { id });
  },

  getMidiNotes(id: string): Promise<MidiNote[]> {
    return invoke('get_midi_notes', { id });
  },

  getFacetCounts(filters: AssetFilters): Promise<FacetCounts> {
    return invoke('get_facet_counts', { filters });
  },

  findSimilar(id: string, limit = 20): Promise<Asset[]> {
    return invoke('find_similar', { id, limit });
  },

  // ── Bulk helpers (fan-out to per-asset commands) ──────────────────────────

  async bulkAddTag(ids: string[], tag: string): Promise<void> {
    await Promise.all(ids.map((id) => invoke('add_tag', { id, tag })));
  },

  async bulkRemoveTag(ids: string[], tag: string): Promise<void> {
    await Promise.all(ids.map((id) => invoke('remove_tag', { id, tag })));
  },

  async bulkSetFavorite(ids: string[], favorite: boolean): Promise<void> {
    // toggle_favorite returns the new state; we call it only when needed
    await Promise.all(
      ids.map(async (id) => {
        const asset = await invoke<Asset | null>('get_asset', { id });
        if (!asset) return;
        if (asset.isFavorite !== favorite) {
          await invoke('toggle_favorite', { id });
        }
      }),
    );
  },

  /** Set instrument + subtype on multiple assets via tag convention:
   *  instrument stored as tag "__instrument:<value>"
   *  subtype stored as tag "__subtype:<value>"
   *  These are then stripped from display but used for filtering.
   *  Since the backend has no direct field-update command, we use
   *  special-prefixed user tags as the storage mechanism.
   */
  async bulkSetType(
    ids: string[],
    instrument: string | null,
    subtype: string | null,
  ): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        const asset = await invoke<Asset | null>('get_asset', { id });
        if (!asset) return;

        // Remove old instrument tags
        const oldInstrumentTags = asset.userTags.filter((t) =>
          t.startsWith('__instrument:'),
        );
        for (const t of oldInstrumentTags) {
          await invoke('remove_tag', { id, tag: t });
        }

        // Remove old subtype tags
        const oldSubtypeTags = asset.userTags.filter((t) =>
          t.startsWith('__subtype:'),
        );
        for (const t of oldSubtypeTags) {
          await invoke('remove_tag', { id, tag: t });
        }

        // Add new ones
        if (instrument) {
          await invoke('add_tag', { id, tag: `__instrument:${instrument}` });
        }
        if (subtype) {
          await invoke('add_tag', { id, tag: `__subtype:${subtype}` });
        }
      }),
    );
  },
};
