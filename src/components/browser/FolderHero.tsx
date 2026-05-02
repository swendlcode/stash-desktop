import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePacks } from '../../hooks/usePacks';
import { libraryService } from '../../services/libraryService';
import { useFilterStore } from '../../stores/filterStore';
import { PackCover } from '../asset/PackCover';
import { PackDescription } from '../library/PackDescription';
import { CoverEditorModal } from '../library/CoverEditorModal';
import { formatCount, formatFileSize } from '../../utils/formatters';
import { ArrowRight2 } from '../ui/icons';

interface Props {
  pathPrefix: string;
  totalCount: number;
}

interface Crumb {
  label: string;
  path: string;
}

export function FolderHero({ pathPrefix, totalCount }: Props) {
  const { data: packs = [] } = usePacks();
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);

  const pack = packs.find((p) => p.rootPath === pathPrefix) ?? null;
  const folderName =
    pack?.name ??
    pathPrefix.split(/[/\\]/).filter(Boolean).slice(-1)[0] ??
    'Folder';
  const [open, setOpen] = useState(false);

  // Find the matching watched-folder root so the breadcrumb stops climbing
  // there instead of exposing the user's home-directory path.
  const { data: watched = [] } = useQuery({
    queryKey: ['watched-folders'],
    queryFn: () => libraryService.getWatchedFolders(),
    staleTime: 60_000,
  });

  const crumbs = useMemo<Crumb[]>(
    () => buildCrumbs(pathPrefix, watched.map((w) => w.path)),
    [pathPrefix, watched]
  );

  const { data: info } = useQuery({
    queryKey: ['folder-info', pathPrefix],
    queryFn: () => libraryService.getFolderInfo(pathPrefix),
    staleTime: 30_000,
  });

  return (
    <div className="flex shrink-0 items-start gap-4 border-b border-gray-700 px-6 py-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative shrink-0 overflow-hidden rounded-lg border border-transparent transition-colors hover:border-stack-fire focus:outline-none focus:ring-2 focus:ring-stack-fire"
        title="Edit cover — paste, upload, or fetch from URL"
        aria-label="Edit folder cover"
      >
        <PackCover packRoot={pathPrefix} packName={folderName} size={72} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold uppercase tracking-widest text-transparent transition-all group-hover:bg-black/55 group-hover:text-stack-white">
          Edit cover
        </div>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <nav
          className="flex min-w-0 flex-wrap items-center gap-x-1 text-[11px] uppercase tracking-widest text-gray-500"
          aria-label="Folder breadcrumb"
        >
          {crumbs.length <= 1 ? (
            <span className="text-gray-500">Folder</span>
          ) : (
            crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={c.path} className="flex items-center gap-1">
                  {isLast ? (
                    <span className="truncate text-stack-fire" title={c.path}>{c.label}</span>
                  ) : (
                    <button
                      onClick={() => setPathPrefix(c.path)}
                      className="truncate text-gray-400 hover:text-stack-white"
                      title={c.path}
                    >
                      {c.label}
                    </button>
                  )}
                  {!isLast && (
                    <ArrowRight2 size={10} color="currentColor" variant="Linear" />
                  )}
                </span>
              );
            })
          )}
        </nav>
        <div className="truncate text-2xl font-bold text-stack-white" title={folderName}>
          {folderName}
        </div>
        <div className="mt-1">
          <PackDescription packRoot={pathPrefix} />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 gap-6 text-right">
        <Stat label="samples" value={formatCount(totalCount)} />
        <Stat
          label="files"
          value={info ? formatCount(Number(info.fileCount)) : '—'}
        />
        <Stat
          label="size"
          value={info ? formatFileSize(Number(info.totalSizeBytes)) : '—'}
        />
      </div>

      {open && (
        <CoverEditorModal
          packRoot={pathPrefix}
          packName={folderName}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <div className="mono text-xl text-stack-white">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-gray-500">
        {label}
      </div>
    </div>
  );
}

/**
 * Produces a breadcrumb chain from the watched-folder root down to the
 * current path. The first crumb is the watched root itself (its basename),
 * each subsequent crumb is a child folder. Clicking any non-terminal crumb
 * jumps the browser filter to that ancestor.
 *
 * Falls back to the last two path segments if no watched root matches.
 */
function buildCrumbs(path: string, watchedRoots: string[]): Crumb[] {
  const norm = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const root = watchedRoots
    .map((w) => w.replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter((w) => norm === w || norm.startsWith(`${w}/`))
    .sort((a, b) => b.length - a.length)[0];

  const lastSeg = (p: string) => p.split('/').filter(Boolean).slice(-1)[0] ?? p;

  if (!root) {
    const parts = norm.split('/').filter(Boolean);
    if (parts.length <= 1) return [{ label: lastSeg(norm), path: norm }];
    const parent = '/' + parts.slice(0, -1).join('/');
    return [
      { label: parts[parts.length - 2], path: parent },
      { label: parts[parts.length - 1], path: norm },
    ];
  }

  const rel = norm === root ? '' : norm.slice(root.length + 1);
  const parts = rel ? rel.split('/').filter(Boolean) : [];
  const crumbs: Crumb[] = [{ label: lastSeg(root), path: root }];
  let acc = root;
  for (const seg of parts) {
    acc = `${acc}/${seg}`;
    crumbs.push({ label: seg, path: acc });
  }
  return crumbs;
}
