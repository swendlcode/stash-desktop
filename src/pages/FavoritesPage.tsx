import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetService } from '../services/assetService';
import { AssetGrid } from '../components/asset/AssetGrid';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '../types';
import { assetQueryKeys } from '../hooks/useAssets';

const PAGE_SIZE = 100;
const FAVORITES_FILTERS = { ...DEFAULT_FILTERS, favoritesOnly: true };

export function FavoritesPage() {
  const [page, setPage] = useState(1);
  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading } = useQuery({
    queryKey: assetQueryKeys.search(FAVORITES_FILTERS, DEFAULT_SORT, PAGE_SIZE, offset),
    queryFn: () =>
      assetService.search(FAVORITES_FILTERS, DEFAULT_SORT, PAGE_SIZE, offset),
    placeholderData: (prev) => prev,
  });

  const assets = data?.assets ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-gray-700 px-6">
        <h2 className="text-lg font-bold text-stack-white">Favorites</h2>
        <div className="mono ml-auto text-xs text-gray-400">
          {total.toLocaleString()} {total === 1 ? 'item' : 'items'}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {isLoading && assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            No favorites yet. Heart a sample to add it here.
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={total}
            onPageChange={setPage}
            viewType="favorites"
          />
        )}
      </div>
    </div>
  );
}
