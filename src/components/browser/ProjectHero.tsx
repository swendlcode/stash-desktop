import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { usePacks } from '../../hooks/usePacks';
import { assetService } from '../../services/assetService';
import { PackCover } from '../asset/PackCover';
import { PackDescription } from '../library/PackDescription';
import { CoverEditorModal } from '../library/CoverEditorModal';
import { Button } from '../ui/Button';
import { Folder } from '../ui/icons';
import { formatFileSize } from '../../utils/formatters';
import {
  formatDeadline,
  formatDeadlineRelative,
  deadlineUrgency,
} from '../../utils/projectFormatters';
import type { Asset, Pack, ProjectMeta as AssetProjectMeta } from '../../types';

interface Props {
  pathPrefix: string;
}

export function ProjectHero({ pathPrefix }: Props) {
  const { data: packs = [] } = usePacks();
  const pack = useMemo<Pack | null>(
    () => packs.find((p) => p.rootPath === pathPrefix && p.kind === 'project') ?? null,
    [packs, pathPrefix]
  );
  const meta = pack?.projectMeta ?? null;
  const folderName =
    meta?.title ?? pack?.name ?? pathPrefix.split(/[/\\]/).filter(Boolean).slice(-1)[0] ?? 'Project';
  const [coverOpen, setCoverOpen] = useState(false);

  const { data: rootProjects } = useQuery({
    queryKey: ['project-root-files', pathPrefix],
    staleTime: 30_000,
    queryFn: async () => {
      const result = await assetService.search(
        {
          query: '',
          types: ['project'],
          packIds: [],
          instruments: [],
          subtypes: [],
          bpmMin: null,
          bpmMax: null,
          keys: [],
          scales: [],
          favoritesOnly: false,
          tags: [],
          pathPrefix,
          energyLevels: [],
          textures: [],
          spaces: [],
          roles: [],
        },
        { field: 'added', direction: 'desc' },
        50,
        0
      );
      return result.assets;
    },
  });

  const primary = useMemo(() => pickPrimaryProject(rootProjects ?? [], pathPrefix, meta?.title), [
    rootProjects,
    pathPrefix,
    meta?.title,
  ]);

  const handleReveal = async () => {
    try {
      await revealItemInDir(primary?.path ?? pathPrefix);
    } catch (err) {
      console.error('Failed to reveal:', err);
    }
  };

  const dawLabel =
    primary && (primary.meta as AssetProjectMeta | undefined)?.daw
      ? (primary.meta as AssetProjectMeta).daw
      : null;

  return (
    <div className="flex shrink-0 items-start gap-5 border-b border-gray-700 px-6 py-4">
      {/* Left column: cover */}
      <div className="flex shrink-0 flex-col items-stretch gap-3" style={{ width: 152 }}>
        <button
          type="button"
          onClick={() => setCoverOpen(true)}
          className="group relative overflow-hidden rounded-lg border border-transparent transition-colors hover:border-stack-fire focus:outline-none focus:ring-2 focus:ring-stack-fire"
          title="Edit cover"
          aria-label="Edit project cover"
          style={{ width: 152, height: 152 }}
        >
          <PackCover packRoot={pathPrefix} packName={folderName} size="full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold uppercase tracking-widest text-transparent transition-all group-hover:bg-black/55 group-hover:text-stack-white">
            Edit cover
          </div>
        </button>
      </div>

      {/* Centre column: title + chips + description + project meta */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="text-[11px] uppercase tracking-widest text-gray-500">Project</div>
        <div className="truncate text-2xl font-bold text-stack-white" title={folderName}>
          {folderName}
        </div>
        <ChipRow meta={meta} dawLabel={dawLabel} />
        <ProjectFileMeta primary={primary} />
        <div className="mt-1">
          <PackDescription packRoot={pathPrefix} />
        </div>
      </div>

      {/* Right column: action buttons */}
      <div className="flex shrink-0 flex-col items-stretch gap-2 rounded-lg border border-gray-700/70 bg-gray-900/60 p-2.5">
        <Button
          variant="secondary"
          icon={<Folder size={14} color="currentColor" />}
          onClick={handleReveal}
        >
          Reveal
        </Button>
      </div>

      {coverOpen && (
        <CoverEditorModal
          packRoot={pathPrefix}
          packName={folderName}
          onClose={() => setCoverOpen(false)}
        />
      )}
    </div>
  );
}

function ChipRow({
  meta,
  dawLabel,
}: {
  meta: { keyNote: string | null; keyScale: string | null; altKeyNote: string | null; altKeyScale: string | null; bpm: number | null; deadline: string | null } | null;
  dawLabel: string | null;
}) {
  const chips: { label: string; tone?: 'urgent' | 'soon' | 'muted' }[] = [];
  if (dawLabel) chips.push({ label: dawLabel, tone: 'muted' });
  if (meta?.keyNote) {
    chips.push({ label: `${meta.keyNote}${scaleSuffix(meta.keyScale)}` });
  }
  if (meta?.altKeyNote) {
    chips.push({ label: `${meta.altKeyNote}${scaleSuffix(meta.altKeyScale)} alt`, tone: 'muted' });
  }
  if (meta?.bpm) chips.push({ label: `${meta.bpm} BPM` });
  if (meta?.deadline) {
    const u = deadlineUrgency(meta.deadline);
    const tone: 'urgent' | 'soon' | undefined =
      u === 'overdue' ? 'urgent' : u === 'soon' ? 'soon' : undefined;
    chips.push({ label: formatDeadlineRelative(meta.deadline), tone });
  }

  if (chips.length === 0) return null;
  return (
    <div className="mono mt-1 flex flex-wrap items-center gap-2 text-xs">
      {chips.map((c, i) => (
        <span
          key={i}
          className={`rounded border px-2 py-0.5 ${
            c.tone === 'urgent'
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : c.tone === 'soon'
                ? 'border-stack-fire/40 bg-stack-fire/10 text-stack-fire'
                : c.tone === 'muted'
                  ? 'border-gray-700 bg-gray-900 text-gray-400'
                  : 'border-gray-700 bg-gray-800 text-stack-white'
          }`}
          title={c.label === formatDeadlineRelative(meta?.deadline ?? '') && meta?.deadline ? formatDeadline(meta.deadline) : undefined}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function scaleSuffix(scale: string | null): string {
  if (scale === 'minor') return ' min';
  if (scale === 'major') return ' maj';
  return '';
}

function ProjectFileMeta({ primary }: { primary: Asset | null }) {
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  if (!primary) return null;
  const meta = (primary.meta ?? {}) as AssetProjectMeta;
  const plugins = meta.plugins ?? [];
  const samples = meta.samples ?? [];
  const tempo = meta.tempo ?? null;
  const ts = meta.timeSignature ?? null;
  const trackCount = meta.trackCount ?? null;
  const author = meta.author ?? null;
  const genre = meta.genre ?? null;
  const fileSize = meta.fileSizeBytes ?? null;

  const summary: { label: string; value: string }[] = [];
  if (tempo) summary.push({ label: 'Tempo', value: `${Math.round(tempo)} BPM` });
  if (ts) summary.push({ label: 'Time', value: ts });
  if (trackCount) summary.push({ label: 'Channels', value: String(trackCount) });
  if (author) summary.push({ label: 'Author', value: author });
  if (genre) summary.push({ label: 'Genre', value: genre });
  if (fileSize) summary.push({ label: 'FLP size', value: formatFileSize(fileSize) });

  if (
    summary.length === 0 &&
    plugins.length === 0 &&
    samples.length === 0
  ) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      {summary.length > 0 && (
        <div className="mono flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-400">
          {summary.map((s) => (
            <span key={s.label}>
              <span className="text-gray-500">{s.label.toLowerCase()} </span>
              <span className="text-stack-white">{s.value}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {plugins.length > 0 && (
          <button
            onClick={() => setPluginsOpen((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
              pluginsOpen
                ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-stack-fire/50 hover:text-stack-white'
            }`}
          >
            {pluginsOpen ? 'Hide' : 'Show'} {plugins.length} plugin{plugins.length === 1 ? '' : 's'}
          </button>
        )}
        {samples.length > 0 && (
          <button
            onClick={() => setSamplesOpen((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
              samplesOpen
                ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-stack-fire/50 hover:text-stack-white'
            }`}
          >
            {samplesOpen ? 'Hide' : 'Show'} {samples.length} sample{samples.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {pluginsOpen && plugins.length > 0 && (
        <DetailList items={plugins} max={120} />
      )}
      {samplesOpen && samples.length > 0 && (
        <DetailList items={samples.map(basename)} max={200} title={samples} />
      )}
    </div>
  );
}

function DetailList({
  items,
  max,
  title,
}: {
  items: string[];
  max: number;
  title?: string[];
}) {
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  return (
    <div className="mt-1 max-h-44 overflow-auto rounded border border-gray-700 bg-gray-800/40 p-2">
      <ul className="mono flex flex-col gap-0.5 text-[11px] text-gray-300">
        {shown.map((item, i) => (
          <li key={`${item}-${i}`} className="truncate" title={title?.[i] ?? item}>
            {item}
          </li>
        ))}
        {more > 0 && (
          <li className="pt-1 text-[10px] uppercase tracking-widest text-gray-500">
            +{more} more
          </li>
        )}
      </ul>
    </div>
  );
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/');
  return norm.slice(norm.lastIndexOf('/') + 1);
}

const BACKUP_HINT_RE = /\b(autosaved|overwritten|backup)\b/i;

/**
 * Pick the primary DAW project file at the project root:
 *   1. Root-level (no subfolder) file whose stem equals the parsed title.
 *   2. Root-level non-backup file (filename doesn't contain autosaved/overwritten).
 *   3. Most recently updated root-level file.
 *   4. Fallback: most recently updated file anywhere under the prefix.
 */
function pickPrimaryProject(
  assets: Asset[],
  pathPrefix: string,
  title: string | undefined
): Asset | null {
  if (assets.length === 0) return null;
  const norm = pathPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const isAtRoot = (a: Asset) => {
    const p = a.path.replace(/\\/g, '/');
    if (!p.startsWith(`${norm}/`)) return false;
    return !p.slice(norm.length + 1).includes('/');
  };
  const rootAssets = assets.filter(isAtRoot);

  if (title) {
    const titleStem = title.toLowerCase();
    const exact = rootAssets.find((a) => stem(a.filename).toLowerCase() === titleStem);
    if (exact) return exact;
  }

  const nonBackup = rootAssets.filter((a) => !BACKUP_HINT_RE.test(a.filename));
  if (nonBackup.length > 0) {
    return nonBackup.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  if (rootAssets.length > 0) {
    return rootAssets.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  return assets.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function stem(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(0, i) : filename;
}
