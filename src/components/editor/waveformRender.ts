import type { Cue, WaveStyle } from '../../stores/editorStore';
import { drawBeatGrid } from './beatGrid';

export interface ThemeColors {
  /** Canvas background fill. */
  bg: string;
  /** Foreground RGB triplet — caller composes with alpha for grid lines, mid-line, playhead. */
  fgRgb: string;
  /** Idle / placeholder envelope color. */
  idle: string;
  /** Cue marker color. */
  cue: string;
  /** Playhead color. */
  playhead: string;
}

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Mono-mixed signed samples — preferred, gives a real waveform look. */
  samples: Float32Array | null;
  /** Fallback magnitude peaks (always positive), used when samples unavailable. */
  peaks: number[] | null;
  duration: number;
  windowStart: number;
  windowEnd: number;
  currentTime: number;
  loopOn: boolean;
  loopStart: number;
  loopEnd: number;
  cues: Cue[];
  color: string;
  style: WaveStyle;
  /** Track BPM — if set and > 0, enables the beat/bar grid. */
  bpm: number | null;
  /** Beats per bar (typical 4/4). */
  beatsPerBar: number;
  showBeatGrid: boolean;
  /** Theme-resolved colors so the canvas matches dark/light mode. */
  theme: ThemeColors;
  // ── Live edit preview ──────────────────────────────────────────────────────
  /** Linear gain scalar (1 = unity). Scales the waveform height visually. */
  gain?: number;
  /** High-cut frequency in Hz (22050 = bypassed). Dims high-frequency detail. */
  highCutHz?: number;
  /** Low-cut frequency in Hz (20 = bypassed). Dims low-frequency body. */
  lowCutHz?: number;
  /** Pitch shift in semitones (0 = no shift). Compresses/stretches time axis. */
  pitchSemitones?: number;
}

// Cache the last applyVisualFilter result. The blur is O(n) over the visible
// sample window and is expensive for large buffers. It only needs to rerun when
// the filter parameters or the sample window changes — not on every playhead tick.
const _filterCache: {
  samples: Float32Array | null;
  i0: number;
  i1: number;
  highCutHz: number;
  lowCutHz: number;
  result: Float32Array | null;
} = { samples: null, i0: -1, i1: -1, highCutHz: -1, lowCutHz: -1, result: null };

export function drawWaveform(p: RenderParams) {
  const { ctx, w, h, duration, windowStart, windowEnd } = p;
  const mid = h / 2;
  const windowDur = Math.max(0.0001, windowEnd - windowStart);
  const secToX = (sec: number) => ((sec - windowStart) / windowDur) * w;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = p.theme.bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal mid-line
  ctx.strokeStyle = `rgba(${p.theme.fgRgb}, 0.08)`;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  drawSignal(p, mid);
  drawBeatGrid(p);

  // Loop region
  if (p.loopOn && p.loopEnd > p.loopStart) {
    const x0 = Math.max(0, secToX(p.loopStart));
    const x1 = Math.min(w, secToX(p.loopEnd));
    ctx.fillStyle = hexToRgba(p.color, 0.14);
    ctx.fillRect(x0, 0, x1 - x0, h);
    ctx.strokeStyle = hexToRgba(p.color, 0.75);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, h);
    ctx.moveTo(x1 - 0.5, 0); ctx.lineTo(x1 - 0.5, h);
    ctx.stroke();
  }

  // Cues
  for (const cue of p.cues) {
    if (cue.position < windowStart || cue.position > windowEnd) continue;
    const x = secToX(cue.position);
    ctx.strokeStyle = p.theme.cue;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    ctx.fillStyle = p.theme.cue;
    ctx.beginPath();
    ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 6); ctx.closePath();
    ctx.fill();
  }

  // Playhead
  if (duration > 0 && p.currentTime >= windowStart && p.currentTime <= windowEnd) {
    const x = secToX(p.currentTime);
    ctx.strokeStyle = p.theme.playhead;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
}

/**
 * Renders the audio signal. When `samples` is available we draw a true
 * min/max-per-column waveform (continuous, signed). Otherwise we fall back
 * to magnitude peaks centered around the midline.
 *
 * Live edit preview:
 *  - gain    → scales halfH so the waveform visually grows/shrinks
 *  - pitch   → compresses/stretches the sample window along the time axis
 *  - filters → draws a dimmed ghost of the unprocessed waveform behind the
 *              filtered one; the ghost fades proportionally to how much the
 *              filter is cutting (approximated from the cutoff frequency)
 */
