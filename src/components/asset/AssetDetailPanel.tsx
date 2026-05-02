import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { useAsset, useSimilar } from "../../hooks/useAssets";
import { useUiStore } from "../../stores/uiStore";
import { useShallow } from "zustand/react/shallow";
import {
  CloseCircle,
  FolderOpen,
  Copy,
  Music,
  Cpu,
  DocumentText,
  Edit2,
  MusicFilter,
  Play,
  Heart,
  HeartAdd,
  Stop,
} from "../ui/icons";
import { formatBpm, formatDuration, formatKey } from "../../utils/formatters";
import { usePlayerStore } from "../../stores/playerStore";
import { audioEngine } from "../../services/audioEngine";
import { assetService } from "../../services/assetService";
import { useQueryClient } from "@tanstack/react-query";
import { assetQueryKeys } from "../../hooks/useAssets";
import type { Asset, MidiMeta, PresetMeta, SampleMeta } from "../../types";

const PANEL_WIDTH = 340;

export function AssetDetailPanel() {
  const detailAssetId = useUiStore((s) => s.detailAssetId);
  const closeDetail = useUiStore((s) => s.closeDetail);
  const { data: asset, isFetched } = useAsset(detailAssetId);

  // Close the panel when the asset no longer exists in the DB
  // (isFetched guards against closing during the initial loading state)
  useEffect(() => {
    if (detailAssetId && isFetched && asset === null) {
      closeDetail();
    }
  }, [detailAssetId, isFetched, asset, closeDetail]);

  if (!detailAssetId) return null;

  return (
    <aside
      className="flex shrink-0 flex-col border-l border-gray-700/60 bg-stack-black"
      style={{ width: PANEL_WIDTH }}
      aria-label="Asset details"
    >
      <header className="flex items-center justify-between border-b border-gray-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Details
        </h2>
        <button
          onClick={closeDetail}
          className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-stack-white"
          aria-label="Close details"
        >
          <CloseCircle size={18} variant="Linear" color="currentColor" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!asset ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <DetailBody asset={asset} />
        )}
      </div>
    </aside>
  );
}

function DetailBody({ asset }: { asset: Asset }) {
  const Icon =
    asset.type === "midi"
      ? Cpu
      : asset.type === "preset"
        ? DocumentText
        : Music;
  const openEditor = useUiStore((s) => s.openEditor);
  const displayName =
    asset.type === "preset"
      ? asset.filename.replace(/\.[^.]+$/, "")
      : asset.filename;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-800">
          <Icon size={18} color="rgb(var(--stack-fire))" variant="Linear" />
        </div>
        <div className="min-w-0">
          <div
            className="break-words text-base font-semibold text-stack-white"
            title={displayName}
          >
            {displayName}
          </div>
          <div className="mt-1 text-xs capitalize text-gray-500">
            {asset.type}
            {asset.extension ? ` · ${asset.extension.toUpperCase()}` : ""}
          </div>
        </div>
      </div>

      {asset.type === "sample" && (
        <button
          onClick={() => openEditor(asset.id)}
          className="flex items-center justify-center gap-2 rounded-md border border-stack-fire/40 bg-stack-fire/10 px-3 py-2 text-sm font-semibold text-stack-fire hover:bg-stack-fire/20"
        >
          <Edit2 size={15} color="currentColor" variant="Linear" />
          Open in editor
        </button>
      )}

      <Section title="Overview">
        <Row
          label="BPM"
          value={asset.bpm != null ? formatBpm(asset.bpm) : "—"}
        />
        <Row
          label="Key"
          value={asset.keyNote ? formatKey(asset.keyNote, asset.keyScale) : "—"}
        />
        <Row label="Duration" value={formatDuration(asset.durationMs)} />
        <Row label="Instrument" value={asset.instrument ?? "—"} />
        <Row label="Subtype" value={asset.subtype ?? "—"} />
      </Section>

      {asset.type === "sample" && (
        <Section title="Audio">
          <Row
            label="Sample rate"
            value={
              asset.sampleRate
                ? `${(asset.sampleRate / 1000).toFixed(1)} kHz`
                : "—"
            }
          />
          <Row
            label="Channels"
            value={
              asset.channels === 1
                ? "Mono"
                : asset.channels === 2
                  ? "Stereo"
                  : asset.channels
                    ? String(asset.channels)
                    : "—"
            }
          />
          <Row
            label="Bit depth"
            value={
              (asset.meta as SampleMeta)?.bitDepth
                ? `${(asset.meta as SampleMeta).bitDepth}-bit`
                : "—"
            }
          />
          <Row label="BPM source" value={asset.bpmSource ?? "—"} />
          <Row label="Key source" value={asset.keySource ?? "—"} />
        </Section>
      )}

      {asset.type === "midi" && <MidiSection meta={asset.meta as MidiMeta} />}
      {asset.type === "preset" && (
        <PresetSection meta={asset.meta as PresetMeta} />
      )}

      <SimilarSoundsSection asset={asset} />

      <Section title="Library">
        <Row label="Pack" value={asset.packName ?? "—"} />
        <Row label="Favorite" value={asset.isFavorite ? "Yes" : "No"} />
        <Row label="Play count" value={String(asset.playCount)} />
        <Row
          label="Rating"
          value={asset.rating != null ? `${asset.rating}/5` : "—"}
        />
        <Row
          label="Tags"
          value={asset.userTags.length ? asset.userTags.join(", ") : "—"}
        />
      </Section>

      <Section title="File">
        <div
          className="break-all font-[DM_Mono] text-xs text-gray-400"
          title={asset.path}
        >
          {asset.path}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => revealItemInDir(asset.path).catch(() => {})}
            className="flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-stack-fire hover:text-stack-white"
          >
            <FolderOpen size={14} color="currentColor" variant="Linear" />
            Reveal
          </button>
          <button
            onClick={() =>
              navigator.clipboard.writeText(asset.path).catch(() => {})
            }
            className="flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-stack-fire hover:text-stack-white"
          >
            <Copy size={14} color="currentColor" variant="Linear" />
            Copy path
          </button>
        </div>
      </Section>
    </div>
  );
}

