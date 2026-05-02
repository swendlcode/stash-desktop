import { useEffect, useState } from 'react';
import type { ThemeColors } from '../components/editor/waveformRender';

/**
 * Resolves the canvas-side theme palette from the same CSS vars the rest of
 * the UI uses, so canvases (waveform, MIDI roll) repaint correctly when the
 * user toggles dark/light. Listens on the `data-theme` attribute.
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(readColors);

  useEffect(() => {
    const apply = () => setColors(readColors());
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, []);

  return colors;
}

function readColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const fgTriplet = (cs.getPropertyValue('--stack-white') || '247 247 247').trim();
  const idle = (cs.getPropertyValue('--gray-600') || '51 51 51').trim();
  const bgVar = (cs.getPropertyValue('--color-bg') || 'rgb(12 12 12)').trim();

  return {
    bg: bgVar || `rgb(${(cs.getPropertyValue('--stack-black') || '12 12 12').trim()})`,
    fgRgb: csvToCssRgb(fgTriplet),
    idle: `rgb(${idle})`,
    cue: '#9B3922',
    playhead: `rgb(${fgTriplet})`,
  };
}

/**
 * CSS vars are stored as space-separated triplets ("247 247 247"). Some browsers
 * keep the spaces, some collapse — normalize to comma form for use in
 * `rgba(<r>,<g>,<b>, <a>)` strings on the canvas.
 */
function csvToCssRgb(triplet: string): string {
  return triplet.replace(/\s+/g, ',');
}