function drawSignal(p: RenderParams, mid: number) {
  const { ctx, w, h, samples, peaks, duration, windowStart, windowEnd, color, style } = p;

  // ── Edit preview scalars ─────────────────────────────────────────────────
  const gainScale      = Math.max(0, p.gain ?? 1);
  const pitchSemitones = p.pitchSemitones ?? 0;
  const highCutHz      = p.highCutHz  ?? 22050;
  const lowCutHz       = p.lowCutHz   ?? 20;

  // How much the filters are cutting (0 = bypassed, 1 = fully closed)
  const highCutAmount = 1 - Math.min(1, highCutHz / 22050);   // high-cut closing
  const lowCutAmount  = Math.min(1, (lowCutHz - 20) / 2000);  // low-cut opening

  // Ghost opacity: show original waveform dimly when a filter is active
  const ghostAlpha = Math.max(highCutAmount, lowCutAmount) * 0.25;

  // Pitch ratio: semitones → playback rate multiplier
  // A positive pitch means the sample plays faster → time-compressed visually
  const pitchRatio = Math.pow(2, pitchSemitones / 12);

  // halfH is the max pixel amplitude. Gain scales it; clamp so it never
  // exceeds the canvas (with a small margin).
  const baseHalfH    = h / 2 - 2;
  const halfH        = Math.min(baseHalfH * 1.5, baseHalfH * gainScale);

  // Clip indicator: draw a subtle red tint at the top/bottom when gain > 1
  if (gainScale > 1 && samples) {
    ctx.fillStyle = hexToRgba('#F2613F', Math.min(0.35, (gainScale - 1) * 0.25));
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, h - 4, w, 4);
  }

  if (samples && duration > 0) {
    const total = samples.length;

    // Apply pitch: compress/stretch the visible window along the sample axis.
    // A pitch ratio > 1 means the audio plays faster, so we see more samples
    // in the same time window (compressed). We keep windowStart anchored and
    // scale the window duration by pitchRatio.
    const effectiveWindowDur = (windowEnd - windowStart) * pitchRatio;
    const effectiveWindowEnd = windowStart + effectiveWindowDur;

    const i0 = Math.max(0, Math.floor((windowStart       / duration) * total));
    const i1 = Math.min(total, Math.ceil((effectiveWindowEnd / duration) * total));
    const span = Math.max(1, i1 - i0);
    const pxPerSample = w / span;

    // ── Ghost (unfiltered) waveform ──────────────────────────────────────────
    // Draw the original shape dimly behind the filtered one so the user can
    // see what the filter is removing.
    if (ghostAlpha > 0.01) {
      drawSamples(ctx, samples, total, i0, i1, span, pxPerSample,
        mid, baseHalfH, color, style, ghostAlpha * 0.6, 1);
    }

    // ── Filtered waveform ────────────────────────────────────────────────────
    // Approximate the filter effect visually:
    //  - High-cut: smooth the samples (running average) to kill high-freq detail
    //  - Low-cut:  subtract a heavily-smoothed version to kill the low-freq body
    let displaySamples = samples;

    if (highCutAmount > 0.02 || lowCutAmount > 0.02) {
      // Kernel size scales with how much the filter is cutting
      const hcKernel = Math.max(1, Math.round(highCutAmount * 80));
      const lcKernel = Math.max(1, Math.round(lowCutAmount  * 120));
      // Use the cached result when the filter params and sample window haven't
      // changed — avoids re-running the expensive blur on every playhead tick.
      if (
        _filterCache.result !== null &&
        _filterCache.samples === samples &&
        _filterCache.i0 === i0 &&
        _filterCache.i1 === i1 &&
        _filterCache.highCutHz === highCutHz &&
        _filterCache.lowCutHz === lowCutHz
      ) {
        displaySamples = _filterCache.result;
      } else {
        const filtered = applyVisualFilter(samples, i0, i1, hcKernel, lcKernel,
          highCutAmount, lowCutAmount);
        _filterCache.samples = samples;
        _filterCache.i0 = i0;
        _filterCache.i1 = i1;
        _filterCache.highCutHz = highCutHz;
        _filterCache.lowCutHz = lowCutHz;
        _filterCache.result = filtered;
        displaySamples = filtered;
      }
    }

    drawSamples(ctx, displaySamples, total, i0, i1, span, pxPerSample,
      mid, halfH, color, style, 1, 0);
    return;
  }

  if (peaks && peaks.length) {
    const startFrac = duration > 0 ? windowStart / duration : 0;
    const endFrac   = duration > 0 ? windowEnd   / duration : 1;
    const i0  = Math.floor(startFrac * peaks.length);
    const i1  = Math.max(i0 + 1, Math.ceil(endFrac * peaks.length));
    ctx.fillStyle = color;
    const len = i1 - i0;
    for (let x = 0; x < w; x++) {
      const a = i0 + Math.floor((x / w) * len);
      const b = Math.min(peaks.length, i0 + Math.floor(((x + 1) / w) * len));
      let mx = 0;
      for (let i = a; i < b; i++) { const v = peaks[i]; if (v > mx) mx = v; }
      const bh = Math.max(1, mx * halfH * 2);
      ctx.fillRect(x, mid - bh / 2, 1, bh);
    }
    return;
  }

  ctx.fillStyle = p.theme.idle;
  ctx.fillRect(0, mid - 1, w, 2);
}

