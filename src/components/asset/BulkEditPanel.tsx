import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloseCircle,
  Add,
  Trash,
  Heart,
  HeartAdd,
  TickCircle,
} from '../ui/icons';
import { useSelectionStore } from '../../stores/selectionStore';
import { assetService } from '../../services/assetService';
import { assetQueryKeys } from '../../hooks/useAssets';
import { useAssets } from '../../hooks/useAssets';
import type { Asset } from '../../types';

const PANEL_WIDTH = 340;

// ── Presets ────────────────────────────────────────────────────────────────
const INSTRUMENT_PRESETS = [
  'Drums', 'Bass', 'Keys', 'Guitar', 'Synth', 'Vocals',
  'FX', 'Strings', 'Brass', 'Percussion', 'Pad', 'Lead', 'Pluck', 'Arp',
];
const SUBTYPE_PRESETS = [
  'Loop', 'One-shot', 'Fill', 'Break', 'Riser', 'Downlifter',
  'Transition', 'Texture', 'Atmosphere', 'Hit', 'Stab', 'Chord', 'Melody', 'Groove',
];

interface BulkEditPanelProps {
  onClose: () => void;
}

export function BulkEditPanel({ onClose }: BulkEditPanelProps) {
  const { selectedIds, clearSelection } = useSelectionStore();
  const qc = useQueryClient();

  // Fetch the current page's assets the same way the grid does
  const { data } = useAssets();
  const assets: Asset[] = data?.assets ?? [];

  const [working, setWorking] = useState(false);

  // Auto-clear selection when there are no results at all
  // (filter change, library cleared, etc.)
  useEffect(() => {
    if (data && data.total === 0) {
      clearSelection();
      onClose();
    }
  }, [data, clearSelection, onClose]);
  const [toast, setToast] = useState<string | null>(null);

  // Type section state
  const [instrument, setInstrument] = useState('');
  const [subtype, setSubtype] = useState('');

  // Tag section state
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const count = selectedIds.size;
  const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
  const ids = Array.from(selectedIds);

  // Collect all existing user tags across the selection (excluding internal __ tags)
  const existingTags = Array.from(
    new Set(selectedAssets.flatMap((a) => a.userTags).filter((t) => !t.startsWith('__'))),
  ).sort();

  // Pre-fill instrument/subtype from the selection if they all share the same value
  useEffect(() => {
    const instruments = [...new Set(selectedAssets.map((a) => a.instrument).filter(Boolean))];
    const subtypes = [...new Set(selectedAssets.map((a) => a.subtype).filter(Boolean))];
    setInstrument(instruments.length === 1 ? (instruments[0] ?? '') : '');
    setSubtype(subtypes.length === 1 ? (subtypes[0] ?? '') : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: assetQueryKeys.all });

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleApplyType = async () => {
    if (!instrument && !subtype) return;
    setWorking(true);
    try {
      await assetService.bulkSetType(ids, instrument.trim() || null, subtype.trim() || null);
      const parts = [
        instrument && `instrument: ${instrument}`,
        subtype && `subtype: ${subtype}`,
      ].filter(Boolean);
      showToast(`Set ${parts.join(', ')} on ${count} sample${count !== 1 ? 's' : ''}`);
      await invalidate();
    } finally {
      setWorking(false);
    }
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim();
    if (!tag) return;
    setWorking(true);
    try {
      await assetService.bulkAddTag(ids, tag);
      showToast(`Tagged ${count} sample${count !== 1 ? 's' : ''} with "${tag}"`);
      setTagInput('');
      await invalidate();
    } finally {
      setWorking(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    setWorking(true);
    try {
      await assetService.bulkRemoveTag(ids, tag);
      showToast(`Removed "${tag}" from ${count} sample${count !== 1 ? 's' : ''}`);
      await invalidate();
    } finally {
      setWorking(false);
    }
  };

  const handleFavoriteAll = async (favorite: boolean) => {
    setWorking(true);
    try {
      await assetService.bulkSetFavorite(ids, favorite);
      showToast(
        favorite
          ? `Added ${count} sample${count !== 1 ? 's' : ''} to favorites`
          : `Removed ${count} sample${count !== 1 ? 's' : ''} from favorites`,
      );
      await invalidate();
    } finally {
      setWorking(false);
    }
  };

  const handleClearAndClose = () => {
    clearSelection();
    onClose();
  };

  return (
    <aside
      className="flex shrink-0 flex-col border-l border-gray-700/60 bg-stack-black"
      style={{ width: PANEL_WIDTH }}
      aria-label="Bulk edit"
    >
      {/* ── Header — matches AssetDetailPanel header exactly ── */}
      <header className="flex items-center justify-between border-b border-gray-700/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-stack-fire/20">
            <TickCircle size={13} color="var(--color-stack-fire)" variant="Bulk" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {count} selected
          </h2>
        </div>
        <button
          onClick={handleClearAndClose}
          className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-stack-white"
          aria-label="Clear selection and close"
          title="Clear selection"
        >
          <CloseCircle size={18} variant="Linear" color="currentColor" />
        </button>
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">

          {/* ── Selected samples list ── */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Selection
            </h3>
            <div className="flex max-h-40 flex-col gap-0 overflow-y-auto rounded-md border border-gray-800 bg-gray-900/50">
              {selectedAssets.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-600">No assets on this page</div>
              ) : (
                selectedAssets.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 border-b border-gray-800/60 px-3 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-300" title={a.filename}>
                      {a.filename}
                    </span>
                    {a.instrument && (
                      <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
                        {a.instrument}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ── Set Type ── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Set Type
            </h3>

            {/* Instrument */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-widest text-gray-500">
                Instrument
              </label>
              <input
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
                    onClick={() => setInstrument((prev) => (prev === p ? '' : p))}
                    className={`rounded border px-2.5 py-1 text-sm transition-colors ${
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
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-widest text-gray-500">
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
                    onClick={() => setSubtype((prev) => (prev === p ? '' : p))}
                    className={`rounded border px-2.5 py-1 text-sm transition-colors ${
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

            <button
              onClick={handleApplyType}
              disabled={working || (!instrument.trim() && !subtype.trim())}
              className="mt-1 w-full rounded-md bg-stack-fire px-3 py-2 text-sm font-semibold text-stack-black hover:bg-stack-fire/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply to {count} sample{count !== 1 ? 's' : ''}
            </button>
          </section>

          {/* ── Tags ── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Tags
            </h3>

            {/* Add tag input */}
            <div className="flex gap-2">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag… (Enter to apply)"
                className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-stack-white placeholder:text-gray-600 focus:border-stack-fire focus:outline-none"
              />
              <button
                onClick={handleAddTag}
                disabled={working || !tagInput.trim()}
                className="flex items-center gap-1 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-stack-fire hover:text-stack-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Add tag"
              >
                <Add size={14} color="currentColor" variant="Linear" />
              </button>
            </div>

            {/* Existing tags on the selection — click to remove */}
            {existingTags.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-widest text-gray-500">
                  On selection — click to remove
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {existingTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleRemoveTag(t)}
                      disabled={working}
                      title={`Remove tag "${t}"`}
                      className="flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-sm text-gray-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      {t}
                      <Trash size={11} color="currentColor" variant="Linear" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Favorites ── */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Favorites
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleFavoriteAll(true)}
                disabled={working}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-stack-fire hover:text-stack-fire disabled:opacity-40"
              >
                <HeartAdd size={14} color="currentColor" variant="Bulk" />
                Favorite all
              </button>
              <button
                onClick={() => handleFavoriteAll(false)}
                disabled={working}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-stack-white disabled:opacity-40"
              >
                <Heart size={14} color="currentColor" variant="Linear" />
                Unfavorite all
              </button>
            </div>
          </section>

        </div>
      </div>

      {/* ── Footer: working indicator + toast ── */}
      {(working || toast) && (
        <div className="border-t border-gray-700/60 px-4 py-2.5">
          {working && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stack-fire border-t-transparent" />
              Applying…
            </div>
          )}
          {!working && toast && (
            <div className="flex items-center gap-2 text-sm text-stack-fire">
              <TickCircle size={14} color="currentColor" variant="Bulk" />
              {toast}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
