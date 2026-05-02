import { useRef, useEffect } from 'react';
import { useWaveformCanvas, useWaveformData } from '../../hooks/useWaveform';

interface WaveformViewerProps {
  assetId: string;
  progress?: number;
  className?: string;
  height?: number;
  preloaded?: number[] | null;
  /** Called with a 0–1 fraction when the user clicks to seek */
  onSeek?: (fraction: number) => void;
}

export function WaveformViewer({
  assetId,
  progress = 0,
  className = '',
  height = 40,
  preloaded,
  onSeek,
}: WaveformViewerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Only fetch from backend if no preloaded data
  const shouldFetch = !preloaded || preloaded.length === 0;
  const { data: fetched } = useWaveformData(shouldFetch ? assetId : null);
  const effective = shouldFetch ? fetched : preloaded;

  useWaveformCanvas(canvasRef, effective, progress);

  // Make sure canvas fills its wrapper — needed because the virtualizer
  // positions rows absolutely and the canvas may not get a layout pass
  // before the ResizeObserver fires.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    // Force canvas to match wrapper size on first render
    const { width, height: h } = wrapper.getBoundingClientRect();
    if (width > 0 && h > 0) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${h}px`;
    }
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, fraction)));
  };

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full ${className}`}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${onSeek ? 'cursor-pointer' : ''}`}
        onClick={handleClick}
        aria-label="Waveform"
      />
    </div>
  );
}
