import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFilterStore } from '../../stores/filterStore';
import { formatCount } from '../../utils/formatters';
import { Refresh } from '../ui/icons';
import type { SortField } from '../../types';

const SORT_FIELDS: Array<{ field: SortField; label: string }> = [
  { field: 'mostRecent', label: 'Most Recent' },
  { field: 'mostUsed', label: 'Most Used' },
  { field: 'filename', label: 'Name' },
  { field: 'bpm',      label: 'BPM' },
  { field: 'key',      label: 'Key' },
  { field: 'duration', label: 'Length' },
  { field: 'pack',     label: 'Pack' },
  { field: 'added',    label: 'Date Added' },
];

function SortDropdown() {
  const sort = useFilterStore((s) => s.sort);
  const setSort = useFilterStore((s) => s.setSort);
  const currentLabel =
    SORT_FIELDS.find((f) => f.field === sort.field)?.label ?? 'Sort';

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    
    let left = r.left; // Left align by default
    // Ensure it doesn't go off the right edge of the screen
    const maxLeft = window.innerWidth - 180 - 8;
    left = Math.min(left, maxLeft);
    // Ensure it doesn't go off the left edge
    left = Math.max(8, left);
    
    setPos({ top: r.bottom + 6, left });
  }, []);

  const toggle = () => {
    if (!open) reposition();
    setOpen((o) => !o);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        className="flex h-8 items-center gap-1.5 rounded-md border border-gray-600 bg-transparent px-3 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-800 hover:text-stack-white"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {currentLabel} ▾
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ top: pos.top, left: pos.left, minWidth: 180 }}
          className="fixed z-50 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl shadow-black/60"
        >
          <div className="py-1">
            {SORT_FIELDS.map((f) => (
              <button
                key={f.field}
                onClick={() => {
                  setSort({
                    field: f.field,
                    direction:
                      sort.field === f.field && sort.direction === 'asc'
                        ? 'desc'
                        : 'asc',
                  });
                  setOpen(false);
                }}
                className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors ${
                  sort.field === f.field
                    ? 'bg-stack-fire/10 text-stack-fire'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

interface ResultsHeaderProps {
  resultCount: number;
}

export function ResultsHeader({ resultCount }: ResultsHeaderProps) {
  const setSort = useFilterStore((s) => s.setSort);
  const [shuffleFlip, setShuffleFlip] = useState(false);

  const handleShuffle = () => {
    setSort({ field: 'random', direction: shuffleFlip ? 'asc' : 'desc' });
    setShuffleFlip((v) => !v);
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700/50 bg-gray-900/50">
      {/* Left: Result count */}
      <span className="mono text-sm text-gray-500 whitespace-nowrap">
        {formatCount(resultCount)}{' '}
        {resultCount === 1 ? 'result' : 'results'}
      </span>

      {/* Right: Sort dropdown */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleShuffle}
          className="flex h-8 items-center gap-1.5 rounded-md border border-gray-600 bg-transparent px-3 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-800 hover:text-stack-white"
          aria-label="Shuffle results"
          title="Shuffle results"
        >
          <Refresh size={13} color="currentColor" variant="Linear" />
          Shuffle
        </button>
        <SortDropdown />
      </div>
    </div>
  );
}