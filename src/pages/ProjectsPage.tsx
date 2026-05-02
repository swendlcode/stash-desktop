import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePacks, packQueryKeys } from '../hooks/usePacks';
import { useUiStore } from '../stores/uiStore';
import { useFilterStore } from '../stores/filterStore';
import { PackCover } from '../components/asset/PackCover';
import { ContextMenu } from '../components/ui/ContextMenu';
import { ProjectFolderPicker } from '../components/project/ProjectFolderPicker';
import { ProjectDetailsPanel } from '../components/project/ProjectDetailsPanel';
import { ProjectHero } from '../components/browser/ProjectHero';
import { packColorFor } from '../utils/colorUtils';
import { libraryService } from '../services/libraryService';
import { assetQueryKeys } from '../hooks/useAssets';
import { libraryTreeKey } from '../hooks/useLibraryTree';
import { formatDeadline } from '../utils/projectFormatters';
import { BrowserPage } from './BrowserPage';
import type { Pack } from '../types';

type ContextState = { x: number; y: number; pack: Pack };

export function ProjectsPage() {
  const qc = useQueryClient();
  const { data: packs = [], isLoading } = usePacks();
  const setBrowserViewMode = useUiStore((s) => s.setBrowserViewMode);
  const pathPrefix = useFilterStore((s) => s.filters.pathPrefix);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const resetFilters = useFilterStore((s) => s.resetFilters);

  const { data: watchedFolders = [] } = useQuery({
    queryKey: ['watched-folders'],
    queryFn: () => libraryService.getWatchedFolders(),
  });

  const [ctx, setCtx] = useState<ContextState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [projectDetailsOpen, setProjectDetailsOpen] = useState(false);
  const [projectPanelWidth, setProjectPanelWidth] = useState(420);

  const projects = useMemo<Pack[]>(
    () =>
      packs
        .filter((p) => p.kind === 'project')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [packs]
  );

  const watchedIdByPath = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of watchedFolders) m.set(w.path, w.id);
    return m;
  }, [watchedFolders]);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: assetQueryKeys.all });
    qc.invalidateQueries({ queryKey: packQueryKeys.all });
    qc.invalidateQueries({ queryKey: libraryTreeKey });
    qc.invalidateQueries({ queryKey: ['watched-folders'] });
    qc.invalidateQueries({ queryKey: ['folder-info'] });
  }, [qc]);

  const openProject = (pack: Pack) => {
    resetFilters();
    setBrowserViewMode('project');
    setPathPrefix(pack.rootPath);
    setProjectDetailsOpen(false);
    // Stay on the Projects tab — render BrowserPage inline below.
  };

  const handleDelete = useCallback(
    async (pack: Pack) => {
      const watchedId = watchedIdByPath.get(pack.rootPath);
      if (!watchedId) return;
      setBusyId(pack.id);
      try {
        await libraryService.removeWatchedFolder(watchedId);
        invalidateAll();
      } finally {
        setBusyId(null);
      }
    },
    [invalidateAll, watchedIdByPath]
  );

  const handleRescan = useCallback(
    async (pack: Pack) => {
      setBusyId(pack.id);
      try {
        await libraryService.scanFolder(pack.rootPath);
        invalidateAll();
      } finally {
        setBusyId(null);
      }
    },
    [invalidateAll]
  );

  // When a project is open (pathPrefix points at a project root), render the
  // Browser inline so the Sidebar's Projects tab stays highlighted.
  const insideProject =
    !!pathPrefix && projects.some((p) => p.rootPath === pathPrefix);

  useEffect(() => {
    const openTimeline = () => setProjectDetailsOpen(true);
    window.addEventListener('stack:open-project-timeline', openTimeline);
    return () => window.removeEventListener('stack:open-project-timeline', openTimeline);
  }, []);

  if (insideProject) {
    const currentProject = projects.find((p) => p.rootPath === pathPrefix) ?? null;
    const folderName =
      currentProject?.projectMeta?.title ??
      currentProject?.name ??
      pathPrefix?.split(/[/\\]/).filter(Boolean).slice(-1)[0] ??
      'Project';
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!projectDetailsOpen ? (
          <BrowserPage />
        ) : (
          <DetailsScroller pathPrefix={pathPrefix}>
            <ProjectHero pathPrefix={pathPrefix} />
            <ProjectDetailsPanel
              pathPrefix={pathPrefix}
              folderName={folderName}
              totalCount={currentProject?.assetCount ?? 0}
              pack={currentProject}
              width={projectPanelWidth}
              onWidthChange={setProjectPanelWidth}
              onClose={() => setProjectDetailsOpen(false)}
              mode="page"
            />
          </DetailsScroller>
        )}
      </div>
    );
  }

  if (!isLoading && projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h2 className="mb-4 text-xl font-semibold text-stack-white">
          No project folders yet
        </h2>
        <p className="mb-6 max-w-md text-gray-400">
          Add a folder containing a DAW project (FL Studio, Ableton, Logic, …) and its
          stems / mastering / video subfolders. Stack watches it for changes so the
          contents always stay in sync.
        </p>
        <ProjectFolderPicker />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-gray-700 px-6">
        <h2 className="text-lg font-bold text-stack-white">Versions</h2>
        <div className="mono ml-auto mr-4 text-xs text-gray-400">
          {projects.length.toLocaleString()}{' '}
          {projects.length === 1 ? 'project' : 'projects'}
        </div>
        <ProjectFolderPicker />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-500">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {projects.map((pack) => {
              const meta = pack.projectMeta;
              const busy = busyId === pack.id;
              return (
                <div
                  key={pack.id}
                  onContextMenu={(e) => {
                    if (busy) return;
                    e.preventDefault();
                    setCtx({ x: e.clientX, y: e.clientY, pack });
                  }}
                  className={`group flex flex-col gap-2 rounded-lg border bg-gray-900 p-3 text-left transition-colors ${
                    busy
                      ? 'cursor-wait border-gray-700 opacity-50'
                      : 'border-gray-700 hover:border-stack-fire/60 hover:bg-gray-800'
                  }`}
                >
                  <div className="relative w-full">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openProject(pack)}
                      className="aspect-square w-full overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-stack-fire"
                      title={`Open ${meta?.title || pack.name}`}
                    >
                      <PackCover packRoot={pack.rootPath} packName={pack.name} size="full" />
                    </button>
                    <span
                      className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: pack.color ?? packColorFor(pack.rootPath) }}
                    />
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openProject(pack)}
                      className="w-full break-words text-left text-sm font-semibold text-stack-white transition-colors hover:text-stack-fire focus:text-stack-fire focus:outline-none"
                      title={`Open ${meta?.title || pack.name}`}
                    >
                      {meta?.title || pack.name}
                    </button>
                    <ProjectChips meta={meta} assetCount={pack.assetCount} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 border-t border-gray-700/70 pt-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openProject(pack)}
                      className="rounded-md border border-stack-fire/60 bg-stack-fire/10 px-2.5 py-1 text-xs font-medium text-stack-fire transition-colors hover:bg-stack-fire/20 disabled:opacity-50"
                    >
                      Open Project
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setCtx({ x: rect.left, y: rect.bottom + 4, pack });
                      }}
                      className="rounded-md border border-gray-600 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-800 hover:text-stack-white disabled:opacity-50"
                    >
                      Info
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: 'Open project', onSelect: () => openProject(ctx.pack) },
            {
              label: 'Rescan',
              onSelect: () => {
                setCtx(null);
                handleRescan(ctx.pack);
              },
            },
            { label: '—', disabled: true, onSelect: () => {} },
            {
              label: 'Remove from library',
              danger: true,
              onSelect: () => {
                setCtx(null);
                handleDelete(ctx.pack);
              },
            },
          ]}
        />
      )}
    </div>
  );
}

function DetailsScroller({
  pathPrefix,
  children,
}: {
  pathPrefix: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== pathPrefix) {
      ref.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
    prev.current = pathPrefix;
  }, [pathPrefix]);
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      {children}
    </div>
  );
}

function ProjectChips({
  meta,
  assetCount,
}: {
  meta: Pack['projectMeta'];
  assetCount: number;
}) {
  const parts: string[] = [];
  if (meta?.keyNote) {
    parts.push(`${meta.keyNote}${meta.keyScale ? scaleSuffix(meta.keyScale) : ''}`);
  }
  if (meta?.bpm) parts.push(`${meta.bpm} BPM`);
  if (meta?.deadline) parts.push(formatDeadline(meta.deadline));
  return (
    <div className="mono mt-0.5 truncate text-xs text-gray-500">
      {parts.length > 0 ? parts.join(' · ') : `${assetCount.toLocaleString()} files`}
    </div>
  );
}

function scaleSuffix(scale: string): string {
  if (scale === 'minor') return ' min';
  if (scale === 'major') return ' maj';
  return '';
}
