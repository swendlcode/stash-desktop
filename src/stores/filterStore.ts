import { create } from 'zustand';
import type { AssetFilters, AssetType, KeyScale, SortOptions } from '../types';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '../types';

interface FilterStore {
  filters: AssetFilters;
  sort: SortOptions;
  setQuery: (query: string) => void;
  setBpmRange: (min: number | null, max: number | null) => void;
  toggleType: (type: AssetType) => void;
  setTypes: (types: AssetType[]) => void;
  togglePack: (id: string) => void;
  toggleKey: (key: string) => void;
  toggleScale: (scale: KeyScale) => void;
  clearKeys: () => void;
  clearScales: () => void;
  clearInstruments: () => void;
  toggleInstrument: (instrument: string) => void;
  toggleSubtype: (subtype: string) => void;
  toggleFavoritesOnly: () => void;
  setPathPrefix: (prefix: string | null) => void;
  setSort: (sort: SortOptions) => void;
  resetFilters: () => void;
  // Smart tag toggles
  toggleEnergyLevel: (level: string) => void;
  toggleTexture: (texture: string) => void;
  toggleSpace: (space: string) => void;
  toggleRole: (role: string) => void;
  // Smart combo presets
  applySmartCombo: (combo: SmartCombo) => void;
}

export type SmartCombo =
  | 'global_tech'
  | 'aggressive_color'
  | 'retro_tape'
  | 'transitional_impact'
  | 'rhythm_construction';

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export const useFilterStore = create<FilterStore>((set) => ({
  filters: DEFAULT_FILTERS,
  sort: DEFAULT_SORT,

  setQuery: (query) => set((s) => ({ filters: { ...s.filters, query } })),

  setBpmRange: (bpmMin, bpmMax) =>
    set((s) => ({ filters: { ...s.filters, bpmMin, bpmMax } })),

  toggleType: (type) =>
    set((s) => ({ filters: { ...s.filters, types: toggle(s.filters.types, type) } })),

  setTypes: (types) =>
    set((s) => ({ filters: { ...s.filters, types } })),

  togglePack: (id) =>
    set((s) => ({
      filters: { ...s.filters, packIds: toggle(s.filters.packIds, id) },
    })),

  toggleKey: (key) =>
    set((s) => ({ filters: { ...s.filters, keys: toggle(s.filters.keys, key) } })),

  toggleScale: (scale) =>
    set((s) => ({
      filters: { ...s.filters, scales: toggle(s.filters.scales, scale) },
    })),

  clearKeys: () => set((s) => ({ filters: { ...s.filters, keys: [] } })),
  clearScales: () => set((s) => ({ filters: { ...s.filters, scales: [] } })),
  clearInstruments: () => set((s) => ({ filters: { ...s.filters, instruments: [] } })),

  toggleInstrument: (instrument) =>
    set((s) => ({
      filters: {
        ...s.filters,
        instruments: toggle(s.filters.instruments, instrument),
      },
    })),

  toggleSubtype: (subtype) =>
    set((s) => ({
      filters: {
        ...s.filters,
        subtypes: toggle(s.filters.subtypes, subtype),
      },
    })),

  toggleFavoritesOnly: () =>
    set((s) => ({
      filters: { ...s.filters, favoritesOnly: !s.filters.favoritesOnly },
    })),

  setPathPrefix: (pathPrefix) =>
    set((s) => ({ filters: { ...s.filters, pathPrefix } })),

  setSort: (sort) => set({ sort }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  toggleEnergyLevel: (level) =>
    set((s) => ({
      filters: { ...s.filters, energyLevels: toggle(s.filters.energyLevels, level) },
    })),

  toggleTexture: (texture) =>
    set((s) => ({
      filters: { ...s.filters, textures: toggle(s.filters.textures, texture) },
    })),

  toggleSpace: (space) =>
    set((s) => ({
      filters: { ...s.filters, spaces: toggle(s.filters.spaces, space) },
    })),

  toggleRole: (role) =>
    set((s) => ({
      filters: { ...s.filters, roles: toggle(s.filters.roles, role) },
    })),

  applySmartCombo: (combo) =>
    set(() => {
      const base = { ...DEFAULT_FILTERS };
      switch (combo) {
        case 'global_tech':
          // World melodies + House groove: ethnic instruments, 122–126 BPM
          return { filters: { ...base, bpmMin: 122, bpmMax: 126, instruments: ['ethnic', 'drum'], textures: ['organic'] } };
        case 'aggressive_color':
          // Future Bass + Dubstep Glitch: high energy, synthetic, glitch/bass subtypes
          return { filters: { ...base, energyLevels: ['high'], textures: ['synthetic'], subtypes: ['glitch', 'wobble', 'bass'] } };
        case 'retro_tape':
          // Warm/nostalgic: organic texture, wet space, vocal/keys instruments
          return { filters: { ...base, textures: ['organic'], spaces: ['wet'], instruments: ['vocal', 'keys', 'piano'] } };
        case 'transitional_impact':
          // Risers + tonal downlifters: FX instrument, riser/downlifter subtypes
          return { filters: { ...base, instruments: ['fx'], subtypes: ['riser', 'downlifter', 'uplifter', 'sweep', 'transition'] } };
        case 'rhythm_construction':
          // Build-up kit: drum fills + buildups at 128 or 150 BPM
          return { filters: { ...base, instruments: ['drum'], subtypes: ['fill', 'buildup', 'riser'], bpmMin: 125, bpmMax: 152 } };
        default:
          return { filters: base };
      }
    }),
}));
