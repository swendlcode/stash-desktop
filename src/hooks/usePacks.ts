import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { packService } from '../services/packService';

export const packQueryKeys = {
  all: ['packs'] as const,
  byId: (id: string) => ['packs', id] as const,
  assets: (id: string) => ['packs', id, 'assets'] as const,
  cover: (packRoot: string | null) => ['pack-cover', packRoot] as const,
  description: (packRoot: string | null) => ['pack-description', packRoot] as const,
};

export function usePacks() {
  return useQuery({
    queryKey: packQueryKeys.all,
    queryFn: () => packService.getPacks(),
  });
}

export function usePack(id: string | null) {
  return useQuery({
    queryKey: id ? packQueryKeys.byId(id) : ['packs', 'null'],
    queryFn: () => (id ? packService.getPack(id) : null),
    enabled: Boolean(id),
  });
}

export function usePackAssets(id: string | null) {
  return useQuery({
    queryKey: id ? packQueryKeys.assets(id) : ['packs', 'null', 'assets'],
    queryFn: () => (id ? packService.getPackAssets(id) : []),
    enabled: Boolean(id),
  });
}

export function usePackDescription(packRoot: string | null) {
  return useQuery({
    queryKey: packQueryKeys.description(packRoot),
    queryFn: () => (packRoot ? packService.getPackDescription(packRoot) : ''),
    enabled: Boolean(packRoot),
    staleTime: 30_000,
  });
}

export function useSetPackArtwork(packRoot: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bytes: Uint8Array; mime: string }) => {
      if (!packRoot) throw new Error('no pack root');
      return packService.setPackArtwork(packRoot, input.bytes, input.mime);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packQueryKeys.cover(packRoot) });
    },
  });
}

export function useClearPackArtwork(packRoot: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!packRoot) throw new Error('no pack root');
      return packService.clearPackArtwork(packRoot);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packQueryKeys.cover(packRoot) });
    },
  });
}

export function useSetPackDescription(packRoot: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (description: string) => {
      if (!packRoot) throw new Error('no pack root');
      return packService.setPackDescription(packRoot, description);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packQueryKeys.description(packRoot) });
    },
  });
}
