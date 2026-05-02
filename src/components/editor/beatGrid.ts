import type { RenderParams } from './waveformRender';

/**
 * Draws a beat/bar grid on top of the waveform. Renders every beat when
 * there's room, widens the stride once beats get cramped, labels bar
 * numbers above downbeats when they fit. Silent no-op when the track has
 * no BPM or the density would just be noise.
 */
export function drawBeatGrid(p: RenderParams) {
  if (!p.showBeatGrid || !p.bpm || p.bpm <= 0) return;
  const beatDur = 60 / p.bpm;
  const windowDur = Math.max(0.0001, p.windowEnd - p.windowStart);
  const pxPerBeat = (beatDur / windowDur) * p.w;
  if (pxPerBeat < 5) return;

  const beatsPerBar = p.beatsPerBar > 0 ? p.beatsPerBar : 4;
  let stride = 1;
  while (pxPerBeat * stride < 24 && stride < beatsPerBar) stride *= 2;

  const startBeat = Math.max(0, Math.ceil(p.windowStart / beatDur));
  const endBeat = Math.floor(p.windowEnd / beatDur);
  const { ctx, w, h } = p;

  for (let k = startBeat; k <= endBeat; k++) {
    if (k % stride !== 0 && k % beatsPerBar !== 0) continue;
    const t = k * beatDur;
    const x = ((t - p.windowStart) / windowDur) * w;
    const isBar = k % beatsPerBar === 0;
    const fg = p.theme.fgRgb;
    ctx.strokeStyle = isBar ? `rgba(${fg}, 0.28)` : `rgba(${fg}, 0.10)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.floor(x) + 0.5, 0);
    ctx.lineTo(Math.floor(x) + 0.5, h);
    ctx.stroke();
    if (isBar && pxPerBeat * beatsPerBar >= 28) {
      ctx.fillStyle = `rgba(${fg}, 0.55)`;
      ctx.font = '9px "DM Mono", ui-monospace, monospace';
      ctx.fillText(String(Math.floor(k / beatsPerBar) + 1), x + 3, 10);
    }
  }
}
