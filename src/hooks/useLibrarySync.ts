import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { useLibraryStore } from '../stores/libraryStore';
import { assetQueryKeys } from './useAssets';
import { packQueryKeys } from './usePacks';
import { libraryTreeKey } from './useLibraryTree';
import type { ScanProgress } from '../types';
import type { Pack, TreeNode } from '../types';

/**
 * Listen for backend events and invalidate queries / update stores.
 * Asset-indexed events are debounced so we don't hammer the DB with
 * re-queries on every single file during a large scan.
 */
export function useLibrarySync() {
  const setProgress = useLibraryStore((s) => s.setScanProgress);
  const setExternalDeleteNotice = useLibraryStore((s) => s.setExternalDeleteNotice);
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStructureInvalidateAtRef = useRef(0);
  const deleteBatchRef = useRef(0);
  const deleteBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteNoticeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen<ScanProgress>('stack://scan-progress', (e) => {
        setProgress(e.payload);

        // During active scans, refresh packs/tree on a slower cadence so
        // the Packs page still updates without hammering huge tree queries.
        if (e.payload.isScanning) {
          const now = Date.now();
          if (now - lastStructureInvalidateAtRef.current > 10_000) {
            lastStructureInvalidateAtRef.current = now;
            queryClient.invalidateQueries({ queryKey: packQueryKeys.all });
            queryClient.invalidateQueries({ queryKey: libraryTreeKey });
          }
        }

        // When scanning finishes, do a final full invalidation
        if (!e.payload.isScanning && e.payload.queued === 0 && e.payload.total > 0) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
          queryClient.invalidateQueries({ queryKey: packQueryKeys.all });
          queryClient.invalidateQueries({ queryKey: libraryTreeKey });
        }
      })
    );

    unsubs.push(
      listen('stack://asset-indexed', () => {
        // Debounce asset list updates; keep structure updates on scan-progress cadence.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
        }, 2000);
      })
    );

    unsubs.push(
      listen('stack://reconcile-complete', () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: packQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: libraryTreeKey });
      })
    );

    unsubs.push(
      listen<{ id: string; data: number[] }>('stack://waveform-ready', (e) => {
        // Directly update the waveform cache so the canvas redraws immediately
        queryClient.setQueryData(assetQueryKeys.waveform(e.payload.id), e.payload.data);
      })
    );

    unsubs.push(
      listen<{ id: string; rootPath: string }>('stack://pack-deleted', (e) => {
        // Remove the deleted pack from the packs cache without triggering a refetch
        queryClient.setQueryData<import('../types').Pack[]>(
          packQueryKeys.all,
          (old) => (old ?? []).filter((p) => p.rootPath !== e.payload.rootPath)
        );
        // Remove the corresponding tree node so the sidebar empties immediately
        queryClient.setQueryData<import('../types').TreeNode[]>(
          libraryTreeKey,
          (old) => (old ?? []).filter(
            (node) => !node.path.startsWith(e.payload.rootPath)
          )
        );
        queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: libraryTreeKey });
      })
    );

    unsubs.push(
      listen<{ id: string; path: string; count?: number }>('stack://asset-missing', (e) => {
        const raw = e.payload?.path ?? '';
        const affected = raw.replace(/\\/g, '/').replace(/\/+$/, '');
        if (affected) {
          // Apply immediate optimistic pruning so UI reacts instantly to external deletes.
          queryClient.setQueryData<TreeNode[]>(libraryTreeKey, (old) =>
            (old ?? []).filter((node) => {
              const nodePath = node.path.replace(/\\/g, '/').replace(/\/+$/, '');
              return !(
                nodePath === affected ||
                nodePath.startsWith(`${affected}/`) ||
                affected.startsWith(`${nodePath}/`)
              );
            })
          );
          queryClient.setQueryData<Pack[]>(packQueryKeys.all, (old) =>
            (old ?? []).filter((pack) => {
              const rootPath = pack.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
              return !(
                rootPath === affected ||
                rootPath.startsWith(`${affected}/`) ||
                affected.startsWith(`${rootPath}/`)
              );
            })
          );
        }

        // Deletions can happen outside the app; refresh quickly so UI stays live.
        queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: packQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: libraryTreeKey });

        deleteBatchRef.current += Math.max(1, Number(e.payload?.count ?? 1));
        if (deleteBatchTimerRef.current) clearTimeout(deleteBatchTimerRef.current);
        deleteBatchTimerRef.current = setTimeout(() => {
          const count = deleteBatchRef.current;
          deleteBatchRef.current = 0;
          setExternalDeleteNotice(
            count === 1 ? '1 file removed externally' : `${count.toLocaleString()} files removed externally`
          );
          if (deleteNoticeClearTimerRef.current) clearTimeout(deleteNoticeClearTimerRef.current);
          deleteNoticeClearTimerRef.current = setTimeout(() => {
            setExternalDeleteNotice(null);
          }, 4500);
        }, 1200);
      })
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (deleteBatchTimerRef.current) clearTimeout(deleteBatchTimerRef.current);
      if (deleteNoticeClearTimerRef.current) clearTimeout(deleteNoticeClearTimerRef.current);
      Promise.all(unsubs).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [queryClient, setProgress, setExternalDeleteNotice]);
}
