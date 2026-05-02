import { useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../components/ui/Button';
import { FolderAdd, Refresh } from '../components/ui/icons';
import { pluginService } from '../services/pluginService';
import type { PluginEntry, PluginFormat } from '../types';

const CUSTOM_PLUGIN_PATHS_KEY = 'stack:customPluginPaths';
type FilterMode = 'all' | 'vst' | 'vst3' | 'au' | 'vsti';

function loadCustomPaths(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PLUGIN_PATHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomPaths(paths: string[]) {
  try {
    localStorage.setItem(CUSTOM_PLUGIN_PATHS_KEY, JSON.stringify(paths));
  } catch {}
}

const BUTTONS: Array<{ id: FilterMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'vst', label: 'VST' },
  { id: 'vst3', label: 'VST3' },
  { id: 'au', label: 'AU' },
  { id: 'vsti', label: 'VSTi' },
];

export function PluginsPage() {
  const [customPaths, setCustomPaths] = useState<string[]>(loadCustomPaths);
  const [mode, setMode] = useState<FilterMode>('all');
  const [scanNonce, setScanNonce] = useState(0);

  const formatsForScan: PluginFormat[] = ['vst', 'vst3', 'au'];
  const { data: plugins = [], isLoading, isFetching } = useQuery({
    queryKey: ['plugins', formatsForScan, customPaths, scanNonce],
    queryFn: () => pluginService.scanPlugins(formatsForScan, customPaths),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    if (mode === 'all') return plugins;
    if (mode === 'vsti') return plugins.filter((p) => p.kind === 'instrument');
    return plugins.filter((p) => p.format === mode);
  }, [plugins, mode]);

  const addFolder = async () => {
    const selected = await open({ directory: true, multiple: true, title: 'Add Plugin Folders' });
    if (!selected) return;
    const folders = Array.isArray(selected) ? selected : [selected];
    if (folders.length === 0) return;
    const next = Array.from(new Set([...customPaths, ...folders]));
    setCustomPaths(next);
    saveCustomPaths(next);
  };

  const removeFolder = (path: string) => {
    const next = customPaths.filter((p) => p !== path);
    setCustomPaths(next);
    saveCustomPaths(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-gray-700 px-6">
        <h2 className="text-lg font-bold text-stack-white">Plugins</h2>
        <div className="mono ml-auto mr-4 text-xs text-gray-400">
          {plugins.length.toLocaleString()} {plugins.length === 1 ? 'plugin' : 'plugins'}
        </div>
        <Button
          variant="secondary"
          icon={<Refresh size={14} color="currentColor" variant="Linear" />}
          onClick={() => setScanNonce((n) => n + 1)}
          disabled={isFetching}
        >
          Rescan
        </Button>
      </div>

      <div className="shrink-0 border-b border-gray-700/70 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {BUTTONS.map((b) => {
            const active = mode === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setMode(b.id)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                    : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-800 hover:text-stack-white'
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            icon={<FolderAdd size={14} color="currentColor" variant="Linear" />}
            onClick={addFolder}
          >
            Add Plugin Folder
          </Button>
          {customPaths.map((path) => (
            <button
              key={path}
              onClick={() => removeFolder(path)}
              className="mono rounded-md border border-gray-700 bg-gray-900/70 px-2.5 py-1 text-[11px] text-gray-300 hover:border-stack-fire/60 hover:text-stack-white"
              title="Click to remove this custom plugin folder"
            >
              {path}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-500">Scanning plugins...</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-500">
            <div className="text-lg font-semibold text-gray-400">No plugins found</div>
            <div className="text-sm">
              Install plugins in macOS default folders or add custom plugin paths above.
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-700">
            {filtered.map((p: PluginEntry, i) => (
              <div
                key={`${p.path}-${i}`}
                className="flex items-start gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0"
              >
                <div className="mt-0.5 w-14 shrink-0 rounded bg-gray-800 px-2 py-0.5 text-center text-[10px] uppercase tracking-wider text-gray-400">
                  {p.format}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-stack-white">{p.name}</div>
                  <div className="mono truncate text-[11px] text-gray-500">{p.path}</div>
                </div>
                <div className="shrink-0 rounded border border-gray-700 px-2 py-0.5 text-[10px] uppercase tracking-widest text-gray-400">
                  {p.kind === 'instrument' ? 'VSTi' : p.kind}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
