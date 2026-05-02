import { useQuery } from '@tanstack/react-query';
import { assetService } from '../services/assetService';
import { useFilterStore } from '../stores/filterStore';

export const PAGE_SIZE = 100;

export const assetQueryKeys = {
  all: ['assets'] as const,
  search: (filters: unknown, sort: unknown, limit: number, offset: number) =>
    [...assetQueryKeys.all, 'search', filters, sort, limit, offset] as const,
  byId: (id: string) => [...assetQueryKeys.all, 'detail', id] as const,
  waveform: (id: string) => [...assetQueryKeys.all, 'waveform', id] as const,
  similar: (id: string, limit: number) =>
    [...assetQueryKeys.all, 'similar', id, limit] as const,
};

export function useAssets(page = 1, pageSize = PAGE_SIZE) {
  const filters = useFilterStore((s) => s.filters);
  const sort = useFilterStore((s) => s.sort);
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: assetQueryKeys.search(filters, sort, pageSize, offset),
    queryFn: () => assetService.search(filters, sort, pageSize, offset),
    placeholderData: (prev) => prev,
  });
}

export function useAsset(id: string | null) {
  return useQuery({
    queryKey: id ? assetQueryKeys.byId(id) : ['asset', 'null'],
    queryFn: () => (id ? assetService.getById(id) : null),
    enabled: Boolean(id),
  });
}

/**
 * Fetch assets similar to `id`. Backend scores by shared key/BPM/texture/instrument/role
 * and returns top `limit` matches, excluding the source asset itself.
 * Cached per (id, limit) — staleTime is short because favorites/play-count
 * on the source can shift relevance once we extend the scoring.
 */
export function useSimilar(id: string | null, limit = 12) {
  return useQuery({
    queryKey: id ? assetQueryKeys.similar(id, limit) : ['assets', 'similar', 'null'],
    queryFn: () => (id ? assetService.findSimilar(id, limit) : Promise.resolve([])),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
