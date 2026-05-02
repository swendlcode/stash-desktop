import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { libraryService } from '../../services/libraryService';
import { assetService } from '../../services/assetService';
import { audioEngine } from '../../services/audioEngine';
import { useFilterStore } from '../../stores/filterStore';
import { usePlayerStore } from '../../stores/playerStore';
import type { Asset, Pack, ProjectMeta as AssetProjectMeta } from '../../types';
import { CloseCircle, Eye, Folder, Maximize3, Maximize4, Pause, Play } from '../ui/icons';
import { formatCount, formatFileSize } from '../../utils/formatters';
import { formatDeadline, formatDeadlineRelative } from '../../utils/projectFormatters';

const MIN_WIDTH = 320;
const MAX_WIDTH = 680;
const BACKUP_HINT_RE = /\b(autosaved|overwritten|backup)\b/i;

interface Props {
  pathPrefix: string;
  folderName: string;
  totalCount: number;
  pack: Pack | null;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  mode?: 'sidebar' | 'page';
}

export function ProjectDetailsPanel({
  pathPrefix,
  folderName,
  totalCount,
  pack,
  width,
  onWidthChange,
  onClose,
  mode = 'sidebar',
}: Props) {
  const isPage = mode === 'page';
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(width);
  const [selectedLaneIdx, setSelectedLaneIdx] = useState<number | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [selectedArrIdx, setSelectedArrIdx] = useState<number>(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineRowHeight, setTimelineRowHeight] = useState(isPage ? 32 : 16);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  const [gutterWidth, setGutterWidth] = useState(96);
  const gutterDragRef = useRef(false);
  const gutterStartXRef = useRef(0);
  const gutterStartWRef = useRef(96);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const resizeRowsRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHRef = useRef(timelineRowHeight);
  const detailsScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineMainScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineTopTrackRef = useRef<HTMLDivElement | null>(null);
  const [timelineThumb, setTimelineThumb] = useState({ width: 0, left: 0, visible: false });
  const draggingThumbRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartLeftRef = useRef(0);

  // `getProjectInfo` walks the entire project folder on disk to compute
  // totals — slow on big libraries. The timeline doesn't need it (clips come
  // from the indexed asset row), so let the rest of the panel render in
  // parallel and treat info as a progressive enhancement for Summary/
  // Folder-map.
  const { data: info } = useQuery({
    queryKey: ['project-info', pathPrefix],
    queryFn: () => libraryService.getProjectInfo(pathPrefix),
    staleTime: 30_000,
  });

  const { data: rootProjects = [], isLoading: rootProjectsLoading } = useQuery({
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

  const primary = useMemo(
    () => pickPrimaryProject(rootProjects, pathPrefix, pack?.projectMeta?.title),
    [rootProjects, pathPrefix, pack?.projectMeta?.title]
  );
  const meta = (primary?.meta ?? {}) as AssetProjectMeta;
  // "Track layout" sidebar list — human-readable instrument/insert names. This
  // is informational and unrelated to the playlist track indices below.
  const layoutTracks = useMemo(() => {
    const namedTracks =
      meta.mixerTracks && meta.mixerTracks.length > 0 ? meta.mixerTracks : meta.channels ?? [];
    return namedTracks
      .map((track) => track.trim())
      .filter(Boolean)
      .slice(0, 256);
  }, [meta.mixerTracks, meta.channels]);
  const patternList = useMemo(() => {
    if (meta.patterns && meta.patterns.length > 0) {
      const cleaned = meta.patterns
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 1024);
      return cleaned;
    }
    return [];
  }, [meta.patterns]);
  const mixerTrackNames = useMemo(
    () => (meta.mixerTracks ?? []).map((t) => t.trim()).filter(Boolean),
    [meta.mixerTracks]
  );

  // FL 12.9+ files can hold multiple arrangements; each one is its own
  // playlist. `arrangements` is the source of truth — fall back to the legacy
  // top-level `clips` field for older parses that haven't been re-indexed yet.
  const arrangements = useMemo(() => {
    if (meta.arrangements && meta.arrangements.length > 0) return meta.arrangements;
    if (meta.clips && meta.clips.length > 0) {
      return [{ index: 0, name: null, clips: meta.clips }];
    }
    return [];
  }, [meta.arrangements, meta.clips]);

  const activeArrIdx = Math.min(selectedArrIdx, Math.max(0, arrangements.length - 1));
  const clips = useMemo(
    () => arrangements[activeArrIdx]?.clips ?? [],
    [arrangements, activeArrIdx]
  );
  const ppq = meta.ppq && meta.ppq > 0 ? meta.ppq : 96;

  const lanes = useMemo(() => {
    if (clips.length === 0) return [];
    // Bucket clips per track, then sort tracks top-down. Cap visible lanes so
    // the panel doesn't render hundreds of empty rows.
    const byTrack = new Map<number, typeof clips>();
    for (const clip of clips) {
      const arr = byTrack.get(clip.track) ?? [];
      arr.push(clip);
      byTrack.set(clip.track, arr);
    }
    const laneLimit = isPage ? 32 : 12;
    const sortedTrackIds = Array.from(byTrack.keys()).sort((a, b) => a - b).slice(0, laneLimit);
    return sortedTrackIds.map((trackId, laneIdx) => {
      const trackClips = byTrack.get(trackId) ?? [];
      const blocks = trackClips.map((clip, idx) => {
        const patternName =
          clip.patternIndex !== null && clip.patternIndex !== undefined
            ? patternList[clip.patternIndex] ?? `Pattern ${clip.patternIndex + 1}`
            : null;
        return {
          key: `clip-${trackId}-${idx}`,
          patternName,
          patternIndex: clip.patternIndex,
          channelIndex: clip.channelIndex,
          positionTicks: clip.positionTicks,
          lengthTicks: clip.lengthTicks,
          muted: clip.muted,
        };
      });
      return {
        laneIdx,
        trackId,
        // Mixer-track names are a different domain (FX channels) but they're
        // the closest human-readable label we have for now.
        label: mixerTrackNames[laneIdx] ?? `Track ${trackId + 1}`,
        blocks,
      };
    });
  }, [clips, patternList, mixerTrackNames, isPage]);

  const hasLayoutData = lanes.length > 0;

  // Timeline domain in beats — derived from the latest clip end so the grid
  // covers the whole arrangement, with a comfortable trailing gap.
  const TIMELINE_BEATS = useMemo(() => {
    const minBeats = isPage ? 64 : 32;
    if (clips.length === 0) return isPage ? 128 : 64;
    let maxTicks = 0;
    for (const c of clips) {
      const end = c.positionTicks + c.lengthTicks;
      if (end > maxTicks) maxTicks = end;
    }
    const beats = Math.ceil(maxTicks / ppq);
    return Math.max(minBeats, beats + 8);
  }, [clips, ppq, isPage]);
  const pixelsPerBeat = Math.max(2, Math.round(16 * timelineZoom));
  const timelineWidth = Math.max(isPage ? 480 : 600, TIMELINE_BEATS * pixelsPerBeat);
  const showFineGrid = timelineZoom >= 1.1;
  const gridFine = Math.max(2, Math.round(pixelsPerBeat / 4)); // 1/4 beat
  const gridQuarter = pixelsPerBeat; // 1 beat
  const gridBar = pixelsPerBeat * 4; // 1 bar (4/4)

  const lanePatternSet = useMemo(() => {
    if (selectedLaneIdx === null || !lanes[selectedLaneIdx]) return null;
    return new Set(
      lanes[selectedLaneIdx].blocks
        .map((b) => b.patternName)
        .filter((n): n is string => Boolean(n))
    );
  }, [lanes, selectedLaneIdx]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = startWRef.current + (startXRef.current - e.clientX);
      onWidthChange(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onWidthChange]);

  useEffect(() => {
    if (!timelineFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTimelineFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timelineFullscreen]);

  useEffect(() => {
    let rafId: number | null = null;
    let pendingY = 0;
    const onMove = (e: PointerEvent) => {
      if (!resizeRowsRef.current) return;
      pendingY = e.clientY;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const delta = pendingY - resizeStartYRef.current;
        setTimelineRowHeight(Math.max(12, Math.min(72, resizeStartHRef.current + delta)));
      });
    };
    const onUp = () => {
      if (!resizeRowsRef.current) return;
      resizeRowsRef.current = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.documentElement.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  useEffect(() => {
    // rAF-coalesced drag: pointermove can fire faster than the screen refresh.
    // Folding multiple moves per frame into a single setState stops the panel
    // from re-rendering hundreds of lanes more than once per paint.
    let rafId: number | null = null;
    let pendingX = 0;
    const onMove = (e: PointerEvent) => {
      if (!gutterDragRef.current) return;
      pendingX = e.clientX;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const next = gutterStartWRef.current + (pendingX - gutterStartXRef.current);
        setGutterWidth(Math.max(56, Math.min(320, next)));
      });
    };
    const onUp = () => {
      if (!gutterDragRef.current) return;
      gutterDragRef.current = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const refreshTimelineThumb = () => {
    const main = timelineMainScrollRef.current;
    const track = timelineTopTrackRef.current;
    if (!main || !track) return;
    const trackWidth = track.clientWidth;
    const { scrollWidth, clientWidth, scrollLeft } = main;
    if (scrollWidth <= 0 || clientWidth <= 0 || trackWidth <= 0) return;
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const ratio = clientWidth / scrollWidth;
    const thumbWidth = Math.max(24, Math.round(trackWidth * ratio));
    const maxLeft = Math.max(0, trackWidth - thumbWidth);
    const thumbLeft = Math.round((scrollLeft / maxScroll) * maxLeft);
    setTimelineThumb({
      width: thumbWidth,
      left: thumbLeft,
      visible: scrollWidth > clientWidth + 1,
    });
  };

  useEffect(() => {
    // Re-measure on fullscreen toggle so the horizontal scrollbar thumb reflects
    // the new viewport width after the layout swap.
    const id = window.requestAnimationFrame(() => refreshTimelineThumb());
    return () => window.cancelAnimationFrame(id);
  }, [timelineWidth, timelineRowHeight, isPage, lanes.length, timelineZoom, timelineFullscreen]);

  useEffect(() => {
    const onResize = () => refreshTimelineThumb();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingThumbRef.current) return;
      const main = timelineMainScrollRef.current;
      const track = timelineTopTrackRef.current;
      if (!main || !track) return;
      const deltaX = e.clientX - dragStartXRef.current;
      const trackWidth = track.clientWidth;
      const maxThumbLeft = Math.max(1, trackWidth - timelineThumb.width);
      const nextLeft = Math.max(0, Math.min(maxThumbLeft, dragStartLeftRef.current + deltaX));
      const maxScroll = Math.max(0, main.scrollWidth - main.clientWidth);
      const nextScrollLeft = (nextLeft / maxThumbLeft) * maxScroll;
      main.scrollLeft = nextScrollLeft;
      refreshTimelineThumb();
    };
    const onUp = () => {
      draggingThumbRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [timelineThumb.width]);

  return (
    <aside
      className={`relative flex flex-col bg-stack-black ${
        mode === 'sidebar'
          ? 'shrink-0 border-l border-gray-700/70'
          : 'w-full border-t border-gray-700/70'
      }`}
      style={mode === 'sidebar' ? { width } : undefined}
    >
      {mode === 'sidebar' && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            draggingRef.current = true;
            startXRef.current = e.clientX;
            startWRef.current = width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="absolute left-0 top-0 h-full w-1 -translate-x-1/2 cursor-col-resize transition-colors hover:bg-stack-fire/40 active:bg-stack-fire/60"
          title="Drag to resize"
        />
      )}
      <header className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-stack-fire/70">
            {mode === 'sidebar' ? 'Project details' : 'Project layout view'}
          </div>
          <div className="truncate text-sm font-semibold text-stack-white">{folderName}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-stack-fire/15 hover:text-stack-white">
          <CloseCircle size={18} color="currentColor" variant="Linear" />
        </button>
      </header>
      <div
        ref={detailsScrollRef}
        className={`${isPage ? 'overflow-visible px-4 py-4 pb-28' : 'min-h-0 flex-1 overflow-auto px-4 py-4'}`}
      >
        {rootProjectsLoading && !primary ? (
          <div className="text-sm text-gray-500">Reading project…</div>
        ) : (
          <div className={`${isPage ? 'mx-auto w-full max-w-none' : ''} flex flex-col gap-5`}>
            {!isPage && (
              <>
                <Section title="Summary">
                  <KV label="Visible" value={formatCount(totalCount)} />
                  <KV label="On disk" value={info ? formatFileSize(info.totalSizeBytes) : '—'} />
                  <KV label="Deadline" value={pack?.projectMeta?.deadline ? `${formatDeadline(pack.projectMeta.deadline)} · ${formatDeadlineRelative(pack.projectMeta.deadline)}` : '—'} />
                </Section>

                <Section title="Project file">
                  <KV label="DAW" value={meta.daw ?? '—'} />
                  <KV label="Tempo" value={meta.tempo ? `${Math.round(meta.tempo)} BPM` : '—'} />
                  <KV label="Time sig" value={meta.timeSignature ?? '—'} />
                  <KV label="Channels" value={meta.trackCount ? String(meta.trackCount) : '—'} />
                  <KV label="Samples" value={meta.sampleCount ? String(meta.sampleCount) : '—'} />
                  {primary && (
                    <button
                      onClick={() => revealItemInDir(primary.path).catch(() => {})}
                      className="mt-1 flex items-center gap-1 text-xs text-stack-fire hover:underline"
                    >
                      <Folder size={13} color="currentColor" variant="Linear" />
                      Reveal primary file
                    </button>
                  )}
                </Section>
              </>
            )}

            {(layoutTracks?.length ?? 0) > 0 && (
              <Section title={`Track layout (${layoutTracks.length})`}>
                <div className="max-h-52 overflow-auto rounded border border-gray-700 bg-gray-800/40 p-2">
                  <ul className="flex flex-col gap-1">
                    {layoutTracks.map((track, i) => (
                      <li key={`${track}-${i}`} className="flex items-center gap-2 text-xs">
                        <span className="mono inline-flex h-5 min-w-6 items-center justify-center rounded bg-gray-800 px-1.5 text-[10px] text-gray-400">
                          {i + 1}
                        </span>
                        <span className="truncate text-stack-white/90" title={track}>
                          {track}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            )}

            {(() => {
            const timelineSection = (
            <section
              className={
                timelineFullscreen
                  ? 'absolute inset-0 z-40 flex flex-col bg-stack-black p-4'
                  : 'flex flex-col'
              }
            >
              {timelineFullscreen && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="syne text-sm font-semibold text-stack-white">
                    Timeline — {meta.title ?? folderName}
                  </span>
                  <span className="mono text-[10px] text-gray-500">
                    {lanes.length} {lanes.length === 1 ? 'track' : 'tracks'} · {clips.length}{' '}
                    {clips.length === 1 ? 'clip' : 'clips'}
                  </span>
                </div>
              )}
              {arrangements.length > 1 && (
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="mono mr-1 text-[10px] uppercase tracking-widest text-gray-500">
                    Arrangement
                  </span>
                  {arrangements.map((arr, i) => {
                    const label = arr.name && arr.name.trim().length > 0 ? arr.name : `#${arr.index + 1}`;
                    const isActive = i === activeArrIdx;
                    return (
                      <button
                        key={`arr-${arr.index}-${i}`}
                        onClick={() => setSelectedArrIdx(i)}
                        className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                          isActive
                            ? 'border-stack-fire bg-stack-fire/15 text-stack-fire'
                            : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-stack-fire/60 hover:text-stack-white'
                        }`}
                        title={`${label} · ${arr.clips.length} clip${arr.clips.length === 1 ? '' : 's'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mb-2 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => setTimelineZoom((z) => Math.max(0.15, Math.round((z - 0.1) * 100) / 100))}
                  className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:border-stack-fire/60 hover:text-stack-white"
                  title="Zoom out timeline"
                >
                  -
                </button>
                <span className="mono w-12 text-center text-[10px] text-gray-500">{Math.round(timelineZoom * 100)}%</span>
                <button
                  onClick={() => setTimelineZoom((z) => Math.min(4, Math.round((z + 0.1) * 100) / 100))}
                  className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:border-stack-fire/60 hover:text-stack-white"
                  title="Zoom in timeline"
                >
                  +
                </button>
                <button
                  onClick={() => setTimelineZoom(1)}
                  className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:border-stack-fire/60 hover:text-stack-white"
                  title="Reset zoom"
                >
                  100%
                </button>
                <button
                  onClick={() => setTimelineFullscreen((f) => !f)}
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded border border-gray-700 text-gray-300 hover:border-stack-fire/60 hover:text-stack-white"
                  title={timelineFullscreen ? 'Exit fullscreen (Esc)' : 'Open fullscreen timeline'}
                  aria-label={timelineFullscreen ? 'Exit fullscreen timeline' : 'Open fullscreen timeline'}
                >
                  {timelineFullscreen ? (
                    <Maximize3 size={13} color="currentColor" variant="Linear" />
                  ) : (
                    <Maximize4 size={13} color="currentColor" variant="Linear" />
                  )}
                </button>
              </div>
              {!hasLayoutData ? (
                <div className="rounded-md border border-gray-700/70 bg-gray-900/40 px-3 py-2 text-xs text-gray-400">
                  No playlist clips detected. The arrangement may be empty, or the file is from a
                  format/version we don't parse yet.
                </div>
              ) : (
                <>
                  {isPage && timelineFullscreen && (
                    <div className="-mx-4 h-4 border-y border-gray-700/80 bg-stack-black px-2">
                      <div
                        ref={timelineTopTrackRef}
                        onPointerDown={(e) => {
                          const main = timelineMainScrollRef.current;
                          const track = timelineTopTrackRef.current;
                          if (!main || !track) return;
                          const rect = track.getBoundingClientRect();
                          const clickX = e.clientX - rect.left;
                          const maxThumbLeft = Math.max(1, rect.width - timelineThumb.width);
                          const targetLeft = Math.max(0, Math.min(maxThumbLeft, clickX - timelineThumb.width / 2));
                          const maxScroll = Math.max(0, main.scrollWidth - main.clientWidth);
                          main.scrollLeft = (targetLeft / maxThumbLeft) * maxScroll;
                          refreshTimelineThumb();
                        }}
                        className="relative h-full"
                      >
                        {timelineThumb.visible && (
                          <div
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              draggingThumbRef.current = true;
                              dragStartXRef.current = e.clientX;
                              dragStartLeftRef.current = timelineThumb.left;
                              document.body.style.userSelect = 'none';
                              document.body.style.cursor = 'ew-resize';
                            }}
                            className="absolute top-0.5 h-3 rounded bg-gray-500/70 hover:bg-stack-fire/70"
                            style={{ left: `${timelineThumb.left}px`, width: `${timelineThumb.width}px` }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    onWheel={(e) => {
                      if (isPage && !timelineFullscreen) return;
                      if (!(e.metaKey || e.ctrlKey)) return;
                      // Mouse-anchored zoom: pin the beat under the cursor at
                      // the same on-screen X position. We compute the beat
                      // *before* the state update, then schedule a scrollLeft
                      // adjustment via rAF after the layout reflows at the
                      // new pixelsPerBeat.
                      e.preventDefault();
                      const main = timelineMainScrollRef.current;
                      if (!main) return;
                      const rect = main.getBoundingClientRect();
                      const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                      const beatUnder = (main.scrollLeft + mouseX) / pixelsPerBeat;
                      const factor = e.deltaY < 0 ? 1.08 : 0.92;
                      setTimelineZoom((z) => {
                        const next = z * factor;
                        const clamped = Math.max(0.15, Math.min(4, Math.round(next * 100) / 100));
                        const newPxPerBeat = Math.max(2, Math.round(16 * clamped));
                        requestAnimationFrame(() => {
                          if (!timelineMainScrollRef.current) return;
                          const target = beatUnder * newPxPerBeat - mouseX;
                          timelineMainScrollRef.current.scrollLeft = Math.max(0, target);
                          refreshTimelineThumb();
                        });
                        return clamped;
                      });
                    }}
                    onClick={(e) => {
                      // Page-mode preview is non-scrollable — clicking opens
                      // the full timeline overlay where navigation works.
                      if (isPage && !timelineFullscreen) {
                        e.preventDefault();
                        e.stopPropagation();
                        setTimelineFullscreen(true);
                      }
                    }}
                    className={
                      timelineFullscreen
                        ? 'relative flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain'
                        : isPage
                          ? 'group relative flex h-44 cursor-zoom-in overflow-hidden rounded-lg border border-gray-700 bg-gray-800/30 transition-colors hover:border-stack-fire/60'
                          : 'relative flex max-h-96 overflow-y-auto overflow-x-hidden overscroll-contain'
                    }
                  >
                    {/* Gutter column — fixed-width, never scrolls horizontally. */}
                    <div
                      className="relative shrink-0 border-r border-gray-700/80 bg-stack-black"
                      style={{ width: `${gutterWidth}px` }}
                    >
                      {/* Spacer matching BarRuler height; keeps lane labels
                          aligned with the bar-number row above. Explicit
                          box-sizing pins the height incl. border to 20px. */}
                      <div
                        className="sticky top-0 z-30 h-5 border-b border-gray-700/80 bg-stack-black"
                        style={{ boxSizing: 'border-box' }}
                      />
                      {lanes.map((lane) => {
                        const laneFocused =
                          selectedLaneIdx === null || selectedLaneIdx === lane.laneIdx;
                        return (
                          <div
                            key={`gutter-${lane.trackId}-${lane.laneIdx}`}
                            role="button"
                            tabIndex={0}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedLaneIdx((prev) =>
                                prev === lane.laneIdx ? null : lane.laneIdx
                              );
                            }}
                            className={`mono flex cursor-pointer items-center border-b border-gray-700/70 px-2 text-[10px] transition-colors last:border-b-0 ${
                              laneFocused
                                ? 'text-gray-300 hover:bg-stack-fire/10 hover:text-stack-white'
                                : 'text-gray-600 hover:bg-stack-fire/10 hover:text-gray-300'
                            }`}
                            // Explicit box-sizing keeps the gutter row height
                            // bit-identical to the timeline lane row's height
                            // (both apply the same border-b inside the height).
                            style={{ height: `${timelineRowHeight}px`, boxSizing: 'border-box' }}
                            title={lane.label}
                          >
                            <span className="block w-full truncate">{lane.label}</span>
                          </div>
                        );
                      })}
                      {/* Drag handle — widen the column to reveal full track
                          names. Pointer-event coords drive a global listener. */}
                      <div
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          gutterDragRef.current = true;
                          gutterStartXRef.current = e.clientX;
                          gutterStartWRef.current = gutterWidth;
                          document.body.style.cursor = 'col-resize';
                          document.body.style.userSelect = 'none';
                        }}
                        className="absolute right-0 top-0 z-30 h-full w-1.5 translate-x-1/2 cursor-col-resize transition-colors hover:bg-stack-fire/40 active:bg-stack-fire/60"
                        title="Drag to resize track-name column"
                      />
                    </div>

                    {/* Timeline column — only this scrolls horizontally. */}
                    <div
                      ref={timelineMainScrollRef}
                      onScroll={refreshTimelineThumb}
                      className="min-w-0 flex-1 overflow-x-auto overflow-y-visible"
                    >
                      <div style={{ width: `${timelineWidth}px` }}>
                        <BarRuler beats={TIMELINE_BEATS} pixelsPerBeat={pixelsPerBeat} />
                        {lanes.map((lane) => (
                          <div
                            key={`track-${lane.trackId}-lane-${lane.laneIdx}`}
                            onClick={() =>
                              setSelectedLaneIdx((prev) =>
                                prev === lane.laneIdx ? null : lane.laneIdx
                              )
                            }
                            className="relative cursor-pointer overflow-hidden border-b border-gray-700/70 last:border-b-0"
                            style={{ height: `${timelineRowHeight}px`, boxSizing: 'border-box' }}
                          >
                            <div
                              className="absolute inset-0"
                              style={{
                                backgroundImage: (
                                  showFineGrid
                                    ? [
                                        `repeating-linear-gradient(to right, rgba(148,163,184,0.07) 0, rgba(148,163,184,0.07) 1px, transparent 1px, transparent ${gridFine}px)`,
                                        `repeating-linear-gradient(to right, rgba(148,163,184,0.14) 0, rgba(148,163,184,0.14) 1px, transparent 1px, transparent ${gridQuarter}px)`,
                                        `repeating-linear-gradient(to right, rgba(148,163,184,0.28) 0, rgba(148,163,184,0.28) 1px, transparent 1px, transparent ${gridBar}px)`,
                                      ]
                                    : [
                                        `repeating-linear-gradient(to right, rgba(148,163,184,0.12) 0, rgba(148,163,184,0.12) 1px, transparent 1px, transparent ${gridQuarter}px)`,
                                        `repeating-linear-gradient(to right, rgba(148,163,184,0.28) 0, rgba(148,163,184,0.28) 1px, transparent 1px, transparent ${gridBar}px)`,
                                      ]
                                ).join(', '),
                                backgroundRepeat: showFineGrid ? 'repeat, repeat, repeat' : 'repeat, repeat',
                              }}
                            />
                            {lane.blocks.map((block) => {
                              const patternFocused =
                                !selectedPattern || block.patternName === selectedPattern;
                              const laneFocused =
                                selectedLaneIdx === null || selectedLaneIdx === lane.laneIdx;
                              const focused = patternFocused && laneFocused && !block.muted;
                              const isAudio =
                                block.channelIndex !== null && block.channelIndex !== undefined;
                              const beatsPos = block.positionTicks / ppq;
                              const beatsLen = block.lengthTicks / ppq;
                              const left = beatsPos * pixelsPerBeat;
                              const width = Math.max(2, beatsLen * pixelsPerBeat);
                              const bg = block.muted
                                ? 'rgba(55, 65, 81, 0.4)'
                                : focused
                                  ? isAudio
                                    ? 'rgba(96, 165, 250, 0.75)'
                                    : 'rgba(242, 97, 63, 0.75)'
                                  : 'rgba(55, 65, 81, 0.7)';
                              return (
                                <span
                                  key={block.key}
                                  className="absolute rounded"
                                  title={
                                    block.patternName ??
                                    (isAudio ? `Audio clip (channel ${block.channelIndex})` : 'Clip')
                                  }
                                  style={{
                                    top: `${Math.max(1, timelineRowHeight * 0.18)}px`,
                                    height: `${Math.max(3, timelineRowHeight * 0.62)}px`,
                                    left: `${left}px`,
                                    width: `${width}px`,
                                    backgroundColor: bg,
                                    opacity: block.muted ? 0.55 : 1,
                                  }}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    {isPage && !timelineFullscreen && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stack-black/45 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stack-black/85 text-stack-white shadow-lg">
                          <Eye size={20} color="currentColor" variant="Linear" />
                        </span>
                      </div>
                    )}
                  </div>
                  {(timelineFullscreen || !isPage) && (
                    <div
                      onPointerDown={(e) => {
                        e.preventDefault();
                        resizeRowsRef.current = true;
                        resizeStartYRef.current = e.clientY;
                        resizeStartHRef.current = timelineRowHeight;
                        document.body.style.cursor = 'row-resize';
                        document.body.style.userSelect = 'none';
                        document.documentElement.style.cursor = 'row-resize';
                      }}
                      className="-mx-4 h-1 cursor-row-resize transition-colors hover:bg-stack-fire/40 active:bg-stack-fire/60"
                      title="Drag border to resize track height"
                    >
                      <div className="border-b border-gray-700/80" />
                    </div>
                  )}
                </>
              )}
            </section>
            );
            const portalTarget =
              typeof document !== 'undefined' ? document.getElementById('main-panel') : null;
            return timelineFullscreen && portalTarget
              ? createPortal(timelineSection, portalTarget)
              : timelineSection;
            })()}

            {isPage ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {(patternList?.length ?? 0) > 0 && (
                  <Section title={`Pattern bank (${patternList?.length ?? 0})`}>
                    <div className="max-h-56 overflow-auto rounded border border-gray-700 bg-gray-800/40 p-2">
                      <div className="flex flex-wrap gap-1.5">
                        {patternList.map((pattern, i) => (
                          <button
                            key={`${pattern}-${i}`}
                            onClick={() =>
                              setSelectedPattern((prev) => (prev === pattern ? null : pattern))
                            }
                            className={`mono rounded border px-2 py-0.5 text-[11px] transition-colors ${
                              selectedPattern === pattern
                                ? 'border-stack-fire bg-stack-fire/20 text-stack-fire'
                                : lanePatternSet && !lanePatternSet.has(pattern)
                                ? 'border-stack-fire/20 bg-stack-fire/5 text-stack-fire/35'
                                : 'border-stack-fire/45 bg-stack-fire/10 text-stack-white hover:border-stack-fire/70 hover:bg-stack-fire/15'
                            }`}
                            title={pattern}
                          >
                            {pattern}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Section>
                )}

                {(meta.plugins?.length ?? 0) > 0 && <List title="Plugin rack" items={meta.plugins ?? []} />}
                {(meta.channels?.length ?? 0) > 0 && <List title="Channels" items={meta.channels ?? []} />}
                <IndexedSamples
                  pathPrefix={pathPrefix}
                  referencedPaths={meta.samples ?? []}
                  maxHeightClass="max-h-56"
                />
              </div>
            ) : (
              <>
            {(patternList?.length ?? 0) > 0 && (
              <Section title={`Pattern bank (${patternList?.length ?? 0})`}>
                <div className="max-h-48 overflow-auto rounded border border-gray-700 bg-gray-800/40 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {patternList.map((pattern, i) => (
                      <button
                        key={`${pattern}-${i}`}
                        onClick={() =>
                          setSelectedPattern((prev) => (prev === pattern ? null : pattern))
                        }
                        className={`mono rounded border px-2 py-0.5 text-[11px] transition-colors ${
                          selectedPattern === pattern
                            ? 'border-stack-fire bg-stack-fire/20 text-stack-fire'
                            : lanePatternSet && !lanePatternSet.has(pattern)
                            ? 'border-stack-fire/20 bg-stack-fire/5 text-stack-fire/35'
                            : 'border-stack-fire/45 bg-stack-fire/10 text-stack-white'
                        }`}
                        title={pattern}
                      >
                        {pattern}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {(meta.plugins?.length ?? 0) > 0 && <List title="Plugin rack" items={meta.plugins ?? []} />}
            {(meta.channels?.length ?? 0) > 0 && <List title="Channels" items={meta.channels ?? []} />}
            <IndexedSamples
              pathPrefix={pathPrefix}
              referencedPaths={meta.samples ?? []}
              maxHeightClass="max-h-52"
            />
              </>
            )}

            {isPage ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Folder map">
                  {info && info.subfolders.length > 0 ? (
                    info.subfolders.map((sub) => (
                      <button
                        key={sub.path}
                        onClick={() => setPathPrefix(sub.path)}
                        className="flex w-full items-center justify-between rounded border border-transparent bg-gray-900 px-2 py-1.5 text-left hover:border-stack-fire/50 hover:bg-gray-800"
                      >
                        <span className="truncate text-sm text-stack-white">{sub.name}</span>
                        <span className="mono text-[11px] text-gray-500">{formatCount(sub.fileCount)}</span>
                      </button>
                    ))
                  ) : (
                    <div className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-500">
                      No folders detected.
                    </div>
                  )}
                </Section>

                <Section title="Project info">
                  <KV label="DAW" value={meta.daw ?? '—'} />
                  <KV label="Tempo" value={meta.tempo ? `${Math.round(meta.tempo)} BPM` : '—'} />
                  <KV label="Time sig" value={meta.timeSignature ?? '—'} />
                  <KV label="Tracks" value={meta.trackCount ? String(meta.trackCount) : '—'} />
                  <KV label="Samples" value={meta.sampleCount ? String(meta.sampleCount) : '—'} />
                  <KV label="On disk" value={info ? formatFileSize(info.totalSizeBytes) : '—'} />
                  <KV
                    label="Deadline"
                    value={
                      pack?.projectMeta?.deadline
                        ? `${formatDeadline(pack.projectMeta.deadline)} · ${formatDeadlineRelative(pack.projectMeta.deadline)}`
                        : '—'
                    }
                  />
                  {primary && (
                    <button
                      onClick={() => revealItemInDir(primary.path).catch(() => {})}
                      className="mt-1 flex items-center gap-1 text-xs text-stack-fire hover:underline"
                    >
                      <Folder size={13} color="currentColor" variant="Linear" />
                      Reveal primary file
                    </button>
                  )}
                </Section>
              </div>
            ) : (
              info && info.subfolders.length > 0 && (
                <Section title="Folder map">
                  {info.subfolders.map((sub) => (
                    <button
                      key={sub.path}
                      onClick={() => setPathPrefix(sub.path)}
                      className="flex w-full items-center justify-between rounded border border-transparent bg-gray-900 px-2 py-1.5 text-left hover:border-stack-fire/50 hover:bg-gray-800"
                    >
                      <span className="truncate text-sm text-stack-white">{sub.name}</span>
                      <span className="mono text-[11px] text-gray-500">{formatCount(sub.fileCount)}</span>
                    </button>
                  ))}
                </Section>
              )
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Bar-number ruler aligned to the lane grid (4 beats = 1 bar at 4/4). Lives
 * inside the timeline column (not the gutter), sticky-top so it stays at the
 * top of the visible viewport while lanes scroll vertically.
 */
function BarRuler({ beats, pixelsPerBeat }: { beats: number; pixelsPerBeat: number }) {
  const beatsPerBar = 4;
  const barWidth = pixelsPerBeat * beatsPerBar;
  const totalBars = Math.max(1, Math.ceil(beats / beatsPerBar));
  // Skip labels when bars get too tight to read; keep every Nth.
  const minLabelWidth = 24;
  const stride = Math.max(1, Math.ceil(minLabelWidth / Math.max(1, barWidth)));
  return (
    <div
      className="sticky top-0 z-20 h-5 border-b border-gray-700/80 bg-stack-black"
      style={{ width: `${barWidth * totalBars}px`, boxSizing: 'border-box' }}
    >
      {Array.from({ length: totalBars }, (_, i) => {
        if (i % stride !== 0) return null;
        return (
          <div
            key={`bar-${i}`}
            className="mono absolute top-0 h-full pl-1 text-[10px] leading-5 text-gray-500"
            style={{ left: `${i * barWidth}px` }}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Lists indexed sample assets that live under the project folder. Plays via
 * the persistent PlayerBar (same `usePlayerStore.play()` path AssetRow uses),
 * so previewing here interacts with global transport state. Cross-references
 * the FLP's extracted `referencedPaths` by basename to flag which indexed
 * samples are actually in use by the project.
 */
function IndexedSamples({
  pathPrefix,
  referencedPaths,
  maxHeightClass,
}: {
  pathPrefix: string;
  referencedPaths: string[];
  maxHeightClass: string;
}) {
  // Shallow-compare so the 50ms `currentTime` tick from the player engine
  // doesn't re-render this list (potentially hundreds of rows) every frame.
  const { current, isPlaying, play, stop, resume } = usePlayerStore(
    useShallow((s) => ({
      current: s.currentAsset,
      isPlaying: s.isPlaying,
      play: s.play,
      stop: s.stop,
      resume: s.resume,
    }))
  );

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['project-indexed-samples', pathPrefix],
    staleTime: 30_000,
    queryFn: async () => {
      const result = await assetService.search(
        {
          query: '',
          types: ['sample'],
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
        { field: 'filename', direction: 'asc' },
        500,
        0
      );
      return result.assets;
    },
  });

  // Match by lowercased basename — the FLP can contain Windows-style absolute
  // paths that don't exist on this machine, so a path-equality check would
  // miss every legitimately referenced sample. Basename collisions across
  // sub-folders are rare in practice and fine for a "used in project" hint.
  const referencedSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of referencedPaths) {
      const norm = p.replace(/\\/g, '/');
      const base = norm.slice(norm.lastIndexOf('/') + 1).toLowerCase();
      if (base) set.add(base);
    }
    return set;
  }, [referencedPaths]);

  if (isLoading && samples.length === 0) {
    return (
      <Section title="Samples in project">
        <div className="text-xs text-gray-500">Loading…</div>
      </Section>
    );
  }
  if (samples.length === 0) return null;

  const referencedCount = samples.filter((a) =>
    referencedSet.has(a.filename.toLowerCase())
  ).length;

  return (
    <Section
      title={
        referencedCount > 0
          ? `Samples in project (${samples.length}, ${referencedCount} used)`
          : `Samples in project (${samples.length})`
      }
    >
      <div className={`${maxHeightClass} overflow-auto rounded border border-gray-700 bg-gray-800/40 p-2`}>
        <ul className="flex flex-col gap-1">
          {samples.map((asset) => {
            const isActive = current?.id === asset.id;
            const isActivePlaying = isActive && isPlaying;
            const used = referencedSet.has(asset.filename.toLowerCase());
            return (
              <li key={asset.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (isActive) {
                      isActivePlaying ? stop() : resume();
                      return;
                    }
                    audioEngine.playBuffer(asset.path, 0);
                    play(asset);
                  }}
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    isActivePlaying
                      ? 'border-stack-fire bg-stack-fire/20 text-stack-fire'
                      : 'border-gray-700 text-gray-300 hover:border-stack-fire/60 hover:text-stack-white'
                  }`}
                  title={isActivePlaying ? 'Stop' : 'Preview'}
                  aria-label={isActivePlaying ? 'Stop' : 'Preview'}
                >
                  {isActivePlaying ? (
                    <Pause size={10} color="currentColor" variant="Bold" />
                  ) : (
                    <Play size={10} color="currentColor" variant="Bold" />
                  )}
                </button>
                <span
                  className={`mono truncate text-[11px] ${
                    isActive ? 'text-stack-fire' : 'text-gray-300'
                  }`}
                  title={asset.path}
                >
                  {asset.filename}
                </span>
                {used && (
                  <span
                    className="mono shrink-0 rounded border border-stack-fire/40 bg-stack-fire/10 px-1 text-[9px] uppercase tracking-widest text-stack-fire"
                    title="Referenced by the project's FLP"
                  >
                    used
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="mono truncate text-right text-stack-white">{value}</span>
    </div>
  );
}

function List({ title, items, trimPath = false }: { title: string; items: string[]; trimPath?: boolean }) {
  return (
    <Section title={title}>
      <div className="max-h-44 overflow-auto rounded border border-gray-700 bg-gray-800/40 p-2">
        <ul className="mono flex flex-col gap-0.5 text-[11px] text-gray-300">
          {items.map((item, i) => {
            const value = trimPath ? basename(item) : item;
            return <li key={`${item}-${i}`} className="truncate" title={item}>{value}</li>;
          })}
        </ul>
      </div>
    </Section>
  );
}

function pickPrimaryProject(assets: Asset[], pathPrefix: string, title?: string): Asset | null {
  if (assets.length === 0) return null;
  const norm = pathPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const isAtRoot = (a: Asset) => {
    const p = a.path.replace(/\\/g, '/');
    return p.startsWith(`${norm}/`) && !p.slice(norm.length + 1).includes('/');
  };
  const rootAssets = assets.filter(isAtRoot);
  if (title) {
    const exact = rootAssets.find((a) => stem(a.filename).toLowerCase() === title.toLowerCase());
    if (exact) return exact;
  }
  const nonBackup = rootAssets.filter((a) => !BACKUP_HINT_RE.test(a.filename));
  if (nonBackup.length > 0) return nonBackup.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (rootAssets.length > 0) return rootAssets.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return assets.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function stem(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(0, i) : filename;
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, '/');
  return norm.slice(norm.lastIndexOf('/') + 1);
}

