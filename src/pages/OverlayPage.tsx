import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { BrowserToolbar } from '../components/browser/BrowserToolbar';
import { AssetGrid } from '../components/asset/AssetGrid';
import { PAGE_SIZE, useAssets } from '../hooks/useAssets';
import { useFilterStore } from '../stores/filterStore';
import { PlayerBar } from '../components/player/PlayerBar';
import { CloseCircle } from '../components/ui/icons';
import logo from '../assets/logo/logo.svg';

export function OverlayPage() {
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useAssets(page, PAGE_SIZE);
  const assets = data?.assets ?? [];
  const totalCount = data?.total ?? 0;
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const setTypes = useFilterStore((s) => s.setTypes);

  useEffect(() => {
    const unlistenPromise = listen('stack://overlay-opened', () => {
      window.setTimeout(() => {
        const input = document.getElementById('global-search') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }, 0);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    // Overlay opens as a global "all library" browser by default.
    setPathPrefix(null);
    setTypes([]);
    const input = document.getElementById('global-search') as HTMLInputElement | null;
    input?.focus();
    input?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ensure true rounded-corner cutout on transparent window:
    // override global app backgrounds while overlay is mounted.
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevRootBg = root?.style.background ?? '';

    html.style.background = 'transparent';
    body.style.background = 'transparent';
    if (root) root.style.background = 'transparent';

    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      if (root) root.style.background = prevRootBg;
    };
  }, []);

  return (
    <div
      className="h-screen w-screen overflow-x-hidden p-3 text-stack-white"
      tabIndex={-1}
    >
      <div className="flex h-full flex-col overflow-x-hidden overflow-y-hidden rounded-2xl border border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-900 px-3 py-2">
          <div
            className="drag-region flex min-w-0 flex-1 cursor-move items-center"
            data-tauri-drag-region
          >
            <img src={logo} alt="Stack" className="h-5 w-auto" />
          </div>
          <button
            type="button"
            className="no-drag ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-stack-white/90 transition-colors hover:bg-gray-800 hover:text-stack-white"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await invoke('close_overlay');
              } catch {
                const win = getCurrentWebviewWindow();
                await win.hide();
              }
            }}
            aria-label="Close overlay"
            title="Close overlay"
          >
            <CloseCircle size={16} color="currentColor" variant="Linear" />
          </button>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-900
          [&_.text-gray-300]:!text-stack-white
          [&_.text-gray-400]:!text-stack-white
          [&_.text-gray-500]:!text-stack-white/90"
        >
          <div className="no-drag">
            <BrowserToolbar
              resultCount={totalCount}
              showPathChip={false}
              showTypeTabs
              showKeyFilter
              showBpmFilter
              showFavoritesFilter
              searchPlaceholder="Search and drag files to your DAW..."
            />
          </div>
          {isLoading && assets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-stack-white">
              Loading library...
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-stack-white/90">
              No results found
            </div>
          ) : (
            <div className="min-h-0 overflow-x-hidden px-1 pb-1">
              <AssetGrid
                assets={assets}
                page={page}
                pageSize={PAGE_SIZE}
                totalCount={totalCount}
                onPageChange={setPage}
                viewType="favorites"
                scrollContainerRef={scrollRef}
              />
            </div>
          )}
          <div className="border-t border-gray-700 px-3 py-2 text-[11px] text-stack-white/90">
            Drag files from rows directly into your DAW
          </div>
        </div>
        <div className="no-drag pb-2">
          <PlayerBar />
        </div>
      </div>
    </div>
  );
}

