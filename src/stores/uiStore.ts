import { create } from 'zustand';

export type ActivePage =
  | 'browser'
  | 'favorites'
  | 'presets'
  | 'midi'
  | 'plugins'
  | 'projects'
  | 'pack'
  | 'settings';

const SIDEBAR_WIDTH_KEY = 'stack:sidebarWidth';
const SIDEBAR_OPEN_KEY = 'stack:sidebarOpen';
const EDITOR_HEIGHT_KEY = 'stack:editorHeight';
const SHOW_PLUGINS_NAV_KEY = 'stack:showPluginsNav';
const SHOW_PROJECTS_NAV_KEY = 'stack:showProjectsNav';
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;
const MIN_EDITOR_HEIGHT = 0;
const MAX_EDITOR_HEIGHT = 720;
const DEFAULT_EDITOR_HEIGHT = 280;

function loadWidth(): number {
  try {
    const v = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

function loadOpen(): boolean {
  try {
    const v = localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (v !== null) return v === 'true';
  } catch {}
  return true;
}

function loadEditorHeight(): number {
  try {
    const v = localStorage.getItem(EDITOR_HEIGHT_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_EDITOR_HEIGHT && n <= MAX_EDITOR_HEIGHT) return n;
    }
  } catch {}
  return DEFAULT_EDITOR_HEIGHT;
}

function loadNavVisibility(key: string, defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v === 'true';
  } catch {}
  return defaultValue;
}

export type BrowserViewMode = 'pack' | 'project';

interface UiStore {
  sidebarOpen: boolean;
  sidebarWidth: number;
  activePage: ActivePage;
  activePackId: string | null;
  browserViewMode: BrowserViewMode;
  detailAssetId: string | null;
  editorAssetId: string | null;
  editorHeight: number;
  showPluginsNav: boolean;
  showProjectsNav: boolean;
  setActivePage: (page: ActivePage, packId?: string) => void;
  setBrowserViewMode: (mode: BrowserViewMode) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setEditorHeight: (height: number) => void;
  toggleDetail: (assetId: string) => void;
  openDetail: (assetId: string) => void;
  closeDetail: () => void;
  openEditor: (assetId: string) => void;
  closeEditor: () => void;
  snapEditorHeight: () => void;
  setShowPluginsNav: (show: boolean) => void;
  setShowProjectsNav: (show: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: loadOpen(),
  sidebarWidth: loadWidth(),
  activePage: 'browser',
  activePackId: null,
  browserViewMode: 'pack',
  detailAssetId: null,
  editorAssetId: null,
  editorHeight: loadEditorHeight(),
  showPluginsNav: loadNavVisibility(SHOW_PLUGINS_NAV_KEY, false),
  showProjectsNav: loadNavVisibility(SHOW_PROJECTS_NAV_KEY, false),
  setActivePage: (activePage, packId) =>
    set({ activePage, activePackId: packId ?? null }),
  setBrowserViewMode: (browserViewMode) => set({ browserViewMode }),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarOpen;
      try { localStorage.setItem(SIDEBAR_OPEN_KEY, String(next)); } catch {}
      return { sidebarOpen: next };
    }),
  setSidebarWidth: (width) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped)); } catch {}
    set({ sidebarWidth: clamped });
  },
  setEditorHeight: (height) => {
    const clamped = Math.max(MIN_EDITOR_HEIGHT, Math.min(MAX_EDITOR_HEIGHT, height));
    try { localStorage.setItem(EDITOR_HEIGHT_KEY, String(clamped)); } catch {}
    set({ editorHeight: clamped });
  },
  toggleDetail: (assetId) =>
    set((s) => ({ detailAssetId: s.detailAssetId === assetId ? null : assetId })),
  openDetail: (assetId) => set({ detailAssetId: assetId }),
  closeDetail: () => set({ detailAssetId: null }),
  openEditor: (assetId) => set({ editorAssetId: assetId }),
  closeEditor: () => set({ editorAssetId: null }),
  snapEditorHeight: () =>
    set((s) => {
      if (s.editorHeight < 100) {
        try { localStorage.setItem(EDITOR_HEIGHT_KEY, String(DEFAULT_EDITOR_HEIGHT)); } catch {}
        return { editorAssetId: null, editorHeight: DEFAULT_EDITOR_HEIGHT };
      } else if (s.editorHeight < 180) {
        try { localStorage.setItem(EDITOR_HEIGHT_KEY, '180'); } catch {}
        return { editorHeight: 180 };
      }
      return {};
    }),
  setShowPluginsNav: (showPluginsNav) => {
    try { localStorage.setItem(SHOW_PLUGINS_NAV_KEY, String(showPluginsNav)); } catch {}
    set((s) => ({
      showPluginsNav,
      activePage: !showPluginsNav && s.activePage === 'plugins' ? 'browser' : s.activePage,
    }));
  },
  setShowProjectsNav: (showProjectsNav) => {
    try { localStorage.setItem(SHOW_PROJECTS_NAV_KEY, String(showProjectsNav)); } catch {}
    set((s) => ({
      showProjectsNav,
      activePage: !showProjectsNav && s.activePage === 'projects' ? 'browser' : s.activePage,
    }));
  },
}));

export { MIN_WIDTH, MAX_WIDTH, MIN_EDITOR_HEIGHT, MAX_EDITOR_HEIGHT };
