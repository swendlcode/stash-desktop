import { useFilterStore } from '../../stores/filterStore';
import { ArrowDown2, ArrowUp2 } from '../ui/icons';
import type { SortField } from '../../types';

const FIELDS: Array<{ field: SortField; label: string }> = [
  { field: 'filename', label: 'Name' },
  { field: 'bpm', label: 'BPM' },
  { field: 'key', label: 'Key' },
  { field: 'duration', label: 'Length' },
  { field: 'pack', label: 'Pack' },
  { field: 'added', label: 'Added' },
];

export function SortControls() {
  const sort = useFilterStore((s) => s.sort);
  const setSort = useFilterStore((s) => s.setSort);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs uppercase tracking-wider text-gray-500">Sort</label>
      <select
        value={sort.field}
        onChange={(e) =>
          setSort({ ...sort, field: e.target.value as SortField })
        }
        className="h-8 rounded-md border border-gray-600 bg-gray-700 px-2 text-xs text-stack-white outline-none focus:border-stack-fire"
      >
        {FIELDS.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        onClick={() =>
          setSort({
            ...sort,
            direction: sort.direction === 'asc' ? 'desc' : 'asc',
          })
        }
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600 text-gray-300 hover:text-stack-white"
        aria-label="Toggle sort direction"
      >
        {sort.direction === 'asc' ? (
          <ArrowUp2 size={14} color="currentColor" variant="Linear" />
        ) : (
          <ArrowDown2 size={14} color="currentColor" variant="Linear" />
        )}
      </button>
    </div>
  );
}
