import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLibraryStore } from '../../stores/libraryStore';
import { libraryService } from '../../services/libraryService';

export function ScanProgress() {
  const progress = useLibraryStore((s) => s.scanProgress);
  const startTimeRef = useRef<number | null>(null);
  // Track when we entered the "completing" phase (queued=0 but not yet dismissed)
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'completing' | 'done'>('idle');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wasActive = progress.isScanning || progress.queued > 0;

  useEffect(() => {
    // Only activate the modal when there's real indexing work (total > 0).
    // Reconciliation with no new files has total=0 and should never show the modal.
    if (wasActive && progress.total > 0) {
      // Actively scanning
      if (startTimeRef.current === null) startTimeRef.current = Date.now();
      setPhase('scanning');
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    } else if (progress.total > 0 && phase === 'scanning') {
      // Just finished — show 100% briefly then dismiss
      setPhase('completing');
      dismissTimerRef.current = setTimeout(() => {
        setPhase('done');
        startTimeRef.current = null;
      }, 1200);
    } else if (progress.total === 0) {
      setPhase('idle');
      startTimeRef.current = null;
    }
  }, [wasActive, progress.total, phase]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  if (phase === 'idle' || phase === 'done') return null;

  const isCompleting = phase === 'completing';

  // During completing phase show 100%, otherwise real progress
  const rawPct = progress.total > 0
    ? Math.min(99.5, (progress.indexed / progress.total) * 100)
    : 0;
  const pct = isCompleting ? 100 : rawPct;

  // ETA — only show while actively scanning
  let etaLabel = '';
  if (!isCompleting && startTimeRef.current && progress.indexed > 10 && progress.queued > 0) {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const rate = progress.indexed / elapsed;
    const remaining = progress.queued / rate;
    etaLabel = remaining < 60
      ? `~${Math.ceil(remaining)}s`
      : `~${Math.ceil(remaining / 60)}m`;
  }

  const filesPerSec = (() => {
    if (isCompleting || !startTimeRef.current || progress.indexed === 0) return null;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    if (elapsed < 0.5) return null;
    return Math.round(progress.indexed / elapsed);
  })();

  const statusText = isCompleting
    ? 'Finalising…'
    : 'Scanning and cataloguing your sounds…';

  const modal = (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card — fixed width, no text wrap */}
      <div className="relative z-10 w-[440px] min-w-[440px] rounded-2xl border border-gray-700/80 bg-[#111114] p-7 shadow-[0_24px_64px_rgba(0,0,0,0.8)]">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="whitespace-nowrap text-base font-semibold text-stack-white">
              Indexing library
            </h2>
            <p className="mt-0.5 whitespace-nowrap text-xs text-gray-500">
              {statusText}
            </p>
          </div>
          {!isCompleting && (
            <button
              onClick={() => libraryService.cancelScan()}
              className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all ${
              isCompleting ? 'duration-300 bg-green-500' : 'duration-200 bg-stack-fire'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stats row — all nowrap */}
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="mono whitespace-nowrap text-gray-400">
            <span className="text-stack-white">{progress.indexed.toLocaleString()}</span>
            <span className="text-gray-600"> / </span>
            <span className="text-gray-400">{progress.total.toLocaleString()}</span>
            <span className="text-gray-600"> files</span>
          </span>

          <div className="flex shrink-0 items-center gap-3">
            {filesPerSec !== null && (
              <span className="mono whitespace-nowrap text-gray-600">
                {filesPerSec.toLocaleString()}<span className="text-gray-700"> f/s</span>
              </span>
            )}
            {etaLabel && (
              <span className="mono whitespace-nowrap text-gray-500">{etaLabel}</span>
            )}
            <span className={`mono whitespace-nowrap font-medium tabular-nums ${isCompleting ? 'text-green-400' : 'text-gray-400'}`}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
