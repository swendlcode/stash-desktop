import { useState, useMemo } from 'react';
import { Input } from '../ui/Input';
import {
  Dropdown,
  DropdownSection,
  DropdownDivider,
  DropdownActions,
} from '../ui/Dropdown';
import { Slider } from '../ui/Slider';
import {
  SearchNormal,
  Heart,
  HeartAdd,
  CloseCircle,
} from '../ui/icons';
import { useSearch } from '../../hooks/useSearch';
import { useFilterStore } from '../../stores/filterStore';
import { useFacetCounts } from '../../hooks/useFacetCounts';
import { CHROMATIC_KEYS } from '../../utils/keyUtils';
import type { AssetType, KeyScale } from '../../types';

// ─── constants ────────────────────────────────────────────────────────────────

const TYPES: Array<{ value: AssetType | 'all'; label: string }> = [
  { value: 'all',     label: 'All'       },
  { value: 'sample',  label: 'Samples'  },
  { value: 'midi',    label: 'MIDI'     },
  { value: 'preset',  label: 'Presets'  },
  { value: 'project', label: 'Projects' },
];

// Pretty labels for known instrument values
const INSTRUMENT_LABELS: Record<string, string> = {
  drum: 'Drums', bass: 'Bass', synth: 'Synth', lead: 'Lead',
  pad: 'Pad', pluck: 'Pluck', chord: 'Chord', arp: 'Arp',
  keys: 'Keys', piano: 'Piano', guitar: 'Guitar', strings: 'Strings',
  brass: 'Brass', wind: 'Wind', vocal: 'Vocal', fx: 'FX',
};

const SCALES: Array<{ value: KeyScale; label: string }> = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
];


const BPM_MIN = 40;
const BPM_MAX = 220;

// ─── shared primitives ────────────────────────────────────────────────────────

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
          : 'border-gray-600 bg-transparent text-gray-300 hover:border-gray-500 hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

function NumInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) =>
        onChange(e.target.value === '' ? null : Number(e.target.value))
      }
      className="mono h-9 w-24 rounded-lg border border-gray-600 bg-gray-800 px-3 text-sm text-stack-white outline-none focus:border-stack-fire"
    />
  );
}

// ─── BPM dropdown ─────────────────────────────────────────────────────────────

