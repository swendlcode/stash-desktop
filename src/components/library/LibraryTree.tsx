import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { TreeNode } from '../../types';
import { useLibraryTree } from '../../hooks/useLibraryTree';
import { useFilterStore } from '../../stores/filterStore';
import { useUiStore } from '../../stores/uiStore';
import { Folder, FolderOpen, ArrowDown2, ArrowUp2 } from '../ui/icons';
import { packColorFor } from '../../utils/colorUtils';
import { settingsService } from '../../services/settingsService';
import { libraryService } from '../../services/libraryService';
import {
  buildPlaygroundTree,
  PLAYGROUND_MOVES_KEY,
  PLAYGROUND_ROOT,
  readPlaygroundMoves,
  type MovesMap,
} from '../../utils/playgroundTree';

export function LibraryTree() {
  const queryClient = useQueryClient();
  const { data: sourceRootsAll = [], isLoading } = useLibraryTree();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.getSettings(),
  });
  const { data: watchedFolders = [] } = useQuery({
    queryKey: ['watched-folders'],
    queryFn: () => libraryService.getWatchedFolders(),
  });
  // Sidebar Packs section excludes project-kind folders — those live on the
  // Projects page and would otherwise duplicate here.
  const sourceRoots = useMemo(() => {
    const projectPaths = new Set(
      watchedFolders
        .filter((w) => w.kind === 'project')
        .map((w) => w.path.replace(/\\/g, '/').replace(/\/+$/, ''))
    );
    return sourceRootsAll.filter(
      (n) => !projectPaths.has(n.path.replace(/\\/g, '/').replace(/\/+$/, ''))
    );
  }, [sourceRootsAll, watchedFolders]);
  const [moves, setMoves] = useState<MovesMap>(() => readPlaygroundMoves());
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [pendingDragPath, setPendingDragPath] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [dragStartPoint, setDragStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [liveDeltas, setLiveDeltas] = useState<Array<{ path: string; delta: number }>>([]);
  const moveMode = true;
  const showPlaygroundBadge = settings?.showPlaygroundBadge ?? true;
  const playgroundEnabled = settings?.enablePlaygroundMode ?? true;
  const sourceRootsWithLiveCounts = useMemo(
    () => applyLiveDeltas(sourceRoots, liveDeltas),
    [sourceRoots, liveDeltas]
  );
  const roots = useMemo(
    () => (playgroundEnabled ? buildPlaygroundTree(sourceRootsWithLiveCounts, moves) : sourceRootsWithLiveCounts),
    [sourceRootsWithLiveCounts, moves, playgroundEnabled]
  );

  useEffect(() => {
    // Fresh DB tree snapshot has arrived — reset local overlays.
    setLiveDeltas([]);
  }, [sourceRootsAll]);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen<{ path?: string }>('stack://asset-indexed', (e) => {
        const path = normalizePath(e.payload?.path ?? '');
        if (!path) return;
        setLiveDeltas((prev) => appendDelta(prev, { path, delta: +1 }));
      })
    );

    unsubs.push(
      listen<{ path?: string; count?: number }>('stack://asset-missing', (e) => {
        const path = normalizePath(e.payload?.path ?? '');
        const count = Math.max(1, Number(e.payload?.count ?? 1));
        if (!path) return;
        setLiveDeltas((prev) => appendDelta(prev, { path, delta: -count }));
      })
    );

    return () => {
      Promise.all(unsubs).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  useEffect(() => {
    // Periodically reconcile from DB during active scans/deletes so overlays
    // remain accurate while preserving instant UI feedback.
    if (liveDeltas.length === 0) return;
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['library-tree'] });
    }, 20_000);
    return () => clearInterval(timer);
  }, [liveDeltas.length, queryClient]);

  useEffect(() => {
    localStorage.setItem(PLAYGROUND_MOVES_KEY, JSON.stringify(moves));
  }, [moves]);

  useEffect(() => {
    if (!dragPath && !pendingDragPath) return;

    const onMove = (e: MouseEvent) => {
      if (pendingDragPath && !dragPath && dragStartPoint) {
        const dx = Math.abs(e.clientX - dragStartPoint.x);
        const dy = Math.abs(e.clientY - dragStartPoint.y);
        if (dx + dy < 5) return; // click-hold threshold (VS-like)
        setDragPath(pendingDragPath);
      }

      if (!dragPath && !pendingDragPath) return;
      setDragPoint({ x: e.clientX, y: e.clientY });
      setDragging(true);
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        ?.closest<HTMLElement>('[data-tree-path]');
      const sourcePath = dragPath ?? pendingDragPath;
      const targetPath = target?.dataset.treePath ?? PLAYGROUND_ROOT;
      if (targetPath && targetPath !== sourcePath) setDropPath(targetPath);
      else setDropPath(null);
    };

    const onUp = () => {
      const from = dragPath;
      const to = dropPath;
      const didDrag = dragging;
      setPendingDragPath(null);
      setDragPath(null);
      setDropPath(null);
      setDragging(false);
      setDragPoint(null);
      setDragStartPoint(null);
      if (didDrag && from && to && from !== to) {
        const selected = selectedPaths.includes(from) ? selectedPaths : [from];
        const sources = onlyTopLevelPaths(selected);
        if (playgroundEnabled) {
          setMoves((prev) => {
            const next = { ...prev };
            for (const src of sources) {
              if (src !== to) next[src] = to;
            }
            return next;
          });
        } else if (to !== PLAYGROUND_ROOT) {
          void (async () => {
            for (const src of sources) {
              if (src === to) continue;
              try {
                await libraryService.moveLibraryFolder(src, to);
              } catch (e) {
                console.error('[LibraryTree] Failed to move folder', src, '->', to, e);
              }
            }
          })();
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [
    dragPath,
    pendingDragPath,
    dropPath,
    dragging,
    dragStartPoint,
    playgroundEnabled,
    selectedPaths,
  ]);

  return (
    <div className="flex flex-col gap-0.5 p-3" data-tree-path={PLAYGROUND_ROOT}>
      <div className="mb-1 flex items-center gap-2 px-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Packs
        </h3>
        {showPlaygroundBadge && (
          <span className="rounded bg-stack-fire/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-stack-fire">
            Playground
          </span>
        )}
      </div>
      {isLoading && <div className="px-2 text-xs text-gray-500">Loading...</div>}
      {!isLoading && roots.length === 0 && (
        <div className="px-2 text-xs text-gray-500">
          No packs yet. Add a folder to start.
        </div>
      )}
      {roots.map((node) => (
        <TreeNodeView
          key={node.path}
          node={node}
          depth={0}
          defaultOpen
          dragPath={dragPath}
          dropPath={dropPath}
          selectedPaths={selectedPaths}
          setSelectedPaths={setSelectedPaths}
          setDragPath={setDragPath}
          setPendingDragPath={setPendingDragPath}
          setDragStartPoint={setDragStartPoint}
          setDropPath={setDropPath}
          moveMode={moveMode}
          dragging={dragging}
          playgroundEnabled={playgroundEnabled}
        />
      ))}
      {dragging && dragPath && dragPoint && (
        <div
          className="pointer-events-none fixed z-[9999] rounded bg-stack-fire px-2 py-1 text-[11px] font-semibold text-black shadow-lg"
          style={{ left: dragPoint.x + 12, top: dragPoint.y + 12 }}
        >
          Moving folder...
        </div>
      )}
    </div>
  );
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isRelatedPath(nodePath: string, eventPath: string): boolean {
  if (nodePath === eventPath) return true;
  return (
    eventPath.startsWith(`${nodePath}/`) ||
    nodePath.startsWith(`${eventPath}/`)
  );
}

function appendDelta(
  prev: Array<{ path: string; delta: number }>,
  next: { path: string; delta: number }
) {
  const path = normalizePath(next.path);
  if (!path || next.delta === 0) return prev;
  const merged = [...prev, { path, delta: next.delta }];
  // Keep only the most recent window to avoid unbounded growth.
  if (merged.length > 1000) return merged.slice(merged.length - 1000);
  return merged;
}

function applyLiveDeltas(
  roots: TreeNode[],
  deltas: Array<{ path: string; delta: number }>
): TreeNode[] {
  if (deltas.length === 0 || roots.length === 0) return roots;
  const normDeltas = deltas.map((d) => ({ path: normalizePath(d.path), delta: d.delta }));

  const applyNode = (node: TreeNode): TreeNode => {
    const nodePath = normalizePath(node.path);
    let deltaSum = 0;
    for (const d of normDeltas) {
      if (isRelatedPath(nodePath, d.path)) deltaSum += d.delta;
    }
    const children = node.children.map(applyNode);
    return {
      ...node,
      assetCount: Math.max(0, node.assetCount + deltaSum),
      children,
    };
  };

  return roots.map(applyNode);
}

function TreeNodeView({
  node,
  depth,
  defaultOpen = false,
  dragPath,
  dropPath,
  selectedPaths,
  setSelectedPaths,
  setDragPath,
  setPendingDragPath,
  setDragStartPoint,
  setDropPath,
  moveMode,
  dragging,
  playgroundEnabled,
}: {
  node: TreeNode;
  depth: number;
  defaultOpen?: boolean;
  dragPath: string | null;
  dropPath: string | null;
  selectedPaths: string[];
  setSelectedPaths: (paths: string[]) => void;
  setDragPath: (path: string | null) => void;
  setPendingDragPath: (path: string | null) => void;
  setDragStartPoint: (p: { x: number; y: number } | null) => void;
  setDropPath: (path: string | null) => void;
  moveMode: boolean;
  dragging: boolean;
  playgroundEnabled: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const pathPrefix = useFilterStore((s) => s.filters.pathPrefix);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const setActivePage = useUiStore((s) => s.setActivePage);

  const active = pathPrefix === node.path;
  const hasChildren = node.children.length > 0;
  const Icon = open ? FolderOpen : Folder;
  const color = depth === 0 ? packColorFor(node.path) : null;
  const isDropTarget = dropPath === node.path && dragPath !== null && dragPath !== node.path;
  const isSelected = selectedPaths.includes(node.path);
  const canDragNode = playgroundEnabled ? true : depth > 0;
  const isMultiSelectModifier = (e: React.MouseEvent) => e.metaKey || e.ctrlKey;

  const selectThisNode = () => {
    setPathPrefix(node.path);
    setActivePage('browser');
  };

  return (
    <div>
      <div
        data-tree-path={node.path}
        className={`group flex w-full items-center gap-1.5 rounded-md text-left transition-colors ${
          isDropTarget
            ? 'bg-stack-fire/20 ring-1 ring-stack-fire/60 text-stack-white'
            : isSelected
              ? 'bg-stack-fire/10 text-stack-white'
            : active
              ? 'bg-stack-fire/10 text-stack-white'
              : 'text-gray-300 hover:bg-gray-800'
        }`}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!hasChildren}
          className="flex h-6 w-5 shrink-0 items-center justify-center text-gray-500 disabled:opacity-0"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            open ? (
              <ArrowDown2 size={12} color="currentColor" variant="Linear" />
            ) : (
              <ArrowUp2 size={12} color="currentColor" variant="Linear" style={{ transform: 'rotate(90deg)' }} />
            )
          ) : null}
        </button>
        <div
          onClick={(e) => {
            if (dragging || dragPath === node.path) return;
            const multi = isMultiSelectModifier(e);
            if (multi) {
              if (isSelected) {
                setSelectedPaths(selectedPaths.filter((p) => p !== node.path));
              } else {
                setSelectedPaths([...selectedPaths, node.path]);
              }
              return;
            }
            setSelectedPaths([node.path]);
            selectThisNode();
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            if (!canDragNode || !moveMode) return;
            // VS Code-like behavior: modifier-click only changes selection,
            // and should not start drag initiation.
            if (isMultiSelectModifier(e)) return;
            if (!isSelected) setSelectedPaths([node.path]);
            setPendingDragPath(node.path);
            setDragStartPoint({ x: e.clientX, y: e.clientY });
          }}
          className={`flex min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left ${
            canDragNode && moveMode
              ? dragPath === node.path
                ? 'cursor-grabbing'
                : 'cursor-default'
              : ''
          }`}
          title={node.path}
        >
          {color && (
            <span
              className="block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
          )}
          <Icon
            size={13}
            color="currentColor"
            variant={active ? 'Bulk' : 'Linear'}
          />
          <span className="flex-1 truncate text-sm">{node.name}</span>
          <span className="mono text-xs text-gray-500">{node.assetCount}</span>
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <TreeNodeView
            key={child.path}
            node={child}
            depth={depth + 1}
            dragPath={dragPath}
            dropPath={dropPath}
            selectedPaths={selectedPaths}
            setSelectedPaths={setSelectedPaths}
            setDragPath={setDragPath}
            setPendingDragPath={setPendingDragPath}
            setDragStartPoint={setDragStartPoint}
            setDropPath={setDropPath}
            moveMode={moveMode}
            dragging={dragging}
            playgroundEnabled={playgroundEnabled}
          />
        ))}
    </div>
  );
}

function onlyTopLevelPaths(paths: string[]): string[] {
  const norm = paths.map((p) => p.replace(/\\/g, '/'));
  return norm.filter((path) => {
    return !norm.some((other) => other !== path && path.startsWith(`${other}/`));
  });
}
