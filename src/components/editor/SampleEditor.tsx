import { useEffect, useRef, useState, useCallback } from "react";
import { useUiStore } from "../../stores/uiStore";
import { useEditorStore } from "../../stores/editorStore";
import { useAsset } from "../../hooks/useAssets";
import { useEditorEngine } from "../../hooks/useEditorEngine";
import { editorEngine } from "../../services/editorEngine";
import { assetService } from "../../services/assetService";
import { dragService } from "../../services/dragService";
import { encodeWav } from "../../services/wavEncoder";
import { usePlayerStore } from "../../stores/playerStore";
import { EditorWaveform } from "./EditorWaveform";
import { EditorControls } from "./EditorControls";
import { EditorDock } from "./EditorDock";
import { CloseCircle } from "../ui/icons";
import { formatDuration, formatBpm, formatKey } from "../../utils/formatters";

export function SampleEditor() {
  const editorAssetId = useUiStore((s) => s.editorAssetId);
  const closeEditor = useUiStore((s) => s.closeEditor);
  const { data: asset } = useAsset(editorAssetId);
  const { currentTime, duration, reversed } = useEditorEngine();
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const [dragging, setDragging] = useState(false);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const lastAutoPlayedIdRef = useRef<string | null>(null);
  const resetEditorStore = useEditorStore((s) => s.reset);

  // Recompute displayed samples whenever the work buffer changes (reverse/normalize)
  const refreshSamples = useCallback(() => {
    const buf = editorEngine.workBuffer;
    if (buf) setSamples(downmixToMono(buf));
  }, []);

  // Stop main playback + load sample into the editor engine when opened.
  // Every sample open starts from defaults — prior edits never leak across.
  useEffect(() => {
    if (!editorAssetId || !asset) return;
    if (asset.type !== "sample") return;
    usePlayerStore.getState().pause();
    resetEditorStore();
    setSamples(null);
    editorEngine
      .load(asset.path)
      .then((ok) => {
        if (!ok) return;
        editorEngine.resetEdits();
        refreshSamples();
        // Editor-open workflow: whenever sample selection changes (arrow/click in table),
        // auto-preview once in editor so navigation always has audible feedback.
        if (lastAutoPlayedIdRef.current !== asset.id) {
          lastAutoPlayedIdRef.current = asset.id;
          usePlayerStore.getState().play(asset);
        }

        if (usePlayerStore.getState().isPlaying && !editorEngine.playing) {
          editorEngine.play();
        }
      })
      .catch(() => {});
    return () => {
      editorEngine.unload();
    };
  }, [editorAssetId, asset, resetEditorStore, refreshSamples]);

  // Re-derive displayed samples whenever reverse/normalize changes the work buffer
  useEffect(() => {
    refreshSamples();
  }, [reversed, refreshSamples]);

  // Fetch/derive waveform peaks for display
  useEffect(() => {
    if (!asset) return;
    if (asset.waveformData && asset.waveformData.length) {
      setPeaks(asset.waveformData);
      return;
    }
    assetService
      .getWaveform(asset.id)
      .then((w) => setPeaks(w ?? null))
      .catch(() => setPeaks(null));
  }, [asset]);

  // Keep editor engine in sync with the global play state
  useEffect(() => {
    if (!asset || asset.id !== editorAssetId) return;

    const unsub = editorEngine.subscribe(() => {
      const state = usePlayerStore.getState();
      if (
        !editorEngine.playing &&
        state.isPlaying &&
        state.currentAsset?.id === asset.id
      ) {
        state.pause();
      }
    });

    if (isPlaying && !editorEngine.playing) {
      editorEngine.play();
    } else if (!isPlaying && editorEngine.playing) {
      editorEngine.pause();
    }

    return unsub;
  }, [isPlaying, asset, editorAssetId]);

  // Keyboard: Esc to close, Space to toggle play, Delete to cut selected region
  useEffect(() => {
    if (!editorAssetId) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when focus is inside an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const currentAsset = asset;
      if (!currentAsset) return;

      if (e.key === "Escape") {
        e.preventDefault();
        closeEditor();
      } else if (e.key === " ") {
        e.preventDefault();
        const { isPlaying, play, stop } = usePlayerStore.getState();
        isPlaying ? stop() : play(currentAsset);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Delete the loop-selected region and merge the surrounding audio
        const { loopOn, loopStart, loopEnd } = editorEngine;
        if (!loopOn || loopEnd <= loopStart) return;
        e.preventDefault();
        editorEngine.deleteRegion(loopStart, loopEnd);
        // Refresh the waveform display from the new work buffer
        const buf = editorEngine.workBuffer;
        if (buf) setSamples(downmixToMono(buf));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorAssetId, closeEditor, asset]);

  if (!editorAssetId || !asset) return null;

  if (asset.type !== "sample") {
    return (
      <EditorDock>
        <div className="px-4 py-6 text-sm text-gray-400">
          The editor only supports audio samples. Selected: <b>{asset.type}</b>.
        </div>
      </EditorDock>
    );
  }

  const displayName = asset.filename;

  return (
    <EditorDock>
      <header className="flex items-center justify-between border-b border-gray-700/60 px-4 py-2">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2
            className="truncate text-sm font-medium text-stack-white"
            title={displayName}
          >
            {displayName}
          </h2>
          <span className="mono text-xs text-gray-500">
            {formatDuration(asset.durationMs ?? null)}
            {asset.bpm != null ? ` · ${formatBpm(asset.bpm)} BPM` : ""}
            {asset.keyNote
              ? ` · ${formatKey(asset.keyNote, asset.keyScale)}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono text-[11px] text-gray-500">
            {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
          </span>
          <span className="text-[10px] text-gray-600 hidden lg:inline">
            Click: seek · Shift-drag: loop · Del: cut region · Right-click:
            tools · ⌘/Ctrl-scroll: zoom
          </span>
          <button
            onClick={closeEditor}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-stack-white"
            aria-label="Close editor"
            title="Close (Esc)"
          >
            <CloseCircle size={18} color="currentColor" variant="Linear" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 px-4 pb-1 pt-2">
        <EditorWaveform
          samples={samples}
          peaks={peaks}
          bpm={asset.bpm ?? null}
        />
      </div>

      <EditorControls
        assetBpm={asset.bpm ?? null}
        onDragExport={async (e) => {
          e.preventDefault();
          if (dragging) return;
          setDragging(true);
          try {
            const rendered = await editorEngine.renderEdit();
            if (!rendered) return;
            const bytes = encodeWav(rendered);
            const base = asset.filename.replace(/\.[^.]+$/, "");
            await dragService.startExportDrag(`${base} (edit).wav`, bytes);
          } finally {
            setDragging(false);
          }
        }}
        dragging={dragging}
      />
    </EditorDock>
  );
}

function downmixToMono(buf: AudioBuffer): Float32Array {
  const ch = buf.numberOfChannels;
  if (ch === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(buf.length);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ch; c++) channels.push(buf.getChannelData(c));
  for (let i = 0; i < buf.length; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += channels[c][i];
    out[i] = s / ch;
  }
  return out;
}
