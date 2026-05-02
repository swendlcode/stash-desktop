import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePacks, packQueryKeys } from '../hooks/usePacks';
import { useUiStore } from '../stores/uiStore';
import { useFilterStore } from '../stores/filterStore';
import { PackCover } from '../components/asset/PackCover';
import { ContextMenu } from '../components/ui/ContextMenu';
import { packColorFor } from '../utils/colorUtils';
import { libraryService } from '../services/libraryService';
import { settingsService } from '../services/settingsService';
import { assetQueryKeys } from '../hooks/useAssets';
import { libraryTreeKey } from '../hooks/useLibraryTree';
import { useLibraryStore } from '../stores/libraryStore';
import type { Pack, WatchedFolder } from '../types';
import {
  buildPlaygroundTree,
  PLAYGROUND_MOVES_KEY,
  readPlaygroundMoves,
} from '../utils/playgroundTree';

type PackCard = {
  watchedFolderId: string;
  id: string;
  name: string;
  path: string;
  assetCount: number;
  packs: Pack[];
};

type ContextState = {
  x: number;
  y: number;
  card: PackCard;
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function PackPage() {
  const qc = useQueryClient();
  const { data: packs = [], isLoading: packsLoading } = usePacks();
  const { data: sourceTree = [] } = useQuery({
    queryKey: libraryTreeKey,
    queryFn: () => libraryService.getLibraryTree(),
  });
  const { data: watchedFolders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ['watched-folders'],
    queryFn: () => libraryService.getWatchedFolders(),
  });

  const setActivePage = useUiStore((s) => s.setActivePage);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const scanProgress = useLibraryStore((s) => s.scanProgress);

  const [ctx, setCtx] = useState<ContextState | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.getSettings(),
  });
  const playgroundEnabled = settings?.enablePlaygroundMode ?? true;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rescanningId, setRescanningId] = useState<string | null>(null);

  const sorted = useMemo<PackCard[]>(() => {
    const activeWatched = (watchedFolders as WatchedFolder[]).filter(
      (w) => w.isActive && w.kind !== 'project'
    );
    const watchedByPath = new Map(activeWatched.map((w) => [normalizePath(w.path), w]));
    // Drop project-kind roots from the source tree so the Packs page only shows sample packs.
    const projectRoots = new Set(
      (watchedFolders as WatchedFolder[])
        .filter((w) => w.kind === 'project')
        .map((w) => normalizePath(w.path))
    );
    const filteredSourceTree = sourceTree.filter(
      (node) => !projectRoots.has(normalizePath(node.path))
    );
    const virtualRoots = playgroundEnabled
      ? buildPlaygroundTree(filteredSourceTree, readPlaygroundMoves())
      : filteredSourceTree;

    const cards: PackCard[] = virtualRoots.map((node) => {
      const path = normalizePath(node.path);
      const under = packs.filter((p) => {
        const rp = normalizePath(p.rootPath);
        return (rp === path || rp.startsWith(`${path}/`)) && p.kind !== 'project';
      });
      const watched = watchedByPath.get(path);
      return {
        watchedFolderId: watched?.id ?? `virtual:${path}`,
        id: under[0]?.id ?? path,
        name: node.name,
        path,
        assetCount: node.assetCount,
        packs: under,
      };
    });
    return cards.sort((a, b) => a.name.localeCompare(b.name));
  }, [packs, watchedFolders, sourceTree, playgroundEnabled]);

  // Exact same invalidation the Settings page uses
  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: assetQueryKeys.all });
    qc.invalidateQueries({ queryKey: packQueryKeys.all });
    qc.invalidateQueries({ queryKey: libraryTreeKey });
    qc.invalidateQueries({ queryKey: ['watched-folders'] });
    qc.invalidateQueries({ queryKey: ['folder-info'] });
    qc.invalidateQueries({ queryKey: ['facets'] });
  }, [qc]);

  const openPack = (path: string) => {
    setPathPrefix(path);
    setActivePage('browser');
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, card: PackCard) => {
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, card });
    },
    []
  );

  // Same logic as Settings page: removeWatchedFolder → invalidateAll
  const handleDelete = useCallback(async (card: PackCard) => {
    setDeletingId(card.watchedFolderId);
    try {
      await libraryService.removeWatchedFolder(card.watchedFolderId);
      invalidateAll();
    } catch (err) {
      console.error('Failed to delete pack:', err);
    } finally {
      setDeletingId(null);
    }
  }, [invalidateAll]);

  const handleRescan = useCallback(async (card: PackCard) => {
    setRescanningId(card.watchedFolderId);
    try {
      await libraryService.scanFolder(card.path);
      invalidateAll();
    } catch (err) {
      console.error('Failed to rescan pack:', err);
    } finally {
      setRescanningId(null);
    }
  }, [invalidateAll]);

  const isLoading = packsLoading || foldersLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center border-b border-gray-700 px-6">
        <h2 className="text-lg font-bold text-stack-white">Packs</h2>
        {scanProgress.isScanning && (
          <div className="mono ml-4 text-xs text-stack-fire">
            Indexing {scanProgress.indexed.toLocaleString()} / {scanProgress.total.toLocaleString()}
          </div>
        )}
        <div className="mono ml-auto text-xs text-gray-400">
          {sorted.length.toLocaleString()} {sorted.length === 1 ? 'pack' : 'packs'}
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-500">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            No packs yet. Add a folder to start indexing.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sorted.map((card) => {
              const isDeleting = deletingId === card.watchedFolderId;
              const isRescanning = rescanningId === card.watchedFolderId;
              const busy = isDeleting || isRescanning;

              return (
                <button
                  key={card.path}
                  onClick={() => !busy && openPack(card.path)}
                  draggable
                  onDragStart={(e) => {
                    setDragPath(card.path);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', card.path);
                  }}
                  onDragOver={(e) => {
                    if (!dragPath || dragPath === card.path) return;
                    e.preventDefault();
                    setDropPath(card.path);
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDragLeave={() => {
                    if (dropPath === card.path) setDropPath(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData('text/plain') || dragPath;
                    const to = card.path;
                    setDragPath(null);
                    setDropPath(null);
                    if (!from || from === to) return;
                    if (playgroundEnabled) {
                      const moves = readPlaygroundMoves();
                      moves[from] = to;
                      localStorage.setItem(PLAYGROUND_MOVES_KEY, JSON.stringify(moves));
                      qc.invalidateQueries({ queryKey: libraryTreeKey });
                    } else {
                      await libraryService.moveLibraryFolder(from, to);
                    }
                  }}
                  onDragEnd={() => {
                    setDragPath(null);
                    setDropPath(null);
                  }}
                  onContextMenu={(e) => !busy && handleContextMenu(e, card)}
                  disabled={busy}
                  className={`group flex flex-col gap-2 rounded-lg border bg-gray-900 p-3 text-left transition-colors ${
                    busy
                      ? 'cursor-wait border-gray-700 opacity-50'
                      : dropPath === card.path && dragPath && dragPath !== card.path
                        ? 'border-stack-fire ring-1 ring-stack-fire/60 bg-gray-800'
                      : 'border-gray-700 hover:border-stack-fire/60 hover:bg-gray-800'
                  }`}
                >
                  <div className="relative w-full">
                    <div className="aspect-square w-full overflow-hidden rounded-md">
                      <PackCover packRoot={card.path} packName={card.name} size="full" />
                    </div>
                    <span
                      className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: packColorFor(card.path) }}
                    />
                    {busy && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-gray-900/70">
                        <span className="text-xs text-gray-300">
                          {isDeleting ? 'Deleting…' : 'Rescanning…'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-stack-white group-hover:text-stack-fire">
                      {card.name}
                    </div>
                    <div className="mono mt-0.5 text-xs text-gray-500">
                      {card.assetCount.toLocaleString()} files
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            {
              label: 'Browse pack',
              onSelect: () => openPack(ctx.card.path),
            },
            {
              label: 'Rescan pack',
              disabled: ctx.card.watchedFolderId.startsWith('virtual:'),
              onSelect: () => {
                setCtx(null);
                handleRescan(ctx.card);
              },
            },
            { label: '—', disabled: true, onSelect: () => {} },
            {
              label: 'Delete pack from library',
              danger: true,
              disabled: ctx.card.watchedFolderId.startsWith('virtual:'),
              onSelect: () => {
                setCtx(null);
                handleDelete(ctx.card);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
