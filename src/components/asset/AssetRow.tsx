import { useState, memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Asset } from "../../types";
import {
  Heart,
  HeartAdd,
  Play,
  Stop,
  Music,
  Cpu,
  DocumentText,
  Element3,
  More,
} from "../ui/icons";
import { Checkbox } from "../ui/Checkbox";
import { WaveformViewer } from "./WaveformViewer";
import { MidiViewer } from "./MidiViewer";
import { DawBadge } from "./DawBadge";
import { PackCover } from "./PackCover";
import { COL } from "./assetColumns";
import { usePlayerStore } from "../../stores/playerStore";
import { assetService } from "../../services/assetService";
import { projectService } from "../../services/projectService";
import { dragService } from "../../services/dragService";
import {
  formatDuration,
  formatBpm,
  formatKey,
  formatProjectDate,
} from "../../utils/formatters";
import { useQueryClient } from "@tanstack/react-query";
import { assetQueryKeys } from "../../hooks/useAssets";
import { usePacks } from "../../hooks/usePacks";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { useFilterStore } from "../../stores/filterStore";
import { useUiStore } from "../../stores/uiStore";
import { useSelectionStore } from "../../stores/selectionStore";
import { audioEngine } from "../../services/audioEngine";
import type { MidiMeta, ProjectMeta } from "../../types";

type ViewType = "sample" | "midi" | "preset" | "project" | "favorites";

interface AssetRowProps {
  asset: Asset;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isLast?: boolean;
  viewType?: ViewType;
  onPreview?: (asset: Asset) => void;
  onOpenDetail?: (asset: Asset) => void;
  onRowClick?: (e: React.MouseEvent) => void;
}

