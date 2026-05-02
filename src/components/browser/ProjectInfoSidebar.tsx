import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { libraryService } from '../../services/libraryService';
import { useFilterStore } from '../../stores/filterStore';
import { CloseCircle, Folder } from '../ui/icons';
import { formatCount, formatFileSize } from '../../utils/formatters';
import {
  formatDeadline,
  formatDeadlineRelative,
} from '../../utils/projectFormatters';
import type { Asset, Pack, ProjectMeta as AssetProjectMeta } from '../../types';

interface Props {
  pathPrefix: string;
  folderName: string;
  primary: Asset | null;
  totalCount: number;
  pack?: Pack | null;
  onClose: () => void;
}

/**
 * Right-side overlay drawer with everything Stack knows about the project:
 * file/size breakdown, FLP-extracted plugins/samples/channels/patterns, and
 * folder map. Closes on Escape or backdrop click.
 */
export function ProjectInfoSidebar({
  pathPrefix,
  folderName,
  primary,
  totalCount,
  pack,
  onClose,
}: Props) {
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);

  const { data: info, isLoading } = useQuery({
    queryKey: ['project-info', pathPrefix],
    queryFn: () => libraryService.getProjectInfo(pathPrefix),
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = (primary?.meta ?? {}) as AssetProjectMeta;
  const folderMeta = pack?.projectMeta ?? null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Project info">
      <button
        type="button"
        aria-label="Close info panel"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-[1px]"
      />
      <aside className="flex h-full w-[420px] max-w-[90vw] flex-col border-l border-gray-700 bg-stack-black shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-700 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Project info</div>
            <div className="truncate text-sm font-semibold text-stack-white" title={folderName}>
              {folderName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-stack-white"
            aria-label="Close"
          >
            <CloseCircle size={18} color="currentColor" variant="Linear" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {isLoading && !info ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Reading folder…
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <Section title="Summary">
                <SummaryGrid
                  rows={[
                    ['Total files', info ? formatCount(info.fileCount) : '—'],
                    ['Visible in browser', formatCount(totalCount)],
                    ['On disk', info ? formatFileSize(info.totalSizeBytes) : '—'],
                  ]}
                />
              </Section>

              {info && (
                <Section title="By type">
                  <Stack>
                    <BreakdownRow label="Audio" stat={info.audio} total={info.totalSizeBytes} />
                    <BreakdownRow label="MIDI" stat={info.midi} total={info.totalSizeBytes} />
                    <BreakdownRow label="Presets" stat={info.preset} total={info.totalSizeBytes} />
                    <BreakdownRow label="Projects" stat={info.project} total={info.totalSizeBytes} />
                    <BreakdownRow label="Video" stat={info.video} total={info.totalSizeBytes} />
                    <BreakdownRow label="Images" stat={info.image} total={info.totalSizeBytes} />
                    <BreakdownRow label="Other" stat={info.other} total={info.totalSizeBytes} />
                  </Stack>
                </Section>
              )}

              {info && info.backupCount > 0 && (
                <Section title="Backups">
                  <SummaryGrid
                    rows={[
                      ['Backup files', formatCount(info.backupCount)],
                      ['Backup size', formatFileSize(info.backupSizeBytes)],
                    ]}
                  />
                </Section>
              )}

              <ProjectFileSection meta={meta} folderMeta={folderMeta} />

              {info && info.subfolders.length > 0 && (
                <Section title={`Folder map · ${info.subfolders.length}`}>
                  <Stack>
                    {info.subfolders.map((sub) => (
                      <button
                        key={sub.path}
                        onClick={() => {
                          setPathPrefix(sub.path);
                          onClose();
                        }}
                        className="group flex items-center justify-between gap-3 rounded-md border border-transparent bg-gray-900 px-3 py-2 text-left transition-colors hover:border-stack-fire/50 hover:bg-gray-800"
                        title={`Filter to ${sub.path}`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Folder size={14} color="currentColor" variant="Linear" />
                          <span className="truncate text-sm text-stack-white group-hover:text-stack-fire">
                            {sub.name}
                          </span>
                        </div>
                        <div className="mono shrink-0 text-right text-[11px] text-gray-500">
                          {formatCount(sub.fileCount)} · {formatFileSize(sub.sizeBytes)}
                        </div>
                      </button>
                    ))}
                  </Stack>
                </Section>
              )}

              {primary && (
                <Section title="Project file">
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="truncate text-stack-white" title={primary.filename}>
                      {primary.filename}
                    </div>
                    <button
                      onClick={() => revealItemInDir(primary.path).catch(() => {})}
                      className="self-start text-[11px] uppercase tracking-widest text-stack-fire hover:underline"
                    >
                      Reveal in Finder
                    </button>
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ProjectFileSection({
  meta,
  folderMeta,
}: {
  meta: AssetProjectMeta | undefined;
  folderMeta: Pack['projectMeta'] | null;
}) {
  if (!meta) return null;
  const summary: [string, string][] = [];
  if (meta.daw) summary.push(['DAW', meta.daw]);
  if (meta.version) summary.push(['Version', meta.version]);
  if (meta.tempo) summary.push(['Tempo', `${Math.round(meta.tempo)} BPM`]);
  if (meta.timeSignature) summary.push(['Time sig', meta.timeSignature]);
  if (meta.trackCount) summary.push(['Channels', String(meta.trackCount)]);
  if (meta.sampleCount) summary.push(['Sample refs', String(meta.sampleCount)]);
  if (meta.title) summary.push(['Title', meta.title]);
  if (meta.author) summary.push(['Author', meta.author]);
  if (meta.genre) summary.push(['Genre', meta.genre]);
  if (meta.url) summary.push(['URL', meta.url]);
  if (meta.fileSizeBytes) summary.push(['File size', formatFileSize(meta.fileSizeBytes)]);
  if (folderMeta?.deadline) {
    summary.push([
      'Deadline',
      `${formatDeadline(folderMeta.deadline)} · ${formatDeadlineRelative(folderMeta.deadline)}`,
    ]);
  }

  const plugins = meta.plugins ?? [];
  const samples = meta.samples ?? [];
  const channels = meta.channels ?? [];
  const patterns = meta.patterns ?? [];
  const mixerTracks = meta.mixerTracks ?? [];

  if (
    summary.length === 0 &&
    plugins.length === 0 &&
    samples.length === 0 &&
    channels.length === 0 &&
    patterns.length === 0 &&
    mixerTracks.length === 0 &&
    !meta.comments
  ) {
    return null;
  }

  return (
    <Section title="Project file">
      <Stack>
        {summary.length > 0 && <KeyValueGrid rows={summary} />}
        {meta.comments && (
          <div className="rounded border border-gray-700 bg-gray-900 p-2 text-[12px] leading-relaxed text-gray-300 whitespace-pre-wrap">
            {meta.comments}
          </div>
        )}
        {plugins.length > 0 && (
          <CollapsibleList title="Plugins" items={plugins} />
        )}
        {channels.length > 0 && (
          <CollapsibleList title="Channels" items={channels} />
        )}
        {patterns.length > 0 && (
          <CollapsibleList title="Patterns" items={patterns} />
        )}
        {mixerTracks.length > 0 && (
          <CollapsibleList title="Mixer tracks" items={mixerTracks} />
        )}
        {samples.length > 0 && (
          <CollapsibleList title="Samples" items={samples} preserveFullPathInTooltip />
        )}
      </Stack>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

function SummaryGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <div className="text-gray-500">{k}</div>
          <div className="mono text-right text-stack-white">{v}</div>
        </div>
      ))}
    </div>
  );
}

function KeyValueGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <div className="text-gray-500">{k}</div>
          <div
            className="mono truncate text-right text-stack-white"
            title={v}
          >
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

function BreakdownRow({
  label,
  stat,
  total,
}: {
  label: string;
  stat: { count: number; sizeBytes: number };
  total: number;
}) {
  if (stat.count === 0) return null;
  const pct = total > 0 ? Math.round((stat.sizeBytes / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-gray-300">{label}</span>
        <span className="mono text-gray-500">
          {formatCount(stat.count)} · {formatFileSize(stat.sizeBytes)}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-gray-800">
        <div
          className="h-full bg-stack-fire/60"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CollapsibleList({
  title,
  items,
  preserveFullPathInTooltip = false,
}: {
  title: string;
  items: string[];
  preserveFullPathInTooltip?: boolean;
}) {
  return (
    <details className="group rounded border border-gray-700 bg-gray-900">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[12px] text-stack-white marker:text-transparent">
        <span>{title}</span>
        <span className="mono text-[10px] text-gray-500">{items.length}</span>
      </summary>
      <ul className="mono max-h-56 overflow-auto border-t border-gray-800 px-3 py-2 text-[11px] text-gray-300">
        {items.map((item, i) => {
          const display = preserveFullPathInTooltip ? basename(item) : item;
          return (
            <li
              key={`${item}-${i}`}
              className="truncate"
              title={preserveFullPathInTooltip ? item : undefined}
            >
              {display}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/');
  return norm.slice(norm.lastIndexOf('/') + 1);
}