function MidiSection({ meta }: { meta: MidiMeta | undefined }) {
  if (!meta) return null;
  return (
    <Section title="MIDI">
      <Row label="Time signature" value={meta.timeSignature ?? "—"} />
      <Row
        label="Bars"
        value={meta.barCount != null ? String(meta.barCount) : "—"}
      />
      <Row
        label="Notes"
        value={meta.noteCount != null ? String(meta.noteCount) : "—"}
      />
      <Row
        label="Tracks"
        value={meta.tracks != null ? String(meta.tracks) : "—"}
      />
    </Section>
  );
}

function PresetSection({ meta }: { meta: PresetMeta | undefined }) {
  if (!meta) return null;
  return (
    <Section title="Preset">
      <Row label="Synth" value={meta.synth ?? "—"} />
      <Row label="Category" value={meta.category ?? "—"} />
      <Row
        label="Tags"
        value={meta.tags?.length ? meta.tags.join(", ") : "—"}
      />
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="truncate text-right text-stack-white" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Lists assets the backend scored as similar to `asset` (shared key / BPM / texture
 * / instrument / role). Each row plays inline and can be drilled into by clicking
 * its name, which swaps the detail panel to that asset.
 *
 * The list is keyed off `asset.id` — switching the detail panel to a similar item
 * automatically refetches its own neighbors. Empty results render a quiet empty state
 * rather than hiding the section, so the user understands the feature ran.
 */
function SimilarSoundsSection({ asset }: { asset: Asset }) {
  const { data: similar, isLoading } = useSimilar(asset.id, 12);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <MusicFilter size={13} variant="Linear" color="currentColor" />
        Similar Sounds
      </h3>
      {isLoading ? (
        <div className="text-xs text-gray-600">Searching…</div>
      ) : !similar || similar.length === 0 ? (
        <div className="text-xs text-gray-600">
          No close matches. Try indexing more samples with shared
          key/BPM/instrument.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-gray-800/60 overflow-hidden rounded-md border border-gray-800/60">
          {similar.map((s) => (
            <SimilarRow key={s.id} asset={s} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Compact one-line entry. Click play to audition (uses the same audioEngine
 * + playerStore as AssetGrid so the persistent PlayerBar reflects state).
 * Click the name to swap detail panel focus to this asset; click the heart to
 * favorite/unfavorite optimistically.
 */
function SimilarRow({ asset }: { asset: Asset }) {
  const setDetail = useUiStore((s) => s.openDetail);
  const qc = useQueryClient();
  const { current, isPlaying, play, pause, resume } = usePlayerStore(
    useShallow((s) => ({
      current: s.currentAsset,
      isPlaying: s.isPlaying,
      play: s.play,
      pause: s.pause,
      resume: s.resume,
    })),
  );
  const isActive = current?.id === asset.id;
  const isActivePlaying = isActive && isPlaying;
  const canPlay = asset.type === "sample";

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canPlay) return;
    if (isActive) {
      isPlaying ? pause() : resume();
    } else {
      audioEngine.playBuffer(asset.path, 0);
      play(asset);
    }
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const willBeFavorite = !asset.isFavorite;
    qc.setQueryData<Asset | null | undefined>(
      assetQueryKeys.byId(asset.id),
      (prev) => (prev ? { ...prev, isFavorite: willBeFavorite } : prev),
    );
    try {
      await assetService.toggleFavorite(asset.id);
    } finally {
      qc.invalidateQueries({ queryKey: assetQueryKeys.byId(asset.id) });
    }
  };

  const drillIn = () => setDetail(asset.id);

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 text-xs transition-colors ${
        isActive ? "bg-stack-fire/10" : "hover:bg-gray-800/60"
      }`}
    >
      <button
        onClick={togglePlay}
        disabled={!canPlay}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
          canPlay
            ? isActivePlaying
              ? "text-stack-fire"
              : "text-gray-400 hover:text-stack-white"
            : "text-gray-700"
        }`}
        aria-label={isActivePlaying ? "Pause" : "Play"}
      >
        {isActivePlaying ? (
          <Stop size={12} variant="Linear" color="currentColor" />
        ) : (
          <Play size={12} variant="Linear" color="currentColor" />
        )}
      </button>

      <button
        onClick={drillIn}
        className={`min-w-0 flex-1 truncate text-left hover:underline ${
          isActive ? "text-stack-fire" : "text-stack-white"
        }`}
        title={asset.filename}
      >
        {asset.filename}
      </button>

      <span className="mono shrink-0 text-gray-500" style={{ minWidth: 28 }}>
        {asset.bpm != null ? formatBpm(asset.bpm) : "—"}
      </span>
      <span className="mono shrink-0 text-gray-500" style={{ minWidth: 28 }}>
        {asset.keyNote ? formatKey(asset.keyNote, asset.keyScale) : "—"}
      </span>

      <button
        onClick={toggleFav}
        className={`shrink-0 rounded p-0.5 transition-colors ${
          asset.isFavorite
            ? "text-stack-fire"
            : "text-gray-600 hover:text-stack-white"
        }`}
        aria-label={asset.isFavorite ? "Unfavorite" : "Favorite"}
      >
        {asset.isFavorite ? (
          <HeartAdd size={12} variant="Bulk" color="currentColor" />
        ) : (
          <Heart size={12} variant="Linear" color="currentColor" />
        )}
      </button>
    </div>
  );
}
