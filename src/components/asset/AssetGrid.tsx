import { useRef, useEffect, useCallback, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Asset } from '../../types';
import { AssetRow } from './AssetRow';
import { AssetColumnHeader, type AssetViewType } from './AssetColumnHeader';
import { ResultsHeader } from '../browser/ResultsHeader';
import { usePlayerStore } from '../../stores/playerStore';
import { useUiStore } from '../../stores/uiStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { audioEngine } from '../../services/audioEngine';
import { ArrowLeft2, ArrowRight2 } from '../ui/icons';
interface AssetGridProps {
  assets: Asset[];
  onOpenDetail?: (asset: Asset) => void;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  /** Drives which columns appear in the header and rows. */
  viewType?: AssetViewType;
  /** Optional shared scroll container for non-sticky page headers. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

const ROW_HEIGHT = 64;
const FOOTER_HEIGHT = 52;

export function AssetGrid({
  assets,
  onOpenDetail,
  page,
  pageSize,
  totalCount,
  onPageChange,
  viewType = 'sample',
  scrollContainerRef,
}: AssetGridProps) {
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  // currentAsset still needed for selectedIndex sync effect below
  const currentAsset = usePlayerStore((s) => s.currentAsset);
  const editorAssetId = useUiStore((s) => s.editorAssetId);
  const openEditor = useUiStore((s) => s.openEditor);
  const editorHeight = useUiStore((s) => s.editorHeight);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const prevEditorHeight = useRef(editorHeight);

  // Multi-select state
  const { selectedIds, toggleId, selectRange, clearSelection } = useSelectionStore();
  // Track the last index clicked without modifier for Shift+click range anchor
  const lastClickedIndexRef = useRef<number | null>(null);

  // Sync scroll position with editor height changes so it "pushes" content up
  useEffect(() => {
    const scrollEl = scrollContainerRef?.current ?? internalScrollRef.current;
    if (scrollEl && editorAssetId !== null) {
      const delta = editorHeight - prevEditorHeight.current;
      if (delta !== 0) {
        scrollEl.scrollBy({ top: delta });
      }
    }
    prevEditorHeight.current = editorHeight;
  }, [editorHeight, editorAssetId, scrollContainerRef]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageWindowStart = Math.floor((page - 1) / 10) * 10 + 1;
  const pageWindowEnd = Math.min(pageWindowStart + 9, totalPages);
  const visiblePages = Array.from(
    { length: pageWindowEnd - pageWindowStart + 1 },
    (_, i) => pageWindowStart + i
  );

  // Keep playlist in sync so PlayerBar prev/next works
  useEffect(() => {
    setPlaylist(assets);
    // Pre-decode the first few tracks whenever the list changes
    audioEngine.prefetchAround(assets, 0);
  }, [assets, setPlaylist]);

  const measureScrollMargin = useCallback(() => {
    if (!scrollContainerRef?.current || !listViewportRef.current) {
      setScrollMargin(0);
      return;
    }
    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    const listRect = listViewportRef.current.getBoundingClientRect();
    const margin = Math.max(0, Math.round(listRect.top - containerRect.top));
    setScrollMargin(margin);
  }, [scrollContainerRef]);

  useEffect(() => {
    measureScrollMargin();
    window.addEventListener('resize', measureScrollMargin);
    return () => window.removeEventListener('resize', measureScrollMargin);
  }, [measureScrollMargin]);

  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => scrollContainerRef?.current ?? internalScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  // Scroll selected row into view
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < assets.length) {
      const scrollEl = scrollContainerRef?.current ?? internalScrollRef.current;
      if (!scrollEl) return;
      const raf = window.requestAnimationFrame(() => {
        const rowEl = scrollEl.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
        if (!rowEl) {
          // Fallback when virtual row hasn't mounted yet.
          virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
          return;
        }
        const containerRect = scrollEl.getBoundingClientRect();
        const rowRect = rowEl.getBoundingClientRect();
        // Keep row within a comfortable viewport band (Splice-like behavior).
        // When the editor is open, reserve a larger dynamic bottom safe zone.
        // Arrow navigation can fire rapidly; use immediate correction so the
        // selected row cannot lag and slip under the editor edge.
        const topGuard = containerRect.top + 110;
        const editorBottomBuffer =
          editorAssetId !== null ? Math.max(72, Math.min(140, Math.round(editorHeight * 0.35))) : 0;
        const bottomGuard = containerRect.bottom - (90 + editorBottomBuffer);

        if (rowRect.bottom > bottomGuard) {
          const delta = rowRect.bottom - bottomGuard + 8;
          scrollEl.scrollBy({ top: delta, behavior: 'auto' });
        } else if (rowRect.top < topGuard) {
          const delta = rowRect.top - topGuard - 8;
          scrollEl.scrollBy({ top: delta, behavior: 'auto' });
        }
      });
      return () => {
        window.cancelAnimationFrame(raf);
      };
    }
  }, [selectedIndex, assets.length, virtualizer, scrollMargin, scrollContainerRef, editorHeight, editorAssetId]);

  // When page changes, reset selection to first item and scroll to top.
  // Skip on initial mount — the parent page owns the initial scroll
  // position (its hero/toolbar live in the same scroll container, and
  // forcing the list to align: 'start' would scroll past them).
  const pageInitializedRef = useRef(false);
  useEffect(() => {
    if (!pageInitializedRef.current) {
      pageInitializedRef.current = true;
      return;
    }
    setSelectedIndex(0);
    measureScrollMargin();
    virtualizer.scrollToIndex(0, { align: 'start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Sync selectedIndex when currentAsset changes from outside (e.g. row click)
  useEffect(() => {
    if (!currentAsset) return;
    const idx = assets.findIndex((a) => a.id === currentAsset.id);
    if (idx !== -1) setSelectedIndex(idx);
  }, [currentAsset, assets]);

  const playAsset = useCallback(
    (asset: Asset) => {
      // Read fresh state directly from store to avoid stale closure issues
      // during rapid arrow key navigation
      const { currentAsset: cur, isPlaying: playing, play, pause, resume } = usePlayerStore.getState();
      if (cur?.id === asset.id) {
        if (playing) pause();
        else resume();
      } else {
        play(asset);
      }
    },
    [] // no deps — always reads live state from store
  );

  /**
   * Handle row click for multi-select:
   * - Cmd/Ctrl+click: toggle the clicked asset in/out of selection
   * - Shift+click: range-select from last plain click to this one
   * - Plain click: clear multi-selection (normal single-row navigation)
   */
  const handleRowClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const asset = assets[index];
      if (!asset) return;