function BpmDropdown() {
  const filters = useFilterStore((s) => s.filters);
  const setBpmRange = useFilterStore((s) => s.setBpmRange);

  const [mode, setMode] = useState<'range' | 'exact'>('range');
  const [draftMin, setDraftMin] = useState<number | null>(filters.bpmMin);
  const [draftMax, setDraftMax] = useState<number | null>(filters.bpmMax);
  const [draftExact, setDraftExact] = useState<number | null>(filters.bpmMin);

  const isActive = filters.bpmMin != null || filters.bpmMax != null;

  const updateNearestHandle = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = BPM_MIN + ratio * (BPM_MAX - BPM_MIN);
    const next = Math.round(raw);
    const minNow = draftMin ?? BPM_MIN;
    const maxNow = draftMax ?? BPM_MAX;
    const useMin = Math.abs(next - minNow) <= Math.abs(next - maxNow);
    if (useMin) {
      const bounded = Math.min(next, maxNow);
      setDraftMin(bounded);
    } else {
      const bounded = Math.max(next, minNow);
      setDraftMax(bounded);
    }
  };

  const save = () => {
    if (mode === 'exact' && draftExact != null) {
      setBpmRange(draftExact, draftExact);
    } else {
      setBpmRange(draftMin, draftMax);
    }
  };

  const clear = () => {
    setDraftMin(null);
    setDraftMax(null);
    setDraftExact(null);
    setBpmRange(null, null);
  };

  const label = isActive
    ? filters.bpmMin === filters.bpmMax && filters.bpmMin != null
      ? `${filters.bpmMin} BPM`
      : `${filters.bpmMin ?? '?'}–${filters.bpmMax ?? '?'} BPM`
    : 'BPM';

  return (
    <Dropdown label={label} active={isActive} minWidth={300}>
      {/* Mode tabs */}
      <div className="flex border-b border-gray-700">
        {(['range', 'exact'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-sm font-normal capitalize transition-colors ${
              mode === m
                ? 'border-b-2 border-stack-fire text-stack-fire'
                : 'text-gray-400 hover:text-stack-white'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'range' ? (
        <DropdownSection>
          <div className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="mono text-sm font-medium text-stack-white">
                {draftMin ?? BPM_MIN}
              </span>
              <span className="text-xs text-gray-500">BPM range</span>
              <span className="mono text-sm font-medium text-stack-white">
                {draftMax ?? BPM_MAX}
              </span>
            </div>
            {/* Track */}
            <div
              className="relative h-6 flex items-center"
              onMouseDown={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                updateNearestHandle(e.clientX, rect);
              }}
            >
              <div className="absolute z-0 h-1.5 w-full rounded-full bg-gray-700" />
              <div
                className="absolute z-10 h-1.5 rounded-full bg-stack-fire"
                style={{
                  left: `${(((draftMin ?? BPM_MIN) - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100}%`,
                  right: `${
                    100 -
                    (((draftMax ?? BPM_MAX) - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100
                  }%`,
                }}
              />
              <input
                type="range"
                min={BPM_MIN}
                max={BPM_MAX}
                step={1}
                value={draftMin ?? BPM_MIN}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDraftMin(v);
                  if (draftMax != null && v > draftMax) setDraftMax(v);
                }}
                className="stack-slider stack-slider-overlay absolute z-30 w-full bg-transparent"
              />
              <input
                type="range"
                min={BPM_MIN}
                max={BPM_MAX}
                step={1}
                value={draftMax ?? BPM_MAX}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDraftMax(v);
                  if (draftMin != null && v < draftMin) setDraftMin(v);
                }}
                className="stack-slider stack-slider-overlay absolute z-20 w-full bg-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NumInput value={draftMin} placeholder="Min" onChange={setDraftMin} />
            <span className="text-gray-500">–</span>
            <NumInput value={draftMax} placeholder="Max" onChange={setDraftMax} />
          </div>
        </DropdownSection>
      ) : (
        <DropdownSection>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <NumInput
                value={draftExact}
                placeholder="e.g. 128"
                onChange={setDraftExact}
              />
              <span className="text-sm text-gray-500">BPM</span>
            </div>
            <Slider
              value={draftExact ?? 120}
              min={BPM_MIN}
              max={BPM_MAX}
              step={1}
              onChange={setDraftExact}
            />
          </div>
        </DropdownSection>
      )}

      <DropdownActions>
        <button
          onClick={clear}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 hover:text-stack-white transition-colors"
        >
          Clear
        </button>
        <button
          onClick={save}
          className="rounded-lg bg-stack-fire px-4 py-1.5 text-sm font-medium text-stack-black hover:opacity-90 transition-opacity"
        >
          Apply
        </button>
      </DropdownActions>
    </Dropdown>
  );
}

// ─── Instrument dropdown — driven by live facet counts ───────────────────────

