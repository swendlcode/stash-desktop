import { editorEngine } from "../../services/editorEngine";
import { useEditorEngine } from "../../hooks/useEditorEngine";
import { usePlayerStore } from "../../stores/playerStore";
import { useEditorStore } from "../../stores/editorStore";
import { Knob } from "../ui/Knob";
import { BpmStepper } from "./BpmStepper";
import {
  Play,
  Repeat,
  RepeateOne,
  SearchZoomIn,
  SearchZoomOut,
  Sound,
  Stop,
} from "../ui/icons";

interface Props {
  assetBpm: number | null;
  onDragExport: (e: React.DragEvent) => void;
  dragging: boolean;
}

export function EditorControls({ assetBpm, onDragExport, dragging }: Props) {
  const s = useEditorEngine();
  const zoom = useEditorStore((z) => z.zoom);
  const setZoom = useEditorStore((z) => z.setZoom);
  const resetView = useEditorStore((z) => z.resetView);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-gray-700/60 bg-gray-900 px-4 py-2.5">
      {/* ── Primary Playback Controls ── */}
      <div className="flex items-center gap-1">
        <IconButton
          label={isPlaying ? "Pause" : "Play"}
          active={isPlaying}
          onClick={() => (isPlaying ? pause() : resume())}
          primary={true}
        >
          {isPlaying ? (
            <Stop size={16} color="currentColor" variant="Linear" />
          ) : (
            <Play size={16} color="currentColor" variant="Linear" />
          )}
        </IconButton>
        <IconButton
          label={s.loopOn ? "Loop on" : "Loop off"}
          active={s.loopOn}
          onClick={() => editorEngine.setLoop(!s.loopOn)}
        >
          {s.loopOn ? (
            <RepeateOne size={16} color="currentColor" variant="Bulk" />
          ) : (
            <Repeat size={16} color="currentColor" variant="Linear" />
          )}
        </IconButton>
      </div>

      <Divider />

      <BpmStepper rate={s.rate} assetBpm={assetBpm} />

      <Divider />

      {/* ── Destructive Tools ── */}
      <div className="flex items-center gap-1">
        <ToolButton
          label={s.reversed ? "Un-reverse" : "Reverse"}
          active={s.reversed}
          onClick={() => editorEngine.reverse()}
          title={
            s.reversed
              ? "Playing reversed — click to restore"
              : "Reverse sample"
          }
        >
          <span className="text-[10px] font-semibold tracking-tight">REV</span>
        </ToolButton>
        <ToolButton
          label="Normalize"
          active={false}
          onClick={() => editorEngine.normalize()}
          title="Normalize peak to 0 dBFS"
        >
          <span className="text-[10px] font-semibold tracking-tight">NRM</span>
        </ToolButton>
      </div>

      <Divider />

      <Knob
        label="Pitch"
        value={pitchToKnob(s.pitchSemitones)}
        defaultValue={0.5}
        valueText={formatSemitones(s.pitchSemitones)}
        onChange={(v) => editorEngine.setPitch(knobToPitch(v))}
      />
      <Knob
        label="HF"
        value={hzToKnob(s.highCutHz)}
        defaultValue={1}
        valueText={formatHz(s.highCutHz)}
        onChange={(v) => editorEngine.setHighCut(knobToHz(v))}
      />
      <Knob
        label="LF"
        value={hzToKnob(s.lowCutHz)}
        defaultValue={0}
        valueText={formatHz(s.lowCutHz)}
        onChange={(v) => editorEngine.setLowCut(knobToHz(v))}
      />
      <Knob
        label="Gain"
        value={dbToKnob(gainToDb(s.volume))}
        defaultValue={dbToKnob(0)}
        valueText={formatDb(gainToDb(s.volume))}
        onChange={(v) => editorEngine.setVolume(dbToGain(knobToDb(v)))}
      />

      <Divider />

      <div className="flex items-center gap-1">
        <IconButton label="Zoom out" onClick={() => setZoom(zoom / 1.5)}>
          <SearchZoomOut size={16} color="currentColor" variant="Linear" />
        </IconButton>
        <span className="mono w-10 text-center text-xs text-gray-400">
          {zoom.toFixed(1)}x
        </span>
        <IconButton label="Zoom in" onClick={() => setZoom(zoom * 1.5)}>
          <SearchZoomIn size={16} color="currentColor" variant="Linear" />
        </IconButton>
        <button
          onClick={resetView}
          className="ml-1 rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:border-stack-fire hover:text-stack-white"
        >
          Fit
        </button>
      </div>

      <div className="ml-auto">
        <div
          draggable
          onDragStart={onDragExport}
          aria-label="Drag edit to DAW"
          title="Drag this out to your DAW — exports a WAV with filters, speed and loop trim applied"
          className={`flex cursor-grab select-none items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:cursor-grabbing ${
            dragging
              ? "border-stack-fire bg-stack-fire/20 text-stack-fire"
              : "border-stack-fire/40 bg-stack-fire/10 text-stack-fire hover:bg-stack-fire/20"
          }`}
        >
          <Sound size={14} color="currentColor" variant="Bulk" />
          {dragging ? "Rendering…" : "Drag to DAW"}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  active = false,
  primary = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex items-center justify-center rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        primary
          ? `h-9 w-9 ${active ? "bg-stack-fire/20 text-stack-fire" : "text-gray-300 hover:bg-gray-800 hover:text-stack-white"}`
          : `h-8 w-8 ${active ? "bg-stack-fire/15 text-stack-fire" : "text-gray-400 hover:bg-gray-800 hover:text-stack-white"}`
      }`}
    >
      {children}
    </button>
  );
}

/** Compact text-label tool button (REV, NRM, etc.) */
function ToolButton({
  children,
  onClick,
  label,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`flex h-7 min-w-[2.75rem] items-center justify-center rounded border px-1.5 transition-colors ${
        active
          ? "border-stack-fire bg-stack-fire/20 text-stack-fire"
          : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-stack-white"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="h-6 w-px bg-gray-700/60" />;
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`;
  return `${Math.round(hz)} Hz`;
}
const MIN_HZ = 20;
const MAX_HZ = 22050;
function hzToKnob(hz: number): number {
  const c = Math.max(MIN_HZ, Math.min(MAX_HZ, hz));
  return (
    (Math.log(c) - Math.log(MIN_HZ)) / (Math.log(MAX_HZ) - Math.log(MIN_HZ))
  );
}
function knobToHz(v: number): number {
  return Math.exp(Math.log(MIN_HZ) + v * (Math.log(MAX_HZ) - Math.log(MIN_HZ)));
}

// ── Pitch / semitones ────────────────────────────────────────────────────────
const PITCH_MIN = -24;
const PITCH_MAX = 24;
/** Map semitones → 0..1 knob value (centre = 0 st). */
function pitchToKnob(st: number): number {
  return (
    (Math.max(PITCH_MIN, Math.min(PITCH_MAX, st)) - PITCH_MIN) /
    (PITCH_MAX - PITCH_MIN)
  );
}
/** Map 0..1 knob value → semitones, snapped to integers. */
function knobToPitch(v: number): number {
  return Math.round(PITCH_MIN + v * (PITCH_MAX - PITCH_MIN));
}
function formatSemitones(st: number): string {
  if (st === 0) return "0 st";
  return `${st > 0 ? "+" : ""}${st} st`;
}

// ── Gain / dB ───────────────────────────────────────────────────────────────
const DB_MIN = -60;
const DB_MAX = 6;
function knobToDb(v: number): number {
  return DB_MIN + v * (DB_MAX - DB_MIN);
}
function dbToKnob(db: number): number {
  return Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)));
}
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
function gainToDb(g: number): number {
  if (g <= 0.001) return DB_MIN;
  return 20 * Math.log10(g);
}
function formatDb(db: number): string {
  if (db <= DB_MIN + 0.5) return "-∞ dB";
  return `${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`;
}
