import { useMemo } from 'react';
import { useFilterStore, type SmartCombo } from '../../stores/filterStore';
import { ScrollArea } from '../ui/ScrollArea';
import { CHROMATIC_KEYS } from '../../utils/keyUtils';
import { useFacetCounts } from '../../hooks/useFacetCounts';
import type { AssetType, KeyScale } from '../../types';

// ─── Static config ────────────────────────────────────────────────────────────

const TYPES: Array<{ value: AssetType; label: string }> = [
  { value: 'sample',  label: 'Samples' },
  { value: 'midi',    label: 'MIDI' },
  { value: 'preset',  label: 'Presets' },
  { value: 'project', label: 'Projects' },
];

const INSTRUMENT_LABELS: Record<string, string> = {
  drum:    'Drums',
  bass:    'Bass',
  synth:   'Synth',
  lead:    'Lead',
  pad:     'Pad',
  pluck:   'Pluck',
  chord:   'Chord',
  arp:     'Arp',
  keys:    'Keys',
  piano:   'Piano',
  guitar:  'Guitar',
  strings: 'Strings',
  brass:   'Brass',
  wind:    'Wind',
  vocal:   'Vocal',
  fx:      'FX',
  ethnic:  'World / Ethnic',
};

const SUBTYPE_GROUPS: Array<{
  label: string;
  items: Array<{ value: string; label: string }>;
}> = [
  {
    label: 'Drums',
    items: [
      { value: 'kick',         label: 'Kick' },
      { value: 'snare',        label: 'Snare' },
      { value: 'clap',         label: 'Clap' },
      { value: 'hihat',        label: 'Hi-Hat' },
      { value: 'open_hihat',   label: 'Open Hat' },
      { value: 'closed_hihat', label: 'Closed Hat' },
      { value: 'rimshot',      label: 'Rimshot' },
      { value: 'tom',          label: 'Tom' },
      { value: 'crash',        label: 'Crash' },
      { value: 'ride',         label: 'Ride' },
      { value: 'cymbal',       label: 'Cymbal' },
      { value: 'shaker',       label: 'Shaker' },
      { value: 'tambourine',   label: 'Tambourine' },
      { value: 'cowbell',      label: 'Cowbell' },
      { value: 'conga',        label: 'Conga' },
      { value: 'bongo',        label: 'Bongo' },
      { value: 'percussion',   label: 'Perc' },
    ],
  },
  {
    label: 'Bass',
    items: [
      { value: '808',      label: '808' },
      { value: 'sub_bass', label: 'Sub' },
      { value: 'reese',    label: 'Reese' },
      { value: 'wobble',   label: 'Wobble' },
    ],
  },
  {
    label: 'Synth',
    items: [
      { value: 'lead',  label: 'Lead' },
      { value: 'pad',   label: 'Pad' },
      { value: 'pluck', label: 'Pluck' },
      { value: 'stab',  label: 'Stab' },
      { value: 'chord', label: 'Chord' },
      { value: 'arp',   label: 'Arp' },
    ],
  },
  {
    label: 'FX',
    items: [
      { value: 'riser',           label: 'Riser' },
      { value: 'sweep',           label: 'Sweep' },
      { value: 'impact',          label: 'Impact' },
      { value: 'downlifter',      label: 'Downlifter' },
      { value: 'uplifter',        label: 'Uplifter' },
      { value: 'reverse',         label: 'Reverse' },
      { value: 'ambience',        label: 'Ambience' },
      { value: 'texture',         label: 'Texture' },
      { value: 'noise',           label: 'Noise' },
      { value: 'glitch',          label: 'Glitch' },
      { value: 'foley',           label: 'Foley' },
      { value: 'transition',      label: 'Transition' },
      { value: 'field_recording', label: 'Field Rec' },
    ],
  },
  {
    label: 'Vocal',
    items: [
      { value: 'hook',   label: 'Hook' },
      { value: 'adlib',  label: 'Ad-lib' },
      { value: 'choir',  label: 'Choir' },
      { value: 'chant',  label: 'Chant' },
      { value: 'rap',    label: 'Rap' },
      { value: 'spoken', label: 'Spoken' },
    ],
  },
  {
    label: 'Format',
    items: [
      { value: 'loop',    label: 'Loop' },
      { value: 'oneshot', label: 'One-shot' },
      { value: 'fill',    label: 'Fill' },
      { value: 'buildup', label: 'Buildup' },
      { value: 'drop',    label: 'Drop' },
      { value: 'break',   label: 'Break' },
      { value: 'intro',   label: 'Intro' },
      { value: 'outro',   label: 'Outro' },
    ],
  },
  {
    label: 'Character',
    items: [
      { value: 'punchy',    label: 'Punchy' },
      { value: 'fat',       label: 'Fat' },
      { value: 'tight',     label: 'Tight' },
      { value: 'dark',      label: 'Dark' },
      { value: 'bright',    label: 'Bright' },
      { value: 'warm',      label: 'Warm' },
      { value: 'hard',      label: 'Hard' },
      { value: 'soft',      label: 'Soft' },
      { value: 'distorted', label: 'Distorted' },
      { value: 'saturated', label: 'Saturated' },
      { value: 'layered',   label: 'Layered' },
      { value: 'dry',       label: 'Dry' },
      { value: 'wet',       label: 'Wet' },
      { value: 'pitched',   label: 'Pitched' },
    ],
  },
];

