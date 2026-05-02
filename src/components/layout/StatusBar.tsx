import { useRef } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import { libraryService } from '../../services/libraryService';
import { CloseCircle } from '../ui/icons';

export function StatusBar() {
  const progress = useLibraryStore((s) => s.scanProgress);
  const externalDeleteNotice = useLibraryStore((s) => s.externalDeleteNotice);
  const startTimeRef = useRef<number | null>(null);

  const isActive = progress.isScanning || progress.queued > 0;
  const isDone = !isActive && progress.total > 0;

  if (isActive && startTimeRef.current === null) {
    startTimeRef.current = Date.now();
  }
  if (!isActive && !isDone) {
    startTimeRef.current = null;
  }

  const pct = progress.total > 0
    ? Math.min(100, (progress.indexed / progress.total) * 100)
    : 0;

  // ETA
  let etaLabel = '';
  if (isActive && startTimeRef.current && progress.indexed > 10 && progress.queued > 0) {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const rate = progress.indexed / elapsed;
    const remaining = progress.queued / rate;
    etaLabel = remaining < 60
      ? ` · ~${Math.ceil(remaining)}s`
      : ` · ~${Math.ceil(remaining / 60)}m`;
  }

  // Files/sec
  let rateLabel = '';
  if (isActive && startTimeRef.current && progress.indexed > 5) {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    if (elapsed > 0.5) {
      const fps = Math.round(progress.indexed / elapsed);
      rateLabel = ` · ${fps.toLocaleString()} f/s`;
    }
  }

  return (
    <div className="relative flex h-6 shrink-0 items-center overflow-hidden border-t border-gray-700 bg-gray-900 px-3">
      {externalDeleteNotice && (
        <div className="pointer-events-none absolute -top-10 right-3 rounded-lg border border-stack-fire/50 bg-gray-900/95 px-3.5 py-1.5 text-xs font-medium text-stack-fire shadow-xl">
          {externalDeleteNotice}
        </div>
      )}
      {/* Progress stripe — full-height track with filled orange progress */}
      {isActive && progress.total > 0 && (
        <div className="absolute inset-0 bg-gray-800/90">
          <div
            className="h-full bg-stack-fire transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Left: status text */}
      <div className="mono relative z-10 flex-1 text-xs text-gray-500">
        {isActive && progress.total > 0 ? (
          <span className="flex items-center gap-1.5">
            {/* Pulsing dot */}
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-stack-fire opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-stack-fire" />
            </span>
            <span className="text-stack-white">
              Indexing{' '}
              <span className="tabular-nums">
                {progress.indexed.toLocaleString()}
              </span>
              <span className="text-stack-white/80"> / </span>
              <span className="tabular-nums">{progress.total.toLocaleString()}</span>
              <span className="text-stack-white/80"> files</span>
              <span className="text-stack-white/80">{rateLabel}</span>
              <span className="text-stack-white/80">{etaLabel}</span>
            </span>
          </span>
        ) : isDone ? (
          <span className="text-gray-600">
            Indexed{' '}
            <span className="tabular-nums">{progress.total.toLocaleString()}</span> files
          </span>
        ) : (
          'Ready'
        )}
      </div>

      {isActive && progress.total > 0 && (
        <button
          onClick={() => libraryService.cancelScan()}
          className="relative z-10 ml-2 inline-flex h-4 w-4 items-center justify-center text-stack-white/85 transition-colors hover:text-stack-white"
          aria-label="Cancel indexing"
          title="Cancel indexing"
        >
          <CloseCircle size={14} color="currentColor" variant="Linear" />
        </button>
      )}
    </div>
  );
}
