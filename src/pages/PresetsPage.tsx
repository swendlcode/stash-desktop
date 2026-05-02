import { useEffect, useRef, useState } from 'react';
import { AssetGrid } from '../components/asset/AssetGrid';
import { BrowserToolbar } from '../components/browser/BrowserToolbar';
import { useAssets, PAGE_SIZE } from '../hooks/useAssets';
import { useFilterStore } from '../stores/filterStore';
import type { AssetType } from '../types';

export function PresetsPage() {
  const [page, setPage] = useState(1);
  const filters = useFilterStore((s) => s.filters);
  const sort = useFilterStore((s) => s.sort);
  const toggleType = useFilterStore((s) => s.toggleType);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const previousTypesRef = useRef<AssetType[] | null>(null);
  const initializedRef = useRef(false);
  const { data, isLoading } = useAssets(page, PAGE_SIZE);

  useEffect(() => {
    setPathPrefix(null);
  }, [setPathPrefix]);

  useEffect(() => {
    if (!initializedRef.current) {
      previousTypesRef.current = [...useFilterStore.getState().filters.types];
      initializedRef.current = true;
    }
    const currentTypes = useFilterStore.getState().filters.types;
    for (const t of currentTypes) {
      if (t !== 'preset') toggleType(t);
    }
    if (!currentTypes.includes('preset')) toggleType('preset');

    return () => {
      const prev = previousTypesRef.current ?? [];
      const now = useFilterStore.getState().filters.types;
      for (const t of now) {
        if (!prev.includes(t)) toggleType(t);
      }
      for (const t of prev) {
        if (!useFilterStore.getState().filters.types.includes(t)) toggleType(t);
      }
    };
  }, [toggleType]);

  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  const assets = data?.assets ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BrowserToolbar
        resultCount={total}
        showPathChip={false}
        showTypeTabs={false}
        showKeyFilter={false}
        showBpmFilter={false}
        searchPlaceholder="Search presets, synths, categories…"
      />
      <div className="min-h-0 flex-1">
        {isLoading && assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            No presets indexed.
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={total}
            onPageChange={setPage}
            viewType="preset"
          />
        )}
      </div>
    </div>
  );
}
