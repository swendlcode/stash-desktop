import type { AssetType, KeyScale } from './asset';

export interface AssetFilters {
  query: string;
  types: AssetType[];
  packIds: string[];
  instruments: string[];
  subtypes: string[];
  bpmMin: number | null;
  bpmMax: number | null;
  keys: string[];
  scales: KeyScale[];
  favoritesOnly: boolean;
  tags: string[];
  pathPrefix: string | null;
  /** Smart tag filters */
  energyLevels: string[];
  textures: string[];
  spaces: string[];
  roles: string[];
}

export type SortField = 'filename' | 'bpm' | 'key' | 'duration' | 'pack' | 'added' | 'mostUsed' | 'mostRecent' | 'random';
export type SortDirection = 'asc' | 'desc';

export interface SortOptions {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_FILTERS: AssetFilters = {
  query: '',
  types: ['sample'],
  packIds: [],
  instruments: [],
  subtypes: [],
  bpmMin: null,
  bpmMax: null,
  keys: [],
  scales: [],
  favoritesOnly: false,
  tags: [],
  pathPrefix: null,
  energyLevels: [],
  textures: [],
  spaces: [],
  roles: [],
};

export const DEFAULT_SORT: SortOptions = {
  field: 'mostRecent',
  direction: 'desc',
};
