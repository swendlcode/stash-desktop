/**
 * Sticky column header that mirrors AssetRow's layout. Per-type column sets
 * (samples/midi keep waveform/time/key/bpm; presets show only Plugin; projects
 * show DAW + Date) are driven by the `viewType` prop.
 */
import { useSelectionStore } from '../../stores/selectionStore';
import { Checkbox } from '../ui/Checkbox';
import { COL } from './assetColumns';

export type AssetViewType = 'sample' | 'midi' | 'preset' | 'project' | 'favorites';

const LABEL_CLS = 'text-xs font-medium uppercase tracking-widest text-gray-500';
const MONO_CLS = 'mono text-xs font-medium uppercase tracking-widest text-gray-500';

export function AssetColumnHeader({
  viewType = 'sample',
  /** All asset IDs on the current page — used for select-all logic */
  pageAssetIds = [],
}: {
  viewType?: AssetViewType;
  pageAssetIds?: string[];
}) {
  const { selectedIds, setSelection, clearSelection } = useSelectionStore();

  const selectedCount = pageAssetIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = pageAssetIds.length > 0 && selectedCount === pageAssetIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelection(pageAssetIds);
    } else {
      clearSelection();
    }
  };

  return (
    <div
      className="sticky top-0 z-10 flex shrink-0 items-center border-y border-gray-700 bg-gray-900/95 backdrop-blur-sm"
      style={{ height: 32, paddingLeft: '12px', paddingRight: '12px' }}
    >
      {/* ── CHECKBOX: select-all ── */}
      <div
        className="flex shrink-0 items-center justify-center mr-2"
        style={{ width: COL.checkbox }}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={handleSelectAll}
          aria-label={allSelected ? 'Deselect all on page' : 'Select all on page'}
        />
      </div>

      {/* ── LEFT: Filename ── */}
      <div className="flex min-w-0 flex-[0.85] items-center" style={{ minWidth: '200px' }}>
        {/* Spacer for artwork (42) + play (32 on sm) + gap (8+12) */}
        <div style={{ width: 42 + 32 + 20 }} className="shrink-0" />
        <span className={LABEL_CLS}>Filename</span>
      </div>

      {/* ── CENTRE: type-specific columns ── */}
      <div className="flex min-w-0 flex-[1.15] items-center justify-center gap-1 sm:gap-3 px-2 sm:px-4">
        {(viewType === 'sample' || viewType === 'midi' || viewType === 'favorites') && (
          <>
            <div
              className="hidden lg:flex flex-1 items-center justify-center"
              style={{ minWidth: '120px' }}
            >
              <span className={LABEL_CLS}>
                {viewType === 'midi' ? 'MIDI' : viewType === 'favorites' ? 'Preview' : 'Waveform'}
              </span>
            </div>
            <div className="shrink-0 text-right" style={{ minWidth: '40px' }}>
              <span className={MONO_CLS}>Time</span>
            </div>
            <div className="shrink-0 text-center" style={{ minWidth: '50px' }}>
              <span className={MONO_CLS}>Key</span>
            </div>
            <div className="shrink-0 text-center" style={{ minWidth: '45px' }}>
              <span className={MONO_CLS}>BPM</span>
            </div>
          </>
        )}

        {viewType === 'preset' && (
          <div className="flex flex-1 items-center justify-end pr-2">
            <span className={LABEL_CLS}>Plugin</span>
          </div>
        )}

        {viewType === 'project' && (
          <>
            <div className="flex flex-1 items-center justify-center">
              <span className={LABEL_CLS}>DAW</span>
            </div>
            <div className="shrink-0 text-right" style={{ minWidth: '90px' }}>
              <span className={MONO_CLS}>Date</span>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: spacer for fav + more ── */}
      <div className="shrink-0" style={{ minWidth: '50px' }} />
    </div>
  );
}