      const isMeta = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (isMeta) {
        // Toggle this asset in the multi-selection
        toggleId(asset.id);
        lastClickedIndexRef.current = index;
      } else if (isShift && lastClickedIndexRef.current !== null) {
        // Range select from anchor to current
        const from = Math.min(lastClickedIndexRef.current, index);
        const to = Math.max(lastClickedIndexRef.current, index);
        const rangeIds = assets.slice(from, to + 1).map((a) => a.id);
        selectRange(rangeIds);
      } else {
        // Plain click — clear multi-selection, let normal single-select take over
        if (selectedIds.size > 0) clearSelection();
        lastClickedIndexRef.current = index;
      }
    },
    [assets, toggleId, selectRange, clearSelection, selectedIds.size],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const current = selectedIndex ?? -1;
        const next = current + 1;

        if (next >= assets.length) {
          if (page < totalPages) onPageChange(page + 1);
          return;
        }

        setSelectedIndex(next);
        const asset = assets[next];
        if (asset) {
          // Fire audio immediately — before React state update
          const isEdited = editorAssetId !== null && asset.type === 'sample';
          if (isEdited) openEditor(asset.id);
          if (asset.type === 'sample' && !isEdited) audioEngine.playBuffer(asset.path, 0);
          playAsset(asset);
          // Prefetch neighbours so they're ready
          audioEngine.prefetchAround(assets, next);
        }

      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const current = selectedIndex ?? 0;
        const next = current - 1;

        if (next < 0) {
          if (page > 1) onPageChange(page - 1);
          return;
        }

        setSelectedIndex(next);
        const asset = assets[next];
        if (asset) {
          const isEdited = editorAssetId !== null && asset.type === 'sample';
          if (isEdited) openEditor(asset.id);
          if (asset.type === 'sample' && !isEdited) audioEngine.playBuffer(asset.path, 0);
          playAsset(asset);
          audioEngine.prefetchAround(assets, next);
        }

      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (selectedIndex !== null) {
          const asset = assets[selectedIndex];
          if (asset) {
            // Fire audio immediately like arrow keys do, before React state update
            const isEdited = editorAssetId !== null && asset.type === 'sample';
            if (isEdited) openEditor(asset.id);
            
            const state = usePlayerStore.getState();
            if (state.currentAsset?.id === asset.id) {
              state.isPlaying ? state.stop() : state.resume();
            } else {
              if (asset.type === 'sample' && !isEdited) {
                audioEngine.playBuffer(asset.path, 0);
              }
              playAsset(asset);
            }
          }
        }
      }
    },
    [selectedIndex, assets, page, totalPages, onPageChange, playAsset, editorAssetId, openEditor]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Results header — separate section above the table */}
      <ResultsHeader resultCount={totalCount} />

      {/* Column header — outside scroll container, always visible */}
      <AssetColumnHeader viewType={viewType} pageAssetIds={assets.map((a) => a.id)} />

      {/* Scrollable list */}
      <div
        ref={(el) => {
          listViewportRef.current = el;
          if (!scrollContainerRef) internalScrollRef.current = el;
        }}
        className="outline-none focus:ring-0"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Asset list — use arrow keys to navigate"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize() + (totalPages > 1 ? FOOTER_HEIGHT : 0)}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const asset = assets[virtualRow.index];
            if (!asset) return null;
            return (
              <div
                key={asset.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                }}
              >
                <AssetRow
                  asset={asset}
                  isSelected={selectedIndex === virtualRow.index}
                  isMultiSelected={selectedIds.has(asset.id)}
                  isLast={virtualRow.index === assets.length - 1}
                  viewType={viewType}
                  onOpenDetail={onOpenDetail}
                  onRowClick={(e) => handleRowClick(virtualRow.index, e)}
                />
              </div>
            );
          })}
          {totalPages > 1 && (
            <div
              style={{
                position: 'absolute',
                top: `${virtualizer.getTotalSize()}px`,
                left: 0,
                width: '100%',
                height: `${FOOTER_HEIGHT}px`,
              }}
              className="flex items-center justify-center border-t border-gray-700/70"
            >
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900/90 px-2 py-1">
                <button
                  onClick={() => {
                    const newPage = page - 1;
                    onPageChange(newPage);
                    // Continue playback on the new page like arrow keys do
                    if (selectedIndex !== null && assets.length > 0) {
                      // Go to the last item of the previous page
                      const lastIndex = assets.length - 1;
                      setSelectedIndex(lastIndex);
                      const asset = assets[lastIndex];
                      if (asset && asset.type === 'sample') {
                        const isEdited = editorAssetId !== null;
                        if (isEdited) openEditor(asset.id);
                        if (!isEdited) audioEngine.playBuffer(asset.path, 0);
                        playAsset(asset);
                        audioEngine.prefetchAround(assets, lastIndex);
                      }
                    }
                  }}
                  disabled={page <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-stack-white disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Previous page"
                >
                  <ArrowLeft2 size={13} color="currentColor" variant="Linear" />
                </button>

                {visiblePages.map((p) => {
                  const active = p === page;
                  return (
                    <button
                      key={p}
                      onClick={() => onPageChange(p)}
                      className={`mono min-w-7 rounded px-2 py-1 text-xs transition-colors ${
                        active
                          ? 'bg-stack-fire text-stack-black'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-stack-white'
                      }`}
                      aria-label={`Go to page ${p}`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  onClick={() => {
                    const newPage = page + 1;
                    onPageChange(newPage);
                    // Continue playback on the new page like arrow keys do
                    if (selectedIndex !== null && assets.length > 0) {
                      // Go to the first item of the next page
                      setSelectedIndex(0);
                      const asset = assets[0];
                      if (asset && asset.type === 'sample') {
                        const isEdited = editorAssetId !== null;
                        if (isEdited) openEditor(asset.id);
                        if (!isEdited) audioEngine.playBuffer(asset.path, 0);
                        playAsset(asset);
                        audioEngine.prefetchAround(assets, 0);
                      }
                    }
                  }}
                  disabled={page >= totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-stack-white disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Next page"
                >
                  <ArrowRight2 size={13} color="currentColor" variant="Linear" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
