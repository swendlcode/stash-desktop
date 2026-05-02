import { useState } from 'react';
import { editorEngine } from '../../services/editorEngine';
import { ArrowLeft2, ArrowRight2 } from '../ui/icons';

/**
 * Numeric stepper for playback tempo. When the asset has a BPM, the value
 * displayed is the effective BPM (assetBpm × rate); decrement / increment and
 * direct entry adjust the engine rate accordingly. Without an asset BPM, it
 * falls back to a raw speed stepper (0.25×..2×).
 */
export function BpmStepper({
  rate,
  assetBpm,
}: { rate: number; assetBpm: number | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const setRate = (r: number) => editorEngine.setRate(Math.max(0.25, Math.min(2, r)));
  const hasBpm = assetBpm != null && assetBpm > 0;
  const value = hasBpm ? Math.round(assetBpm! * rate) : Number(rate.toFixed(2));
  const label = hasBpm ? 'BPM' : 'Speed';
  const display = hasBpm ? String(value) : `${value.toFixed(2)}x`;

  const apply = (next: number) => {
    if (hasBpm) setRate(next / assetBpm!);
    else setRate(next);
  };
  const step = (delta: number) => apply(value + delta);
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n > 0) apply(n);
    setEditing(false);
  };

  const stepDown = (shift: boolean) => step(hasBpm ? (shift ? -5 : -1) : (shift ? -0.1 : -0.01));
  const stepUp = (shift: boolean) => step(hasBpm ? (shift ? 5 : 1) : (shift ? 0.1 : 0.01));

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-normal uppercase tracking-widest text-gray-500">{label}</span>
      <button
        onMouseDown={(e) => { e.preventDefault(); stepDown(e.shiftKey); }}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-stack-white"
        aria-label="Decrease"
      >
        <ArrowLeft2 size={12} color="currentColor" variant="Linear" />
      </button>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            else if (e.key === 'Escape') setEditing(false);
          }}
          className="mono h-6 w-16 rounded bg-gray-800 px-1 text-center text-sm text-stack-white outline-none ring-1 ring-stack-fire"
        />
      ) : (
        <button
          onClick={() => { setDraft(String(value)); setEditing(true); }}
          onDoubleClick={() => editorEngine.setRate(1)}
          className="mono h-6 w-16 rounded bg-gray-800 text-center text-sm font-medium text-stack-white hover:bg-gray-700"
          title="Click to type · double-click to reset"
        >
          {display}
        </button>
      )}
      <button
        onMouseDown={(e) => { e.preventDefault(); stepUp(e.shiftKey); }}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-800 hover:text-stack-white"
        aria-label="Increase"
      >
        <ArrowRight2 size={12} color="currentColor" variant="Linear" />
      </button>
      {hasBpm && (
        <span className="mono text-[10px] text-gray-500">{rate.toFixed(2)}x</span>
      )}
    </div>
  );
}
