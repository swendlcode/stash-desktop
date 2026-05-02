import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { usePlayerStore } from "../../stores/playerStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayer } from "../../hooks/usePlayer";
import { VolumeControl } from "./VolumeControl";
import { PackCover } from "../asset/PackCover";
import {
  Play,
  Stop,
  Previous,
  Next,
  Copy,
  CopySuccess,
  Edit2,
} from "../ui/icons";
import { formatKey, formatBpm } from "../../utils/formatters";
import { audioEngine } from "../../services/audioEngine";
import { assetService } from "../../services/assetService";

export function PlayerBar() {
  usePlayer();

  const currentAsset = usePlayerStore((s) => s.currentAsset);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const resume = usePlayerStore((s) => s.resume);
  const stop = usePlayerStore((s) => s.stop);
  const playlist = usePlayerStore((s) => s.playlist);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const openEditor = useUiStore((s) => s.openEditor);
  const editorOpen = useUiStore((s) => s.editorAssetId !== null);

  const [copied, setCopied] = useState(false);

  // Validate current asset still exists when database changes
  useEffect(() => {
    if (!currentAsset) return;

    const validateAsset = async () => {
      try {
        // Check if the current asset still exists in the database
        const exists = await assetService.assetExists(currentAsset.id);
        if (!exists) {
          // Asset was deleted - stop playback and clear current asset
          console.log("Current asset no longer exists, stopping playback");
          stop();
        }
      } catch (error) {
        // If we can't validate, assume it's gone and stop playback
        console.warn(
          "Failed to validate current asset, stopping playback:",
          error,
        );
        stop();
      }
    };

    validateAsset();
  }, [currentAsset, stop]);

  // Listen for library changes that might affect the current playlist
  useEffect(() => {
    const handleLibraryChange = async () => {
      // When library changes, validate the current asset
      if (currentAsset) {
        const exists = await assetService
          .assetExists(currentAsset.id)
          .catch(() => false);
        if (!exists) {
          console.log(
            "Current asset no longer exists after library change, stopping playback",
          );
          stop();
        }
      }
    };

    const handleFolderDeleted = async () => {
      // Clear audio engine cache when folders are deleted
      audioEngine.clearCache();

      // Clear the entire playlist since folder deletion likely invalidates it
      // The playlist will be repopulated when user navigates to a page with AssetGrid
      console.log("Folder deleted: clearing playlist to prevent stale data");
      setPlaylist([]);

      await handleLibraryChange();
    };

    // Listen for the same events that useLibrarySync listens to
    const unsubscribePromises: Array<Promise<() => void>> = [];

    unsubscribePromises.push(
      listen("stack://reconcile-complete", handleLibraryChange),
    );

    unsubscribePromises.push(
      listen("stack://asset-indexed", handleLibraryChange),
    );

    // Use special handler for pack/folder deletion that clears audio cache and playlist
    unsubscribePromises.push(
      listen("stack://pack-deleted", handleFolderDeleted),
    );

    return () => {
      Promise.all(unsubscribePromises).then((unsubscribeFns) => {
        unsubscribeFns.forEach((fn) => fn());
      });
    };
  }, [currentAsset, stop, setPlaylist]);

  const disabled = !currentAsset;
  const canEdit = currentAsset?.type === "sample";

  // ── Drag-to-expand Editor logic ──
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editorOpen || !canEdit) return;
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startHRef.current = 0;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [editorOpen, canEdit],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;

      const uiState = useUiStore.getState();
      const playerState = usePlayerStore.getState();
      const isEditorOpen = uiState.editorAssetId !== null;

      const newHeight = startHRef.current + (startYRef.current - e.clientY);

      if (newHeight > 10) {
        if (!isEditorOpen && playerState.currentAsset) {
          uiState.openEditor(playerState.currentAsset.id);
          uiState.setEditorHeight(280); // Snap to default height
          draggingRef.current = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        } else if (isEditorOpen) {
          uiState.setEditorHeight(newHeight);
        }
      } else if (newHeight < 10 && isEditorOpen) {
        uiState.closeEditor();
      }
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      useUiStore.getState().snapEditorHeight();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Derive pack root for cover art
  const packRoot = currentAsset?.path
    ? (() => {
        const parts = currentAsset.path.replace(/\\/g, "/").split("/");
        parts.pop();
        return parts.join("/") || null;
      })()
    : null;

  // Can we go prev/next?
  const currentIdx = currentAsset
    ? playlist.findIndex((a) => a.id === currentAsset.id)
    : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < playlist.length - 1;

  const handlePlayNext = () => {
    const { currentAsset, playlist, play } = usePlayerStore.getState();
    if (!playlist.length) return;
    const idx = currentAsset
      ? playlist.findIndex((a) => a.id === currentAsset.id)
      : -1;
    const next = playlist[idx + 1];
    if (next) {
      // Check if we're already playing this exact track to avoid double-play
      if (audioEngine.isPlayingPath(next.path)) {
        return;
      }

      // Fire audio immediately FIRST like arrow keys do - before React state update
      if (next.type === "sample") {
        audioEngine.playBuffer(next.path, 0);
      }
      // React state update happens AFTER audio starts - use play(asset) like arrow keys
      play(next);
      // Prefetch neighbours so they're ready - exactly like arrow keys
      audioEngine.prefetchAround(playlist, idx + 1);
    }
  };

  const handlePlayPrev = () => {
    const { currentAsset, playlist, currentTime, seekTo, play } =
      usePlayerStore.getState();
    if (!playlist.length) return;
    // If more than 3 seconds in, restart current track instead of going back
    if (currentTime > 3 && seekTo) {
      seekTo(0);
      return;
    }
    const idx = currentAsset
      ? playlist.findIndex((a) => a.id === currentAsset.id)
      : 1;
    const prev = playlist[idx - 1];
    if (prev) {
      // Check if we're already playing this exact track to avoid double-play
      if (audioEngine.isPlayingPath(prev.path)) {
        return;
      }

      // Fire audio immediately FIRST like arrow keys do - before React state update
      if (prev.type === "sample") {
        audioEngine.playBuffer(prev.path, 0);
      }
      // React state update happens AFTER audio starts - use play(asset) like arrow keys
      play(prev);
      // Prefetch neighbours so they're ready - exactly like arrow keys
      audioEngine.prefetchAround(playlist, idx - 1);
    }
  };

  const handleCopy = async () => {
    if (!currentAsset) return;
    try {
      await navigator.clipboard.writeText(currentAsset.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  // Friendly type label
  const typeLabel = currentAsset
    ? currentAsset.instrument
      ? `${currentAsset.instrument}${currentAsset.subtype ? ` · ${currentAsset.subtype}` : ""}`
      : currentAsset.type
    : null;
  const displayName = currentAsset
    ? currentAsset.type === "preset"
      ? currentAsset.filename.replace(/\.[^.]+$/, "")
      : currentAsset.filename
    : "Nothing playing";

  // Show different text when in editor mode
  const playerDisplayName =
    editorOpen && currentAsset ? `${displayName} (editing)` : displayName;
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <div className="relative flex h-16 shrink-0 items-center border-t border-gray-700 bg-gray-900 px-4 gap-4">
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gray-700" />

      {/* ── DRAG HANDLE TO OPEN EDITOR ── */}
      {!editorOpen && canEdit && (
        <div
          onMouseDown={onMouseDown}
          className="absolute left-0 right-0 top-0 z-10 h-1.5 -translate-y-1/2 cursor-row-resize transition-colors hover:bg-stack-fire/40 active:bg-stack-fire/60"
          title="Drag up to open Editor"
        />
      )}

      <div
        className="pointer-events-none absolute left-0 top-0 h-px bg-stack-fire transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />

      {/* ── LEFT: Prev / Play / Next ── */}
      {!editorOpen && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handlePlayPrev}
            disabled={disabled || !hasPrev}
            className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:text-stack-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            aria-label="Previous"
          >
            <Previous size={16} color="currentColor" variant="Linear" />
          </button>

          <button
            onClick={() => (isPlaying ? stop() : resume())}
            disabled={disabled}
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors disabled:opacity-30 ${
              isPlaying
                ? "text-stack-fire"
                : "text-gray-400 hover:text-stack-white"
            }`}
            aria-label={isPlaying ? "Stop" : "Play"}
          >
            {isPlaying ? (
              <Stop size={16} variant="Linear" color="currentColor" />
            ) : (
              <Play size={16} variant="Linear" color="currentColor" />
            )}
          </button>

          <button
            onClick={handlePlayNext}
            disabled={disabled || !hasNext}
            className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:text-stack-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            aria-label="Next"
          >
            <Next size={16} color="currentColor" variant="Linear" />
          </button>

          <button
            onClick={() => {
              if (currentAsset) openEditor(currentAsset.id);
            }}
            disabled={!canEdit}
            className={`ml-1 flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${editorOpen ? "bg-stack-fire/15 text-stack-fire" : canEdit ? "text-gray-300 hover:bg-gray-800 hover:text-stack-white" : "text-gray-600"}`}
            aria-label="Edit sample"
            title={
              canEdit
                ? "Open sample editor"
                : "Select a sample to enable the editor"
            }
          >
            <Edit2
              size={15}
              color="currentColor"
              variant={editorOpen ? "Bulk" : "Linear"}
            />
            Edit
          </button>
        </div>
      )}

      {/* ── CENTRE-LEFT: Artwork + name + type ── */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="shrink-0">
          <PackCover
            packRoot={packRoot}
            packName={currentAsset?.packName ?? null}
            size={36}
          />
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-stack-white leading-tight">
            {playerDisplayName}
          </span>
          {typeLabel && (
            <span className="truncate text-xs text-gray-500 leading-tight capitalize">
              {editorOpen ? "Sample Editor" : typeLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── CENTRE: Key | BPM ── */}
      {currentAsset && (
        <div className="flex items-center gap-px shrink-0">
          {/* Key */}
          <div className="flex flex-col items-center px-4 border-r border-gray-700">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 leading-none mb-1">
              Key
            </span>
            <span className="mono text-sm font-medium text-stack-white leading-none">
              {currentAsset.keyNote ? (
                formatKey(currentAsset.keyNote, currentAsset.keyScale)
              ) : (
                <span className="text-gray-600">—</span>
              )}
            </span>
          </div>

          {/* BPM */}
          <div className="flex flex-col items-center px-4">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 leading-none mb-1">
              BPM
            </span>
            <span className="mono text-sm font-medium text-stack-white leading-none">
              {currentAsset.bpm != null ? (
                formatBpm(currentAsset.bpm)
              ) : (
                <span className="text-gray-600">—</span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── RIGHT: Copy + Volume ── */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleCopy}
          disabled={disabled}
          title={copied ? "Copied!" : "Copy file path"}
          className={`flex h-8 w-8 items-center justify-center rounded transition-colors disabled:opacity-30 ${
            copied
              ? "text-stack-fire"
              : "text-gray-400 hover:text-stack-white hover:bg-gray-700"
          }`}
          aria-label="Copy file path"
        >
          {copied ? (
            <CopySuccess size={16} color="currentColor" variant="Bold" />
          ) : (
            <Copy size={16} color="currentColor" variant="Linear" />
          )}
        </button>

        <VolumeControl />
      </div>
    </div>
  );
}