/**
 * Core sample drawing — shared by both the ghost and the main waveform pass.
 * `alpha` < 1 renders the ghost; `alpha` = 1 renders the main waveform.
 * `lineWidthBoost` adds extra stroke width for the ghost so it's visible.
 */
function drawSamples(
  ctx: CanvasRenderingContext2D,
  samples: Float32Array,
  total: number,
  i0: number,
  i1: number,
  span: number,
  pxPerSample: number,
  mid: number,
  halfH: number,
  color: string,
  style: WaveStyle,
  alpha: number,
  lineWidthBoost: number,
) {
  const w = ctx.canvas.width / (window.devicePixelRatio || 1);
  const strokeColor = alpha < 1 ? hexToRgba(color, alpha) : color;

  // ── Zoomed-in: Catmull-Rom spline ─────────────────────────────────────────
  if (pxPerSample >= 1) {
    const iStart = Math.max(0, i0 - 1);
    const iEnd   = Math.min(total - 1, i1 + 1);
    const sampleToX = (i: number) =>
      span <= 1 ? w / 2 : ((i - i0) / (span - 1)) * w;
    const yAt = (i: number) =>
      mid - samples[Math.max(0, Math.min(total - 1, i))] * halfH;
    const crCP = (p0: number, p1: number, p2: number, p3: number): [number, number] =>
      [p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6];

    const drawSpline = () => {
      ctx.moveTo(sampleToX(i0), yAt(i0));
      for (let i = iStart; i < iEnd; i++) {
        const x1 = sampleToX(i), x2 = sampleToX(i + 1);
        const [cy1, cy2] = crCP(yAt(i - 1), yAt(i), yAt(i + 1), yAt(i + 2));
        ctx.bezierCurveTo(
          x1 + (x2 - x1) / 3, cy1,
          x1 + (x2 - x1) * 2 / 3, cy2,
          x2, yAt(i + 1),
        );
      }
    };

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.5 + lineWidthBoost;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    drawSpline();
    ctx.stroke();

    if (style === 'filled') {
      ctx.fillStyle = hexToRgba(color, 0.18 * alpha);
      ctx.beginPath();
      ctx.moveTo(sampleToX(i0), mid);
      ctx.lineTo(sampleToX(i0), yAt(i0));
      drawSpline();
      ctx.lineTo(sampleToX(iEnd), mid);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  // ── Zoomed-out: min/max envelope ─────────────────────────────────────────
  const samplesPerPx = span / w;
  ctx.fillStyle = strokeColor;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const a = i0 + Math.floor(x * samplesPerPx);
    const b = Math.min(total, i0 + Math.floor((x + 1) * samplesPerPx));
    let mn = 1, mx = -1;
    for (let i = a; i < b; i++) {
      const v = samples[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mn > mx) { mn = 0; mx = 0; }
    const yTop = mid - mx * halfH;
    const yBot = mid - mn * halfH;
    ctx.rect(x, yTop, 1, Math.max(1, yBot - yTop));
  }
  ctx.fill();
}

/**
 * Approximate visual filter effect on a slice of samples.
 * Returns a new Float32Array covering [i0, i1) with the filter applied.
 *
 * High-cut: box-blur (running average) — kills high-frequency detail.
 * Low-cut:  subtract a heavily-blurred version — kills low-frequency body.
 * Both effects are blended by their respective cut amounts.
 */
function applyVisualFilter(
  samples: Float32Array,
  i0: number,
  i1: number,
  hcKernel: number,
  lcKernel: number,
  highCutAmount: number,
  lowCutAmount: number,
): Float32Array {
  const len = i1 - i0;
  const slice = new Float32Array(len);
  for (let i = 0; i < len; i++) slice[i] = samples[i0 + i];

  // Box-blur helper (in-place on a Float32Array)
  const blur = (src: Float32Array, k: number): Float32Array => {
    if (k <= 1) return src;
    const out = new Float32Array(src.length);
    const half = Math.floor(k / 2);
    let sum = 0;
    // Seed the running sum
    for (let i = 0; i < Math.min(k, src.length); i++) sum += src[i];
    for (let i = 0; i < src.length; i++) {
      out[i] = sum / Math.min(k, src.length);
      const add = i + half + 1;
      const rem = i - half;
      if (add < src.length) sum += src[add];
      if (rem >= 0) sum -= src[rem];
    }
    return out;
  };

  let result = slice;

  // High-cut: blend original → blurred by highCutAmount
  if (highCutAmount > 0.02) {
    const blurred = blur(slice, hcKernel);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++)
      out[i] = slice[i] * (1 - highCutAmount) + blurred[i] * highCutAmount;
    result = out;
  }

  // Low-cut: subtract blurred (low-freq) component by lowCutAmount
  if (lowCutAmount > 0.02) {
    const blurred = blur(result, lcKernel);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++)
      out[i] = result[i] - blurred[i] * lowCutAmount;
    result = out;
  }

  return result;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? parseInt(h.split('').map((c) => c + c).join(''), 16)
      : parseInt(h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