function InstrumentDropdown() {
  const instruments = useFilterStore((s) => s.filters.instruments);
  const toggleInstrument = useFilterStore((s) => s.toggleInstrument);
  const clearInstruments = useFilterStore((s) => s.clearInstruments);
  const { data: facets } = useFacetCounts();

  const liveInstruments = useMemo(
    () => (facets?.instruments ?? []).filter(
      (f) => f.count > 0 || instruments.includes(f.value)
    ),
    [facets?.instruments, instruments],
  );

  const isActive = instruments.length > 0;
  const label = isActive
    ? instruments.length === 1
      ? (INSTRUMENT_LABELS[instruments[0]] ?? instruments[0])
      : `${instruments.length} instruments`
    : 'Instrument';

  return (
    <Dropdown label={label} active={isActive} minWidth={220}>
      <div className="max-h-72 overflow-y-auto py-1">
        {liveInstruments.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-500">No instruments detected</p>
        )}
        {liveInstruments.map((f) => {
          const active = instruments.includes(f.value);
          const displayLabel = INSTRUMENT_LABELS[f.value] ?? (f.value.charAt(0).toUpperCase() + f.value.slice(1));
          return (
            <button
              key={f.value}
              onClick={() => toggleInstrument(f.value)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-stack-fire/10 text-stack-fire'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-stack-white'
              }`}
            >
              <span className="flex-1 text-left">{displayLabel}</span>
              <span className={`mono text-xs tabular-nums ${active ? 'text-stack-fire/70' : 'text-gray-600'}`}>
                {f.count.toLocaleString()}
              </span>
              {active && (
                <span className="h-2 w-2 rounded-full bg-stack-fire shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {isActive && (
        <>
          <DropdownDivider />
          <DropdownActions>
            <button
              onClick={clearInstruments}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 hover:text-stack-white transition-colors"
            >
              Clear
            </button>
          </DropdownActions>
        </>
      )}
    </Dropdown>
  );
}

// ─── Key dropdown ──────────────────────────────────────────────────────────────

function KeyDropdown() {
  const keys = useFilterStore((s) => s.filters.keys);
  const scales = useFilterStore((s) => s.filters.scales);
  const toggleKey = useFilterStore((s) => s.toggleKey);
  const toggleScale = useFilterStore((s) => s.toggleScale);
  const clearKeys = useFilterStore((s) => s.clearKeys);
  const clearScales = useFilterStore((s) => s.clearScales);
  const isActive = keys.length > 0 || scales.length > 0;

  const label = isActive
    ? keys.length === 1 && scales.length === 1
      ? `${keys[0]} ${scales[0]}`
      : keys.length === 1
      ? keys[0]
      : `${keys.length} keys`
    : 'Key';

  return (
    <Dropdown label={label} active={isActive} minWidth={280}>
      <DropdownSection title="Note">
        <div className="grid grid-cols-6 gap-1.5">
          {CHROMATIC_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => toggleKey(k)}
              className={`mono rounded-lg py-2 text-sm font-medium transition-colors ${
                keys.includes(k)
                  ? 'bg-stack-fire text-stack-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </DropdownSection>
      <DropdownDivider />
      <DropdownSection title="Scale">
        <div className="flex gap-2">
          {SCALES.map((s) => (
            <Pill
              key={s.value}
              active={scales.includes(s.value)}
              onClick={() => toggleScale(s.value)}
            >
              {s.label}
            </Pill>
          ))}
        </div>
      </DropdownSection>
      {isActive && (
        <>
          <DropdownDivider />
          <DropdownActions>
            <button
              onClick={() => { clearKeys(); clearScales(); }}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 hover:text-stack-white transition-colors"
            >
              Clear
            </button>
          </DropdownActions>
        </>
      )}
    </Dropdown>
  );
}



// ─── Main toolbar ──────────────────────────────────────────────────────────────

export function BrowserToolbar({
  resultCount: _resultCount,
  showFavoritesFilter = true,
  showPathChip = true,
  showTypeTabs = true,
  showKeyFilter = true,
  showBpmFilter = true,
  searchPlaceholder = 'Search samples, packs, instruments…',
}: {
  resultCount: number;
  showFavoritesFilter?: boolean;
  showPathChip?: boolean;
  showTypeTabs?: boolean;
  showKeyFilter?: boolean;
  showBpmFilter?: boolean;
  searchPlaceholder?: string;
}) {
  const [draft, setDraft] = useSearch();
  const filters = useFilterStore((s) => s.filters);
  const setTypes = useFilterStore((s) => s.setTypes);
  const toggleInstrument = useFilterStore((s) => s.toggleInstrument);
  const toggleFavoritesOnly = useFilterStore((s) => s.toggleFavoritesOnly);
  const setPathPrefix = useFilterStore((s) => s.setPathPrefix);
  const resetFilters = useFilterStore((s) => s.resetFilters);
  const { data: facets } = useFacetCounts();

  const liveCategories = useMemo(
    () => (facets?.instruments ?? []).filter(
      (f) => f.count > 0 || filters.instruments.includes(f.value)
    ),
    [facets?.instruments, filters.instruments],
  );

  const pathLabel = filters.pathPrefix
    ? filters.pathPrefix.split(/[/\\]/).filter(Boolean).slice(-2).join(' / ')
    : null;

  const activeFilterCount =
    filters.types.length +
    filters.instruments.length +
    filters.keys.length +
    filters.scales.length +
    (filters.bpmMin != null || filters.bpmMax != null ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0);

  return (
    <div className="shrink-0 border-b border-gray-700 bg-gray-900">

      {/* ── Row 1: Type tabs ── */}
      {showTypeTabs && (
        <div className="flex items-center gap-0.5 border-b border-gray-700/60 px-6 pt-2 pb-0">
          {TYPES.map((t) => {
            const active =
              t.value === 'all'
                ? filters.types.length === 0
                : filters.types.length === 1 && filters.types[0] === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTypes(t.value === 'all' ? [] : [t.value])}
                className={`relative px-4 pb-2.5 pt-1.5 text-sm font-normal transition-colors ${
                  active ? 'text-stack-fire' : 'text-gray-400 hover:text-stack-white'
                }`}
              >
                {t.label}
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-stack-fire" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Row 2: Search + filter dropdowns ── */}
      <div className="flex items-center gap-2.5 px-6 py-2.5">
        <Input
          className="w-80"
          placeholder={searchPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          leading={
            <SearchNormal size={15} color="var(--color-text-muted)" variant="Linear" />
          }
          trailing={
            draft ? (
              <button onClick={() => setDraft('')} aria-label="Clear search">
                <CloseCircle size={15} color="var(--color-text-muted)" variant="Linear" />
              </button>
            ) : null
          }
        />

        <div className="h-5 w-px bg-gray-700" />

        <InstrumentDropdown />
        {showKeyFilter && <KeyDropdown />}
        {showBpmFilter && <BpmDropdown />}

        <div className="h-5 w-px bg-gray-700" />

        {showFavoritesFilter && (
          <button
            onClick={toggleFavoritesOnly}
            className={`flex h-9 items-center gap-2 rounded-lg border px-3.5 text-sm font-normal transition-colors ${
              filters.favoritesOnly
                ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-800 hover:text-stack-white'
            }`}
          >
            {filters.favoritesOnly ? (
              <HeartAdd size={14} variant="Bulk" color="currentColor" />
            ) : (
              <Heart size={14} variant="Linear" color="currentColor" />
            )}
            Favorites
          </button>
        )}


        {showPathChip && pathLabel && (
          <button
            onClick={() => setPathPrefix(null)}
            className="flex h-9 items-center gap-2 rounded-lg border border-stack-fire bg-stack-fire/10 px-3.5 text-sm text-stack-fire"
            title={filters.pathPrefix ?? ''}
          >
            <CloseCircle size={13} variant="Linear" color="currentColor" />
            {pathLabel}
          </button>
        )}

        {(activeFilterCount > 0 || draft) && (
          <button
            onClick={() => {
              resetFilters();
              setDraft('');
            }}
            className="text-sm text-gray-500 hover:text-stack-white transition-colors whitespace-nowrap"
          >
            Clear all
          </button>
        )}

        <div className="flex-1" />
      </div>

      {/* ── Row 3: Quick category strip — live from facet counts ── */}
      {liveCategories.length > 0 && (
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto px-3 sm:px-6 pb-2.5 scrollbar-none">
          {liveCategories.map((f) => {
            const active = filters.instruments.includes(f.value);
            const displayLabel = INSTRUMENT_LABELS[f.value] ?? (f.value.charAt(0).toUpperCase() + f.value.slice(1));
            return (
              <button
                key={f.value}
                onClick={() => toggleInstrument(f.value)}
                className={`shrink-0 rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-stack-fire text-stack-black font-medium'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-stack-white'
                }`}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
