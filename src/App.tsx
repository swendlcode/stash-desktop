import { useEffect, useState, lazy, Suspense } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { useQuery } from '@tanstack/react-query';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainPanel } from './components/layout/MainPanel';
import { StatusBar } from './components/layout/StatusBar';
import { PlayerBar } from './components/player/PlayerBar';
import { FolderPicker } from './components/library/FolderPicker';
import { OverlayPage } from './pages/OverlayPage';
import { AssetDetailPanel } from './components/asset/AssetDetailPanel';
import { BulkEditPanel } from './components/asset/BulkEditPanel';
import { SampleEditor } from './components/editor/SampleEditor';

const BrowserPage = lazy(() => import('./pages/BrowserPage').then((m) => ({ default: m.BrowserPage })));
const PackPage = lazy(() => import('./pages/PackPage').then((m) => ({ default: m.PackPage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const PresetsPage = lazy(() => import('./pages/PresetsPage').then((m) => ({ default: m.PresetsPage })));
const MidiPage = lazy(() => import('./pages/MidiPage').then((m) => ({ default: m.MidiPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const PluginsPage = lazy(() => import('./pages/PluginsPage').then((m) => ({ default: m.PluginsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useUiStore } from './stores/uiStore';
import { useFilterStore } from './stores/filterStore';
import { useSelectionStore } from './stores/selectionStore';
import { useLibrarySync } from './hooks/useLibrarySync';
import { useKeyboard } from './hooks/useKeyboard';
import { useTheme } from './hooks/useTheme';
import { libraryService } from './services/libraryService';
import { settingsService } from './services/settingsService';
import { usePlayerStore } from './stores/playerStore';

const ONBOARDING_SEEN_KEY = 'stack:onboardingSeen';

export default function App() {
  const [isOverlayWindow, setIsOverlayWindow] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const activePage = useUiStore((s) => s.activePage);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const selectionCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  // Clear selection when navigating away from pages that have the asset grid
  useEffect(() => {
    if (activePage === 'projects' || activePage === 'settings' || activePage === 'plugins') {
      clearSelection();
    }
  }, [activePage, clearSelection]);
  const { data: watchedFolders = [], isLoading: watchedLoading } = useQuery({
    queryKey: ['watched-folders'],
    queryFn: () => libraryService.getWatchedFolders(),
  });
  const showFirstLaunch = !watchedLoading && watchedFolders.length === 0;

  useLibrarySync();
  useKeyboard();
  useTheme();

  useEffect(() => {
    try {
      const label = getCurrentWebviewWindow().label;
      setIsOverlayWindow(label === 'overlay');
    } catch {
      setIsOverlayWindow(false);
    }
  }, []);

  // Prevent native file drop behavior (e.g. browser audio preview) inside the app.
  useEffect(() => {
    const blockNativeDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', blockNativeDrop);
    window.addEventListener('drop', blockNativeDrop);
    return () => {
      window.removeEventListener('dragover', blockNativeDrop);
      window.removeEventListener('drop', blockNativeDrop);
    };
  }, []);

  // Initialise player volume from persisted settings on first load
  useEffect(() => {
    settingsService.getSettings().then((s) => {
      usePlayerStore.getState().setVolume(s.defaultVolume);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On startup: reconcile exactly once — empty dep array, runs only on mount.
  // We call the service directly instead of reading from the query to avoid
  // re-running when the query refetches (e.g. after folder deletion).
  useEffect(() => {
    libraryService.getWatchedFolders().then((folders) => {
      if (folders.length > 0) {
        libraryService.runReconciliation().catch((e) =>
          console.error('[App] Reconciliation failed:', e)
        );
      } else {
        libraryService.cleanCache().catch((e) =>
          console.error('[App] Clean cache failed:', e)
        );
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<string>('stack://menu-navigate', (event) => {
      const route = event.payload;
      setPathPrefix(null);
      if (
        route === 'browser' ||
        route === 'packs' ||
        route === 'favorites' ||
        route === 'presets' ||
        route === 'midi' ||
        route === 'plugins' ||
        route === 'projects' ||
        route === 'settings'
      ) {
        const page = route === 'packs' ? 'pack' : route;
        setActivePage(page);
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [setActivePage, setPathPrefix]);

  useEffect(() => {
    const normalized = activePage === 'pack' ? 'packs' : activePage;
    emit('stack://active-page-changed', normalized).catch((e) =>
      console.error('[App] Failed to sync menu active page:', e)
    );
  }, [activePage]);

  useEffect(() => {
    const unlistenPromise = listen('stack://menu-focus-search', () => {
      const search = document.getElementById('global-search') as HTMLInputElement | null;
      if (!search) return;
      setPathPrefix(null);
      if (activePage !== 'browser') setActivePage('browser');
      search.focus();
      search.select();
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [activePage, setActivePage, setPathPrefix]);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true';
      if (!seen) setOnboardingOpen(true);
    } catch {
      setOnboardingOpen(true);
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setOnboardingOpen(true);
    window.addEventListener('stack:open-onboarding', onOpen);
    return () => window.removeEventListener('stack:open-onboarding', onOpen);
  }, []);

  const closeOnboarding = () => {
    setOnboardingOpen(false);
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    } catch {}
  };

  if (isOverlayWindow) {
    return <OverlayPage />;
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-stack-black">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <MainPanel>
          {showFirstLaunch && activePage !== 'settings' && activePage !== 'projects' ? (
            <FirstLaunchEmpty />
          ) : (
            <ErrorBoundary key={activePage}>
              <Suspense fallback={<div className="flex h-full w-full items-center justify-center" />}>
                {activePage === 'browser' && (showFirstLaunch ? <FirstLaunchEmpty /> : <BrowserPage />)}
                {activePage === 'pack' && <PackPage />}
                {activePage === 'favorites' && <FavoritesPage />}
                {activePage === 'presets' && <PresetsPage />}
                {activePage === 'midi' && <MidiPage />}
                {activePage === 'plugins' && <PluginsPage />}
                {activePage === 'projects' && <ProjectsPage />}
                {activePage === 'settings' && <SettingsPage />}
              </Suspense>
            </ErrorBoundary>
          )}
        </MainPanel>
        {activePage !== 'projects' && (
          selectionCount > 0
            ? <BulkEditPanel onClose={clearSelection} />
            : <AssetDetailPanel />
        )}
      </div>
      <SampleEditor />
      <PlayerBar />
      <StatusBar />
      <OnboardingModal
        isOpen={onboardingOpen}
        onClose={closeOnboarding}
        onNavigateSettings={() => setActivePage('settings')}
        onNavigateProjects={() => setActivePage('projects')}
        onNavigateBrowser={() => setActivePage('browser')}
      />
    </div>
  );
}

function FirstLaunchEmpty() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-2xl font-bold text-stack-white">Add your first folder</h2>
      <p className="text-sm text-gray-400">
        Point Stack to a sample library folder to start indexing.
      </p>
      <FolderPicker />
    </div>
  );
}
