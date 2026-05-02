import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useAssets, PAGE_SIZE } from '../hooks/useAssets';
import { AssetGrid } from '../components/asset/AssetGrid';
import { BrowserToolbar } from '../components/browser/BrowserToolbar';
import { FolderHero } from '../components/browser/FolderHero';
import { ProjectHero } from '../components/browser/ProjectHero';
import { useFilterStore } from '../stores/filterStore';
import { useUiStore } from '../stores/uiStore';
import { usePacks } from '../hooks/usePacks';

export function BrowserPage() {
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filters = useFilterStore((s) => s.filters);
  const sort = useFilterStore((s) => s.sort);

  // Debounce page reset so rapid filter changes (e.g. typing) don't cause
  // a flash: old results show → page resets → new fetch → results swap.
  // The 250ms matches the search debounce so the reset fires after the
  // query has already settled in the store.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setPage(1), 250);
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [filters, sort]);

  const { data, isLoading } = useAssets(page, PAGE_SIZE);
  const assets = data?.assets ?? [];
  const totalCount = data?.total ?? 0;

  const browserViewMode = useUiStore((s) => s.browserViewMode);
  const { data: packs = [] } = usePacks();
  const viewType = filters.types[0] ?? 'favorites';
  const atProjectRoot =
    browserViewMode === 'project' &&
    !!filters.pathPrefix &&
    packs.some((p) => p.kind === 'project' && p.rootPath === filters.pathPrefix);

  // Reset scroll to the top whenever the user navigates to a different
  // folder. Runs before paint so the new folder never appears mid-scroll.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [filters.pathPrefix]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Unified scroll container so hero/toolbar scroll away with content */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {filters.pathPrefix && atProjectRoot && (
          <ProjectHero pathPrefix={filters.pathPrefix} />
        )}
        {filters.pathPrefix && !atProjectRoot && (
          <FolderHero pathPrefix={filters.pathPrefix} totalCount={totalCount} />
        )}
        <BrowserToolbar
          resultCount={totalCount}
          showPathChip={!filters.pathPrefix}
        />
        {isLoading && assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            Loading library...
          </div>
        ) : assets.length === 0 ? (
          <EmptyState viewType={viewType} />
        ) : (
          <AssetGrid
            key={filters.pathPrefix ?? '_root'}
            assets={assets}
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={totalCount}
            onPageChange={setPage}
            viewType={viewType}
            scrollContainerRef={scrollRef}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ viewType }: { viewType: 'sample' | 'midi' | 'preset' | 'project' | 'favorites' }) {
  const noun =
    viewType === 'sample'
      ? 'samples'
      : viewType === 'midi'
        ? 'MIDI files'
        : viewType === 'preset'
          ? 'presets'
          : viewType === 'project'
            ? 'project files'
            : 'files';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
      <div className="text-lg font-semibold text-gray-400">No {noun} found</div>
      <div className="text-sm">Add a folder in Settings to start indexing.</div>
    </div>
  );
}
