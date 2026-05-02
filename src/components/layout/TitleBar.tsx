import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useFilterStore } from '../../stores/filterStore';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '../ui/Input';
import { Setting2, SearchNormal, CloseCircle, Sun, Moon, ArrowUp2 } from '../ui/icons';
import { FolderPicker } from '../library/FolderPicker';
import { useSearch } from '../../hooks/useSearch';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';
import { settingsService } from '../../services/settingsService';
import { applyTheme, patchCachedSettings } from '../../hooks/useTheme';
import type { Settings } from '../../types';

export function TitleBar() {
  const activePage = useUiStore((s) => s.activePage);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const updateVersion = useUpdateCheck();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const [draft, setDraft] = useSearch();
  const qc = useQueryClient();
  const { data: settings } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => settingsService.getSettings(),
  });
  const theme = settings?.theme === 'light' ? 'light' : 'dark';

  const settingsActive = activePage === 'settings';
  const startWindowDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  // Optimistic flip: paint instantly via DOM + cache, then persist.
  // The loud caveat is that if persist fails, the next settings refetch will
  // overwrite the cache and revert the toggle — but that's the right outcome
  // (user sees what's actually saved).
  const toggleTheme = () => {
    if (!settings) return;
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    patchCachedSettings(qc, next);
    settingsService
      .updateSettings({ ...settings, theme: next })
      .then((updated) => qc.setQueryData(['settings'], updated))
      .catch(() => {
        qc.invalidateQueries({ queryKey: ['settings'] });
      });
  };

  return (
    <div className="relative grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-gray-700 bg-gray-900 px-4">
      {/* Full-width drag layer under controls (Chrome-style pattern) */}
      <div
        data-tauri-drag-region
        onMouseDown={startWindowDrag}
        className="absolute inset-0 z-0 cursor-default"
      />

      {/* Foreground content sits above drag layer */}
      <div className="z-10 h-full pointer-events-none" />

      {/* Search — centered */}
      <div className="z-10 flex justify-center pointer-events-none">
        <Input
          id="global-search"
          className="no-drag pointer-events-auto w-[min(640px,52vw)]"
          placeholder="Search samples, packs, instruments…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setPathPrefix(null);
            if (activePage !== 'browser') setActivePage('browser');
          }}
          leading={
            <SearchNormal size={15} color="var(--color-text-muted)" variant="Linear" />
          }
          trailing={
            draft ? (
              <button
                onClick={() => {
                  setDraft('');
                  setPathPrefix(null);
                  if (activePage !== 'browser') setActivePage('browser');
                }}
                aria-label="Clear search"
                className="text-gray-400 hover:text-stack-white transition-colors"
              >
                <CloseCircle size={15} color="currentColor" variant="Linear" />
              </button>
            ) : null
          }
        />
      </div>

      {/* Add folder + Theme + Settings — right */}
      <div className="z-10 flex items-center justify-end pointer-events-none">
        <div className="no-drag pointer-events-auto flex items-center gap-3">
          {updateVersion && !updateDismissed && (
            <div className="flex items-center gap-1 rounded-md border border-stack-fire/30 bg-stack-fire/10 pl-2 pr-1 py-1">
              <button
                onClick={() => openUrl('https://stack.swendl.com')}
                className="flex items-center gap-1 text-xs font-medium text-stack-fire hover:text-stack-fire/80 transition-colors"
                title={`Stack v${updateVersion} is available — download at stack.swendl.com`}
              >
                <ArrowUp2 size={11} color="currentColor" variant="Bold" />
                v{updateVersion}
              </button>
              <button
                onClick={() => setUpdateDismissed(true)}
                className="ml-0.5 text-stack-fire/60 hover:text-stack-fire transition-colors"
                aria-label="Dismiss update"
              >
                <CloseCircle size={13} color="currentColor" variant="Linear" />
              </button>
            </div>
          )}
          <FolderPicker />
          <button
            onClick={toggleTheme}
            disabled={!settings}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-stack-white disabled:opacity-40"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <Sun size={18} color="currentColor" variant="Linear" />
            ) : (
              <Moon size={18} color="currentColor" variant="Linear" />
            )}
          </button>
          <button
            onClick={() =>
              setActivePage(settingsActive ? 'browser' : 'settings')
            }
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              settingsActive
                ? 'bg-stack-fire/10 text-stack-fire'
                : 'text-gray-400 hover:bg-gray-800 hover:text-stack-white'
            }`}
            aria-label="Settings"
            title="Settings"
          >
            <Setting2
              size={18}
              color="currentColor"
              variant={settingsActive ? 'Bulk' : 'Linear'}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
