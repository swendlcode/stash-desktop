import { useQuery } from '@tanstack/react-query';
import { libraryService } from '../services/libraryService';

export const libraryTreeKey = ['library-tree'] as const;

export function useLibraryTree() {
  return useQuery({
    queryKey: libraryTreeKey,
    queryFn: () => libraryService.getLibraryTree(),
  });
}
