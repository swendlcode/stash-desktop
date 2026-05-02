import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseCircle, Tag, Add, Trash } from '../ui/icons';
import type { Asset } from '../../types';

// Common instrument categories for quick-pick
const INSTRUMENT_PRESETS = [
  'Drums',
  'Bass',
  'Keys',
  'Guitar',
  'Synth',
  'Vocals',
  'FX',
  'Strings',
  'Brass',
  'Percussion',
  'Pad',
  'Lead',
  'Pluck',
  'Arp',
];

// Common subtype labels
const SUBTYPE_PRESETS = [
  'Loop',
  'One-shot',
  'Fill',
  'Break',
  'Riser',
  'Downlifter',
  'Transition',
  'Texture',
  'Atmosphere',
  'Hit',
  'Stab',
  'Chord',
  'Melody',
  'Groove',
];

export type BulkModalMode = 'add-tag' | 'remove-tag' | 'set-type';

interface BulkTagModalProps {
  mode: BulkModalMode;
  selectedAssets: Asset[];
  onConfirm: (payload: BulkModalPayload) => void;
  onClose: () => void;
}

export interface BulkModalPayload {
  mode: BulkModalMode;
  tag?: string;
  instrument?: string | null;
  subtype?: string | null;
}

export function BulkTagModal({
  mode,
  selectedAssets,
  onConfirm,
  onClose,
}: BulkTagModalProps) {
  const [tagInput, setTagInput] = useState('');
  const [instrument, setInstrument] = useState('');
  const [subtype, setSubtype] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Collect all existing user tags across selected assets for remove-tag suggestions
  const existingTags = Array.from(
    new Set(
      selectedAssets
        .flatMap((a) => a.userTags)
        .filter((t) => !t.startsWith('__')),
    ),
  ).sort();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Focus the first input after mount
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'set-type') {
      onConfirm({
        mode,
        instrument: instrument.trim() || null,
        subtype: subtype.trim() || null,
      });
    } else {
      const tag = tagInput.trim();
      if (!tag) return;
      onConfirm({ mode, tag });
    }
  };

  const title =
    mode === 'add-tag'
      ? 'Add Tag'
      : mode === 'remove-tag'
        ? 'Remove Tag'
        : 'Set Type';

  const count = selectedAssets.length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-[min(480px,94vw)] overflow-hidden rounded-xl border border-gray-700 bg-stack-black shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-700/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {mode === 'set-type' ? (
              <Tag size={16} color="var(--color-stack-fire)" variant="Bulk" />
            ) : mode === 'add-tag' ? (
              <Add size={16} color="var(--color-stack-fire)" variant="Linear" />
            ) : (
              <Trash size={16} color="var(--color-stack-fire)" variant="Linear" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-stack-white">{title}</h2>
              <p className="text-[11px] text-gray-500">
                {count} sample{count !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-stack-white"
            aria-label="Close"
          >
            <CloseCircle size={18} color="currentColor" variant="Linear" />
          </button>
        </header>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {mode === 'set-type' ? (
            <>
              {/* Instrument */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">
                  Instrument
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value)}
                  placeholder="e.g. Drums, Bass, Synth…"
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-stack-white placeholder:text-gray-600 focus:border-stack-fire focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {INSTRUMENT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInstrument(p)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        instrument === p
                          ? 'border-stack-fire bg-stack-fire/15 text-stack-fire'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-stack-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtype */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">
                  Subtype
                </label>
                <input
                  type="text"
                  value={subtype}
                  onChange={(e) => setSubtype(e.target.value)}
                  placeholder="e.g. Loop, One-shot, Riser…"
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-stack-white placeholder:text-gray-600 focus:border-stack-fire focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {SUBTYPE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSubtype(p)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        subtype === p
                          ? 'border-stack-fire bg-stack-fire/15 text-stack-fire'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-stack-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview of what will be set */}
              {(instrument || subtype) && (
                <div className="rounded-md border border-gray-700/60 bg-gray-900/60 px-3 py-2 text-xs text-gray-400">
                  Will set{' '}
                  {instrument && (
                    <span className="text-stack-white">
                      instrument → <strong>{instrument}</strong>
                    </span>
                  )}
                  {instrument && subtype && ' and '}
                  {subtype && (
                    <span className="text-stack-white">
                      subtype → <strong>{subtype}</strong>
                    </span>
                  )}{' '}
                  on {count} sample{count !== 1 ? 's' : ''}.
                </div>
              )}
            </>
          ) : (
            <>
              {/* Tag input */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">
                  Tag name
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder={
                    mode === 'add-tag'
                      ? 'e.g. dark, punchy, 808…'
                      : 'Tag to remove…'
                  }
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-stack-white placeholder:text-gray-600 focus:border-stack-fire focus:outline-none"
                />
              </div>

              {/* Existing tags (for remove mode, show what's on the selection) */}
              {existingTags.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500">
                    {mode === 'remove-tag'
                      ? 'Tags on selected samples'
                      : 'Existing tags (click to reuse)'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {existingTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTagInput(t)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          tagInput === t
                            ? 'border-stack-fire bg-stack-fire/15 text-stack-fire'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-stack-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-700 px-4 py-2 text-xs text-gray-300 hover:border-gray-500 hover:text-stack-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                mode !== 'set-type' ? !tagInput.trim() : !instrument && !subtype
              }
              className="rounded-md bg-stack-fire px-4 py-2 text-xs font-semibold text-stack-black hover:bg-stack-fire/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mode === 'add-tag'
                ? 'Add Tag'
                : mode === 'remove-tag'
                  ? 'Remove Tag'
                  : 'Apply Type'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
