import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '../stores/filterStore';
import { assetService, type FacetCounts } from '../services/assetService';

export const EMPTY_FACETS: FacetCounts = {
  instruments: [],
  subtypes: [],
  energyLevels: [],
  textures: [],
  spaces: [],
  roles: [],
};

export function useFacetCounts() {
  const filters = useFilterStore((s) => s.filters);

  return useQuery({
    queryKey: ['facets', filters],
    queryFn: () => assetService.getFacetCounts(filters),
    placeholderData: (prev) => prev ?? EMPTY_FACETS,
    staleTime: 5_000,
  });
}
