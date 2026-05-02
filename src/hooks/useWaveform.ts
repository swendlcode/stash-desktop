import { useQuery } from '@tanstack/react-query';
import { type RefObject, useEffect, useRef, useCallback } from 'react';
import { assetService } from '../services/assetService';
import { assetQueryKeys } from './useAssets';

export function useWaveformData(id: string | null) {
  return useQuery({
    queryKey: id ? assetQueryKeys.waveform(id) : ['waveform', 'null'],
    queryFn: () => (id ? assetService.getWaveform(id) : []),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  data: number[] | null | undefined,
  progress: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;

  // Use getBoundingClientRect for the true rendered size — more reliable than
  // clientWidth inside absolutely-positioned virtualizer rows.
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (width < 2 || height < 2) return;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  const cs = getComputedStyle(document.documentElement);
  const accent = (cs.getPropertyValue('--stack-fire') || '242 97 63').trim();
  const idleTriplet = (cs.getPropertyValue('--gray-500') || '85 85 85').trim();
  const placeholderTriplet = (cs.getPropertyValue('--gray-700') || '36 36 36').trim();
  const playedColor = `rgb(${accent})`;
  const idleColor = `rgb(${idleTriplet})`;

  if (!data || data.length === 0) {
    // Draw a subtle flat line as placeholder
    ctx.fillStyle = `rgb(${placeholderTriplet})`;
    ctx.fillRect(0, Math.round(height / 2) - 1, width, 2);
    return;
  }

  const mid = height / 2;
  const count = data.length;
  const progressX = progress * width;

  // Sample peaks down to one value per output pixel so we never see
  // chunky "voxel" bars even if the cached waveform has more bars
  // than the canvas has pixels. Conversely, when the waveform has
  // fewer bars than pixels we interpolate so the result still fills
  // the row smoothly.
  const samplesPerPx = count / width;

  if (samplesPerPx >= 1) {
    // Down-sample: peak-hold per pixel column → one 1-px stroke per column.
    for (let x = 0; x < width; x++) {
      const a = Math.floor(x * samplesPerPx);
      const b = Math.min(count, Math.floor((x + 1) * samplesPerPx));
      let peak = 0;
      for (let i = a; i < b; i++) {
        const v = data[i];
        if (v > peak) peak = v;
      }
      const amp = Math.min(1, Math.max(0, peak)) * mid * 0.92;
      ctx.fillStyle = x < progressX ? playedColor : idleColor;
      const h = Math.max(1, amp * 2);
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
    return;
  }

  // Up-sample: linear interpolation between bars, again one 1-px stroke
  // per column for a clean continuous envelope (no gaps, no chunkiness).
  const lastIdx = count - 1;
  for (let x = 0; x < width; x++) {
    const t = (x / width) * lastIdx;
    const i = Math.floor(t);
    const frac = t - i;
    const a = data[i] ?? 0;
    const b = data[Math.min(lastIdx, i + 1)] ?? a;
    const v = a + (b - a) * frac;
    const amp = Math.min(1, Math.max(0, v)) * mid * 0.92;
    ctx.fillStyle = x < progressX ? playedColor : idleColor;
    const h = Math.max(1, amp * 2);
    ctx.fillRect(x, mid - h / 2, 1, h);
  }
}

export function useWaveformCanvas(
  canvasRef: RefObject<HTMLCanvasElement>,
  data: number[] | null | undefined,
  progress: number
) {
  // Always keep latest values accessible to the observer callback
  const latestRef = useRef({ data, progress });
  latestRef.current = { data, progress };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWaveform(canvas, latestRef.current.data, latestRef.current.progress);
  }, [canvasRef]);

  // Redraw when data or progress changes
  useEffect(() => {
    redraw();
  }, [data, progress, redraw]);

  // Redraw when the canvas element is resized (handles virtualizer layout)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Only redraw if we actually have a non-zero size
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          drawWaveform(canvas, latestRef.current.data, latestRef.current.progress);
        }
      }
    });

    ro.observe(canvas);

    // Also try an immediate draw in case the canvas already has size
    drawWaveform(canvas, latestRef.current.data, latestRef.current.progress);

    // Repaint when the user toggles dark/light so colors flip with the rest
    // of the UI (no rerender of the parent is needed since data/progress are
    // unchanged but colors are read from CSS vars at draw time).
    const themeObs = new MutationObserver(() => {
      drawWaveform(canvas, latestRef.current.data, latestRef.current.progress);
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      ro.disconnect();
      themeObs.disconnect();
    };
  }, [canvasRef]);
}