export const AssetRow = memo(function AssetRow({
  asset,
  isSelected = false,
  isMultiSelected = false,
  isLast = false,
  viewType = "sample",
  onPreview,
  onOpenDetail,
  onRowClick,
}: AssetRowProps) {
  // Tier 1: ref-stable fields every row needs. Shallow-compared so a
  // currentTime tick doesn't invalidate this selector for any row.
  const { current, isPlaying, play, stop, resume } = usePlayerStore(
    useShallow((s) => ({
      current: s.currentAsset,
      isPlaying: s.isPlaying,
      play: s.play,
      pause: s.pause,
      stop: s.stop,
      resume: s.resume,
    })),
  );

  const isActive = current?.id === asset.id;

  // Tier 2: time-tick fields only the active row subscribes to.
  // Non-active rows always see 0 here — no re-render on every 50ms tick.
  const currentTime = usePlayerStore((s) => (isActive ? s.currentTime : 0));
  const duration = usePlayerStore((s) => (isActive ? s.duration : 0));

  const qc = useQueryClient();
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const detailAssetId = useUiStore((s) => s.detailAssetId);
  const toggleDetail = useUiStore((s) => s.toggleDetail);
  const editorAssetId = useUiStore((s) => s.editorAssetId);
  const openEditor = useUiStore((s) => s.openEditor);
  const isDetailOpen = detailAssetId === asset.id;

  const { toggleId: toggleSelection } = useSelectionStore();
  // Only subscribe to whether *any* selection is active (for hover checkbox hint)
  // — avoids re-rendering every row on each selection change.
  const hasAnySelection = useSelectionStore((s) => s.selectedIds.size > 0);

  const [hovered, setHovered] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const isActivePlaying = isActive && isPlaying;
  const canPlay = asset.type !== "preset" && asset.type !== "project";
  const canOpenInDaw = asset.type === "project";

  // Progress comes straight from the store. The audio engine drives currentTime
  // via usePlayer's onTimeUpdate hook, so the store is always within ~50ms of
  // the engine — no need to poll the engine directly from each row.
  const progress =
    isActive && asset.type === "sample" && duration > 0
      ? Math.min(1, Math.max(0, currentTime / duration))
      : 0;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive) {
      isPlaying ? stop() : resume();
    } else {
      // Fire audio immediately like arrow keys do, before React state update
      const isEdited = editorAssetId !== null && asset.type === "sample";
      if (isEdited) {
        openEditor(asset.id);
      }
      if (asset.type === "sample" && !isEdited) {
        audioEngine.playBuffer(asset.path, 0);
      }
      play(asset);
      onPreview?.(asset);
    }
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const willBeFavorite = !asset.isFavorite;

    // Optimistically flip isFavorite on the asset in all cached lists
    qc.setQueriesData<{ assets: Asset[]; total: number } | undefined>(
      { queryKey: assetQueryKeys.all },
      (result) => {
        if (!result || !Array.isArray(result.assets)) return result;
        return {
          ...result,
          assets: result.assets.map((a) =>
            a.id === asset.id ? { ...a, isFavorite: willBeFavorite } : a,
          ),
        };
      },
    );

    // For favorites-only queries: remove the asset immediately and decrement total
    if (!willBeFavorite) {
      qc.setQueriesData<{ assets: Asset[]; total: number } | undefined>(
        {
          queryKey: assetQueryKeys.all,
          predicate: (query) => {
            // Query key shape: ['assets', 'search', filters, sort, limit, offset]
            const key = query.queryKey as unknown[];
            if (key[1] !== "search") return false;
            const filters = key[2] as Record<string, unknown> | undefined;
            return filters?.favoritesOnly === true;
          },
        },
        (result) => {
          if (!result || !Array.isArray(result.assets)) return result;
          const filtered = result.assets.filter((a) => a.id !== asset.id);
          if (filtered.length === result.assets.length) return result;
          return { assets: filtered, total: Math.max(0, result.total - 1) };
        },
      );
    }

    try {
      await assetService.toggleFavorite(asset.id);
    } finally {
      qc.invalidateQueries({ queryKey: assetQueryKeys.all });
    }
  };

  // Show the *project* folder's icon (its custom macOS Finder icon, or any
  // cover.* it has) on every file under it — not the file's immediate parent
  // directory, which usually has no artwork. Falls back to the parent dir if
  // we can't resolve the pack root yet (cache miss / asset has no packId).
  const { data: allPacks } = usePacks();
  const packRoot = (() => {
    if (asset.packId && allPacks) {
      const found = allPacks.find((p) => p.id === asset.packId);
      if (found?.rootPath) return found.rootPath;
    }
    if (!asset.path) return null;
    const parts = asset.path.replace(/\\/g, "/").split("/");
    parts.pop();
    return parts.join("/") || null;
  })();

  const goToFolder = () => {
    if (packRoot) {
      setPathPrefix(packRoot);
      setActivePage("browser");
    }
  };

  const categoryLabel =
    [asset.instrument, asset.subtype].filter(Boolean).join(" · ") || asset.type;
  const displayName =
    asset.type === "preset"
      ? asset.filename.replace(/\.[^.]+$/, "")
      : asset.filename;

  const Icon =
    asset.type === "midi"
      ? Cpu
      : asset.type === "preset"
        ? DocumentText
        : asset.type === "project"
          ? Element3
          : Music;

  const openInDaw = () => {
    projectService.openProject(asset).catch((err) => {
      console.error("Failed to open project in DAW:", err);
    });
  };

  const openProjectTimeline = () => {
    window.dispatchEvent(new CustomEvent("stack:open-project-timeline"));
  };

  const menuItems: ContextMenuItem[] = useMemo(() => [
    // ── Selection ──
    {
      label: isMultiSelected ? "Deselect" : "Select (add to bulk)",
      onSelect: () => toggleSelection(asset.id),
    },
    { label: "—", disabled: true, onSelect: () => {} },
    // ── Playback / Open ──
    ...(canPlay
      ? [
          {
            label: isActivePlaying ? "Stop" : isActive ? "Resume" : "Play",
            onSelect: () =>
              togglePlay({ stopPropagation: () => {} } as React.MouseEvent),
          },
        ]
      : []),
    ...(canOpenInDaw
      ? [
          {
            label: "Open in DAW",
            onSelect: openInDaw,
          },
        ]
      : []),
    // ── Discovery ──
    {
      label: "Find similar sounds",
      onSelect: () => useUiStore.getState().openDetail(asset.id),
      disabled: asset.type === "project",
    },
    // ── Favorites ──
    {
      label: asset.isFavorite ? "Remove from favorites" : "Add to favorites",
      onSelect: () =>
        toggleFav({ stopPropagation: () => {} } as React.MouseEvent),
    },
    // ── Separator ──
    { label: "—", disabled: true, onSelect: () => {} },
    // ── File operations ──
    {
      label: "Copy file path",
      onSelect: () => navigator.clipboard.writeText(asset.path).catch(() => {}),
    },
    {
      label: "Reveal in Finder",
      onSelect: () => revealItemInDir(asset.path).catch(() => {}),
    },
    {
      label: "Drag to DAW",
      onSelect: () =>
        dragService.startFileDrag([asset.path], { packRoot }).catch(() => {}),
    },
    // ── Navigation ──
    {
      label: "Go to pack folder",
      onSelect: goToFolder,
      disabled: !packRoot,
    },
    {
      label: "Open detail view",
      onSelect: () => onOpenDetail?.(asset),
      disabled: !onOpenDetail,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [asset.id, asset.isFavorite, asset.path, asset.type, isActive, isActivePlaying, isMultiSelected, packRoot, onOpenDetail]);

  const openMenuAt = (x: number, y: number) => {
    setMenu({ x, y });
  };

  return (
    <div
      className={`group flex items-center border-b border-gray-700/50 transition-colors ${
        isLast ? "border-b-transparent" : ""
      } ${
        isMultiSelected
          ? "bg-stack-fire/20 ring-1 ring-inset ring-stack-fire/30"
          : isActive
            ? "bg-stack-fire/10"
            : isSelected
              ? "bg-gray-700/40"
              : hovered
                ? "bg-gray-800/70"
                : ""
      }`}
      style={{ height: 64, paddingLeft: "12px", paddingRight: "12px" }}
      draggable
      onDragStart={(e) => {
        e.preventDefault();
        dragService.startFileDrag([asset.path], { packRoot }).catch((err) => {
          console.error("drag-out failed", err);
        });
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onRowClick}
      onDoubleClick={() => {
        if (asset.type === "project") {
          openProjectTimeline();
          return;
        }
        onOpenDetail?.(asset);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      }}
    >
      {/* ══ CHECKBOX: leftmost column, always present ══ */}
      <div
        className={`flex shrink-0 items-center justify-center mr-2 transition-opacity ${
          isMultiSelected || hasAnySelection
            ? "opacity-100"
            : "opacity-20 group-hover:opacity-100"
        }`}
        style={{ width: COL.checkbox }}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isMultiSelected}
          onChange={() => toggleSelection(asset.id)}
          aria-label={isMultiSelected ? "Deselect sample" : "Select sample"}
        />
      </div>

      {/* ══ LEFT: Artwork · Play · Filename/Category ══ */}
      <div
        className="flex min-w-0 flex-[0.85] items-center gap-2 sm:gap-3"
        style={{ minWidth: "200px" }}
      >
        {/* Artwork — clean, no overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToFolder();
          }}
          className="shrink-0 overflow-hidden rounded-md focus:outline-none focus:ring-1 focus:ring-stack-fire"
          title={`Go to ${asset.packName ?? "pack folder"}`}
          aria-label="Go to pack folder"
        >
          <PackCover packRoot={packRoot} packName={asset.packName} size={42} />
        </button>

        {/* Play / Open */}
        {canPlay ? (
          <button
            onClick={togglePlay}
            className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
              isActivePlaying
                ? "text-stack-fire"
                : hovered
                  ? "text-stack-white"
                  : "text-gray-400"
            }`}
            aria-label={isActivePlaying ? "Stop" : "Play"}
          >
            {isActivePlaying ? (
              <Stop size={14} variant="Linear" color="currentColor" />
            ) : (
              <Play size={14} variant="Linear" color="currentColor" />
            )}
          </button>
        ) : canOpenInDaw ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openProjectTimeline();
            }}
            className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
              hovered ? "text-stack-fire" : "text-gray-400"
            }`}
            aria-label="Open project timeline"
            title="Open project timeline"
          >
            <Element3 size={14} variant="Linear" color="currentColor" />
          </button>
        ) : (
          <div className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
        )}

        {/* Filename + category */}
        <div className="flex min-w-0 flex-col justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (asset.type === "project") {
                openProjectTimeline();
                return;
              }
              toggleDetail(asset.id);
            }}
            className={`truncate text-left text-xs sm:text-sm font-medium leading-tight hover:underline focus:underline focus:outline-none ${
              isDetailOpen
                ? "text-stack-fire"
                : isActive
                  ? "text-stack-fire"
                  : "text-stack-white"
            }`}
            title={
              asset.type === "project"
                ? "Open project timeline"
                : isDetailOpen
                  ? "Close details"
                  : "Show details"
            }
            aria-expanded={isDetailOpen}
          >
            {displayName}
          </button>
          <div className="truncate text-xs capitalize leading-tight text-gray-500 mt-0.5">
            {categoryLabel}
          </div>
        </div>
      </div>

      {/* ══ CENTRE: type-specific columns ══ */}
      <div className="flex min-w-0 flex-[1.15] items-center justify-center gap-1 sm:gap-3 px-2 sm:px-4">
        {viewType === "preset" ? (
          /* Presets: Plugin only */
          <div className="flex flex-1 items-center justify-end pr-2 text-xs sm:text-sm text-gray-300">
            {(() => {
              const synth = (asset.meta as { synth?: string } | undefined)
                ?.synth;
              if (synth)
                return <span className="text-stack-white">{synth}</span>;
              return <span className="text-gray-700">—</span>;
            })()}
          </div>
        ) : viewType === "project" ? (
          /* Projects: DAW + Date */
          <>
            <div className="flex flex-1 items-center justify-center gap-2">
              <DawBadge meta={asset.meta as ProjectMeta} />
            </div>
            <div
              className="mono shrink-0 text-right text-xs sm:text-sm text-gray-500"
              style={{ minWidth: "90px" }}
            >
              {formatProjectDate(asset.updatedAt)}
            </div>
          </>
        ) : (
          /* Samples / MIDI / Favorites: Waveform · Time · Key · BPM */
          <>
            <div
              className="hidden lg:flex flex-1 items-center min-w-0"
              style={{ minWidth: COL.waveMinW }}
            >
              {asset.type === "sample" ? (
                <WaveformViewer
                  assetId={asset.id}
                  height={36}
                  progress={progress}
                  onSeek={
                    isActive
                      ? (fraction) => {
                          const { seekTo, duration: d } =
                            usePlayerStore.getState();
                          if (seekTo && d > 0) seekTo(fraction * d);
                        }
                      : undefined
                  }
                />
              ) : asset.type === "midi" ? (
                <MidiViewer
                  notes={(asset.meta as MidiMeta)?.pianoRoll ?? []}
                  height={36}
                />
              ) : (
                <div className="flex h-9 w-full items-center justify-center rounded-lg bg-gray-800">
                  <Icon
                    size={18}
                    color="var(--color-text-muted)"
                    variant="Linear"
                  />
                </div>
              )}
            </div>

            <div
              className="mono shrink-0 text-right text-xs sm:text-sm text-gray-500"
              style={{ minWidth: "40px" }}
            >
              {formatDuration(asset.durationMs)}
            </div>

            <div
              className="mono shrink-0 text-center text-xs sm:text-sm"
              style={{ minWidth: "50px" }}
            >
              {asset.keyNote ? (
                <span className="text-stack-white font-medium">
                  {formatKey(asset.keyNote, asset.keyScale)}
                </span>
              ) : (
                <span className="text-gray-700">—</span>
              )}
            </div>

            <div
              className="mono shrink-0 text-center text-xs sm:text-sm"
              style={{ minWidth: "45px" }}
            >
              {asset.bpm != null ? (
                <span className="text-stack-white font-medium">
                  {formatBpm(asset.bpm)}
                </span>
              ) : (
                <span className="text-gray-700">—</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ RIGHT: Favorite · More ══ */}
      <div
        className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1"
        style={{ width: "auto", minWidth: "50px" }}
      >
        <button
          onClick={toggleFav}
          className={`shrink-0 rounded-lg p-1 sm:p-1.5 transition-colors ${
            asset.isFavorite
              ? "text-stack-fire"
              : "text-gray-600 hover:text-stack-white"
          }`}
          aria-label={asset.isFavorite ? "Unfavorite" : "Favorite"}
        >
          {asset.isFavorite ? (
            <HeartAdd size={16} variant="Bulk" color="currentColor" />
          ) : (
            <Heart size={16} variant="Linear" color="currentColor" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (
              e.currentTarget as HTMLButtonElement
            ).getBoundingClientRect();
            openMenuAt(rect.left, rect.bottom);
          }}
          className="hidden sm:flex shrink-0 rounded-lg p-1.5 text-gray-600 opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-700 hover:text-stack-white"
          aria-label="More options"
        >
          <More size={18} variant="Linear" color="currentColor" />
        </button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
});