const SCALES: KeyScale[] = ['major', 'minor'];

// ─── Smart Combos ─────────────────────────────────────────────────────────────

const SMART_COMBOS: Array<{ value: SmartCombo; label: string; description: string; emoji: string }> = [
  {
    value: 'global_tech',
    label: 'Global Tech',
    description: 'World melodies + House groove (122–126 BPM)',
    emoji: '🌍',
  },
  {
    value: 'aggressive_color',
    label: 'Aggressive Color',
    description: 'Future Bass + Dubstep Glitch (high energy, synthetic)',
    emoji: '⚡',
  },
  {
    value: 'retro_tape',
    label: 'Retro Tape',
    description: 'Warm vocals + analog textures (organic, wet)',
    emoji: '📼',
  },
  {
    value: 'transitional_impact',
    label: 'Transitional Impact',
    description: 'Risers, sweeps & downlifters (FX transitions)',
    emoji: '🚀',
  },
  {
    value: 'rhythm_construction',
    label: 'Rhythm Construction',
    description: 'Drum fills + buildups at 125–152 BPM',
    emoji: '🥁',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FilterSidebar() {
  const filters = useFilterStore((s) => s.filters);
  const toggleType = useFilterStore((s) => s.toggleType);
  const toggleInstrument = useFilterStore((s) => s.toggleInstrument);
  const toggleSubtype = useFilterStore((s) => s.toggleSubtype);
  const toggleKey = useFilterStore((s) => s.toggleKey);
  const toggleScale = useFilterStore((s) => s.toggleScale);
  const setBpmRange = useFilterStore((s) => s.setBpmRange);
  const toggleEnergyLevel = useFilterStore((s) => s.toggleEnergyLevel);
  const toggleTexture = useFilterStore((s) => s.toggleTexture);
  const toggleSpace = useFilterStore((s) => s.toggleSpace);
  const toggleRole = useFilterStore((s) => s.toggleRole);
  const applySmartCombo = useFilterStore((s) => s.applySmartCombo);
  const resetFilters = useFilterStore((s) => s.resetFilters);

  const { data: facets } = useFacetCounts();

  const subCountMap = useMemo(
    () => new Map((facets?.subtypes ?? []).map((f) => [f.value, f.count])),
    [facets?.subtypes],
  );

  const activeSubtypeCount = filters.subtypes.length;
  const activeSmartTagCount =
    filters.energyLevels.length +
    filters.textures.length +
    filters.spaces.length +
    filters.roles.length;

  return (
    <ScrollArea className="w-64 shrink-0 border-r border-gray-700 bg-gray-900">
      <div className="p-4 space-y-6">

        {/* ── Smart Combos ── */}
        <Section title="Smart Combos">
          <div className="space-y-1">
            {SMART_COMBOS.map((combo) => (
              <button
                key={combo.value}
                onClick={() => applySmartCombo(combo.value)}
                className="group flex w-full items-start gap-2 rounded-md border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-left transition-colors hover:border-stack-fire/50 hover:bg-stack-fire/5"
              >
                <span className="mt-0.5 text-sm leading-none">{combo.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-200 group-hover:text-stack-fire">
                    {combo.label}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-gray-500">
                    {combo.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Type ── */}
        <Section title="Type">
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <Pill
                key={t.value}
                active={filters.types.includes(t.value)}
                onClick={() => toggleType(t.value)}
              >
                {t.label}
              </Pill>
            ))}
          </div>
        </Section>

        {/* ── BPM ── */}
        <Section title="BPM">
          <div className="flex items-center gap-2">
            <NumberInput
              value={filters.bpmMin}
              placeholder="Min"
              onChange={(v) => setBpmRange(v, filters.bpmMax)}
            />
            <span className="text-gray-500">–</span>
            <NumberInput
              value={filters.bpmMax}
              placeholder="Max"
              onChange={(v) => setBpmRange(filters.bpmMin, v)}
            />
          </div>
        </Section>

        {/* ── Key ── */}
        <Section title="Key">
          <div className="grid grid-cols-4 gap-1.5">
            {CHROMATIC_KEYS.map((k) => (
              <Pill
                key={k}
                active={filters.keys.includes(k)}
                onClick={() => toggleKey(k)}
              >
                <span className="mono">{k}</span>
              </Pill>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {SCALES.map((s) => (
              <Pill
                key={s}
                active={filters.scales.includes(s)}
                onClick={() => toggleScale(s)}
              >
                {s}
              </Pill>
            ))}
          </div>
        </Section>

        {/* ── Smart Tags ── */}
        <Section title="Smart Tags" badge={activeSmartTagCount > 0 ? activeSmartTagCount : undefined}>
          {/* Energy */}
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Energy
            </p>
            <div className="flex gap-1.5">
              {(['high', 'low'] as const).map((level) => {
                const count = (facets?.energyLevels ?? []).find((f) => f.value === level)?.count ?? 0;
                const active = filters.energyLevels.includes(level);
                return (
                  <button
                    key={level}
                    onClick={() => toggleEnergyLevel(level)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                        : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span>{level === 'high' ? '⚡' : '🌊'}</span>
                    <span className="capitalize">{level}</span>
                    {count > 0 && (
                      <span className="mono text-[10px] text-gray-500">{count.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Texture */}
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Texture
            </p>
            <div className="flex gap-1.5">
              {(['organic', 'synthetic'] as const).map((tex) => {
                const count = (facets?.textures ?? []).find((f) => f.value === tex)?.count ?? 0;
                const active = filters.textures.includes(tex);
                return (
                  <button
                    key={tex}
                    onClick={() => toggleTexture(tex)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                        : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span>{tex === 'organic' ? '🌿' : '🔧'}</span>
                    <span className="capitalize">{tex}</span>
                    {count > 0 && (
                      <span className="mono text-[10px] text-gray-500">{count.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Space */}
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Space
            </p>
            <div className="flex gap-1.5">
              {(['dry', 'wet'] as const).map((sp) => {
                const count = (facets?.spaces ?? []).find((f) => f.value === sp)?.count ?? 0;
                const active = filters.spaces.includes(sp);
                return (
                  <button
                    key={sp}
                    onClick={() => toggleSpace(sp)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                        : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span>{sp === 'dry' ? '🏜️' : '💧'}</span>
                    <span className="capitalize">{sp}</span>
                    {count > 0 && (
                      <span className="mono text-[10px] text-gray-500">{count.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Role
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { value: 'foundation', label: 'Foundation', emoji: '🏗️' },
                { value: 'top_end',    label: 'Top End',    emoji: '✨' },
                { value: 'ear_candy',  label: 'Ear Candy',  emoji: '🍬' },
              ] as const).map((r) => {
                const count = (facets?.roles ?? []).find((f) => f.value === r.value)?.count ?? 0;
                const active = filters.roles.includes(r.value);
                return (
                  <button
                    key={r.value}
                    onClick={() => toggleRole(r.value)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
                        : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span>{r.emoji}</span>
                    <span>{r.label}</span>
                    {count > 0 && (
                      <span className="mono text-[10px] text-gray-500">{count.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ── Instrument — driven entirely by live facet counts ── */}
        <Section title="Instrument">
          <div className="space-y-0.5">
            {/* Show instruments that actually exist in the library (count > 0),
                plus any that are currently selected (so they can be deselected) */}
            {(facets?.instruments ?? [])
              .filter((f) => f.count > 0 || filters.instruments.includes(f.value))
              .map((f) => {
                const label =
                  INSTRUMENT_LABELS[f.value] ??
                  // Capitalise unknown values gracefully
                  f.value.charAt(0).toUpperCase() + f.value.slice(1);
                return (
                  <CheckRow
                    key={f.value}
                    label={label}
                    count={f.count}
                    checked={filters.instruments.includes(f.value)}
                    onChange={() => toggleInstrument(f.value)}
                  />
                );
              })}
            {(facets?.instruments ?? []).length === 0 && (
              <p className="text-xs text-gray-600">No instruments detected yet</p>
            )}
          </div>
        </Section>

        {/* ── Sound Type — grouped checkbox list with counts ── */}
        <Section
          title="Sound Type"
          badge={activeSubtypeCount > 0 ? activeSubtypeCount : undefined}
        >
          <div className="space-y-4">
            {SUBTYPE_GROUPS.map((group) => {
              // Only show items that have count > 0 or are currently selected
              const visibleItems = group.items.filter((item) => {
                const count = subCountMap.get(item.value) ?? 0;
                return count > 0 || filters.subtypes.includes(item.value);
              });
              if (visibleItems.length === 0) return null;

              const anyActive = visibleItems.some((item) =>
                filters.subtypes.includes(item.value)
              );

              return (
                <div key={group.label}>
                  <p
                    className={`mb-1 text-[10px] font-semibold uppercase tracking-widest ${
                      anyActive ? 'text-stack-fire' : 'text-gray-500'
                    }`}
                  >
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const count = subCountMap.get(item.value) ?? 0;
                      const checked = filters.subtypes.includes(item.value);
                      return (
                        <CheckRow
                          key={item.value}
                          label={item.label}
                          count={count}
                          checked={checked}
                          onChange={() => toggleSubtype(item.value)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Reset ── */}
        {(filters.energyLevels.length > 0 ||
          filters.textures.length > 0 ||
          filters.spaces.length > 0 ||
          filters.roles.length > 0 ||
          filters.instruments.length > 0 ||
          filters.subtypes.length > 0 ||
          filters.keys.length > 0 ||
          filters.bpmMin !== null ||
          filters.bpmMax !== null) && (
          <button
            onClick={resetFilters}
            className="w-full rounded-md border border-gray-700 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
          >
            Clear all filters
          </button>
        )}

      </div>
    </ScrollArea>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          {title}
        </h3>
        {badge !== undefined && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-stack-fire px-1 text-[10px] font-bold text-stack-black">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Checkbox row: [✓] Label ············ 42 */
function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className={`group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors ${
        checked ? 'bg-stack-fire/8' : 'hover:bg-gray-800'
      }`}
    >
      {/* Checkbox */}
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
          checked
            ? 'border-stack-fire bg-stack-fire'
            : 'border-gray-600 group-hover:border-gray-400'
        }`}
      >
        {checked && (
          <svg
            viewBox="0 0 10 8"
            className="h-2 w-2 fill-none stroke-stack-black stroke-2"
          >
            <polyline points="1,4 4,7 9,1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      {/* Label */}
      <span
        className={`flex-1 text-xs ${
          checked ? 'text-stack-fire' : 'text-gray-300 group-hover:text-stack-white'
        }`}
      >
        {label}
      </span>

      {/* Count */}
      <span
        className={`mono text-[11px] tabular-nums ${
          checked ? 'text-stack-fire/70' : 'text-gray-500'
        }`}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}

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
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
          : 'border-gray-600 bg-transparent text-gray-300 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function NumberInput({
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
      onChange={(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value);
        onChange(v);
      }}
      className="mono h-8 w-full min-w-0 rounded-md border border-gray-600 bg-gray-700 px-2 text-xs text-stack-white outline-none focus:border-stack-fire"
    />
  );
}
