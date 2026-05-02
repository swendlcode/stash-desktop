import { editorEngine } from '../../services/editorEngine';
import { useEditorStore, WAVE_COLORS, type WaveStyle } from '../../stores/editorStore';
import type { ContextMenuItem } from '../ui/ContextMenu';

export interface WaveformMenuActions {
  addCue: (pos: number) => void;
  removeCue: (id: string) => void;
  zoomTo: (z: number, at: number) => void;
  zoom: number;
  waveColor: string;
  waveStyle: WaveStyle;
  setWaveColor: (c: string) => void;
  setWaveStyle: (s: WaveStyle) => void;
  showBeatGrid: boolean;
  setShowBeatGrid: (v: boolean) => void;
  hasBpm: boolean;
}

/**
 * Assembles the right-click menu for the editor waveform: cue + loop
 * actions, zoom, and waveform appearance (color / style).
 */
export function buildWaveformMenu(
  posSec: number,
  cues: { id: string; position: number }[],
  loopStart: number,
  loopEnd: number,
  loopOn: boolean,
  a: WaveformMenuActions
): ContextMenuItem[] {
  const SEP: ContextMenuItem = { label: '—', disabled: true, onSelect: () => {} };
  return [
    { label: `Add cue at ${posSec.toFixed(2)}s`, onSelect: () => a.addCue(posSec) },
    {
      label: 'Remove nearest cue',
      disabled: !cues.length,
      onSelect: () => {
        if (!cues.length) return;
        const nearest = cues.reduce((x, y) =>
          Math.abs(x.position - posSec) < Math.abs(y.position - posSec) ? x : y
        );
        a.removeCue(nearest.id);
      },
    },
    SEP,
    {
      label: 'Set loop start here',
      onSelect: () => editorEngine.setLoop(true, posSec, Math.max(loopEnd, posSec + 0.05)),
    },
    {
      label: 'Set loop end here',
      onSelect: () => editorEngine.setLoop(true, Math.min(loopStart, posSec - 0.05), posSec),
    },
    { label: 'Clear loop', disabled: !loopOn, onSelect: () => editorEngine.setLoop(false) },
    SEP,
    { label: 'Zoom in', onSelect: () => a.zoomTo(a.zoom * 1.5, posSec) },
    { label: 'Zoom out', onSelect: () => a.zoomTo(a.zoom / 1.5, posSec) },
    { label: 'Reset view', onSelect: () => useEditorStore.getState().resetView() },
    SEP,
    ...WAVE_COLORS.map((c) => ({
      label: `${a.waveColor.toLowerCase() === c.hex.toLowerCase() ? '● ' : '  '}Color · ${c.name}`,
      onSelect: () => a.setWaveColor(c.hex),
    })),
    SEP,
    {
      label: `${a.waveStyle === 'filled' ? '● ' : '  '}Style · Filled`,
      onSelect: () => a.setWaveStyle('filled'),
    },
    {
      label: `${a.waveStyle === 'line' ? '● ' : '  '}Style · Line`,
      onSelect: () => a.setWaveStyle('line'),
    },
    SEP,
    {
      label: `${a.showBeatGrid ? '● ' : '  '}Beat grid${a.hasBpm ? '' : ' (track has no BPM)'}`,
      disabled: !a.hasBpm,
      onSelect: () => a.setShowBeatGrid(!a.showBeatGrid),
    },
  ];
}
