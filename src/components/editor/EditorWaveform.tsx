import { useEffect, useRef, useState, useCallback } from 'react';
import { editorEngine } from '../../services/editorEngine';
import { useEditorStore } from '../../stores/editorStore';
import { useEditorEngine } from '../../hooks/useEditorEngine';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { drawWaveform } from './waveformRender';
import { buildWaveformMenu } from './waveformMenu';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Props {
  samples: Float32Array | null;
  peaks: number[] | null;
  /** If set, fixes the canvas height; otherwise the canvas fills its container. */
  height?: number;
  /** Track BPM, used to render the beat/bar grid. */
  bpm?: number | null;
  /** Beats per bar — defaults to 4 when absent. */
  beatsPerBar?: number;
}

type DragMode = 'none' | 'seek' | 'loop-start' | 'loop-end' | 'loop-create';

export function EditorWaveform({ samples, peaks, height, bpm = null, beatsPerBar = 4 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: height ?? 0 });
  const [menu, setMenu] = useState<{ x: number; y: number; posSec: number } | null>(null);
  const dragRef = useRef<DragMode>('none');

  const themeColors = useThemeColors();
  const { currentTime, duration, loopOn, loopStart, loopEnd,
          volume, highCutHz, lowCutHz, pitchSemitones } = useEditorEngine();
  const zoom = useEditorStore((s) => s.zoom);
  const scroll = useEditorStore((s) => s.scroll);
  const cues = useEditorStore((s) => s.cues);
  const waveColor = useEditorStore((s) => s.waveColor);
  const waveStyle = useEditorStore((s) => s.waveStyle);
  const showBeatGrid = useEditorStore((s) => s.showBeatGrid);
  const setScroll = useEditorStore((s) => s.setScroll);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setWaveColor = useEditorStore((s) => s.setWaveColor);
  const setWaveStyle = useEditorStore((s) => s.setWaveStyle);
  const setShowBeatGrid = useEditorStore((s) => s.setShowBeatGrid);
  const addCue = useEditorStore((s) => s.addCue);
  const removeCue = useEditorStore((s) => s.removeCue);

  const windowDur = duration > 0 ? duration / zoom : 0;
  const windowStart = windowDur > 0 ? scroll * (duration - windowDur) : 0;
  const windowEnd = windowStart + windowDur;

  const secToX = useCallback(
    (sec: number) => ((sec - windowStart) / Math.max(0.0001, windowDur)) * size.w,
    [windowStart, windowDur, size.w]
  );
  const xToSec = useCallback(
    (x: number) => windowStart + (x / Math.max(1, size.w)) * windowDur,
    [windowStart, windowDur, size.w]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      const h = height ?? Math.max(40, Math.floor(entry.contentRect.height));
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawWaveform({
      ctx, w: size.w, h: size.h, samples, peaks, duration,
      windowStart, windowEnd, currentTime, loopOn, loopStart, loopEnd, cues,
      color: waveColor, style: waveStyle,
      bpm, beatsPerBar, showBeatGrid,
      theme: themeColors,
      gain: volume,
      highCutHz,
      lowCutHz,
      pitchSemitones,
    });
  }, [samples, peaks, size.w, size.h, windowStart, windowEnd, duration,
      currentTime, loopOn, loopStart, loopEnd, cues, waveColor, waveStyle,
      bpm, beatsPerBar, showBeatGrid, themeColors,
      volume, highCutHz, lowCutHz, pitchSemitones]);

  const zoomTo = (newZoom: number, atSec: number) => {
    const z = Math.max(1, Math.min(64, newZoom));
    const wd = duration / z;
    const frac = windowDur > 0 ? (atSec - windowStart) / windowDur : 0.5;
    const newStart = Math.max(0, Math.min(duration - wd, atSec - frac * wd));
    setZoom(z);
    setScroll(duration - wd > 0 ? newStart / (duration - wd) : 0);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const sec = xToSec(x);
    const pxTol = 5;
    if (loopOn && Math.abs(x - secToX(loopStart)) < pxTol) dragRef.current = 'loop-start';
    else if (loopOn && Math.abs(x - secToX(loopEnd)) < pxTol) dragRef.current = 'loop-end';
    else if (e.shiftKey) {
      editorEngine.setLoop(true, sec, Math.min(duration, sec + 0.5));
      dragRef.current = 'loop-create';
    } else {
      editorEngine.seek(sec);
      dragRef.current = 'seek';
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current === 'none') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sec = xToSec(e.clientX - rect.left);
    if (dragRef.current === 'seek') editorEngine.seek(sec);
    else if (dragRef.current === 'loop-start')
      editorEngine.setLoop(true, Math.min(sec, loopEnd - 0.02), loopEnd);
    else if (dragRef.current === 'loop-end')
      editorEngine.setLoop(true, loopStart, Math.max(sec, loopStart + 0.02));
    else if (dragRef.current === 'loop-create')
      editorEngine.setLoop(true, loopStart, Math.max(sec, loopStart + 0.02));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (duration <= 0 || size.w <= 0) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = Math.max(0, Math.min(size.w, e.clientX - rect.left));
      const factor = e.deltaY > 0 ? 1 / 1.25 : 1.25;
      zoomTo(zoom * factor, xToSec(mx));
    } else if (duration > 0 && zoom > 1) {
      setScroll(scroll + (e.deltaX || e.deltaY) / (size.w * 4));
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    setMenu({ x: e.clientX, y: e.clientY, posSec: xToSec(e.clientX - rect.left) });
  };

  const menuItems: ContextMenuItem[] = menu
    ? buildWaveformMenu(menu.posSec, cues, loopStart, loopEnd, loopOn, {
        addCue, removeCue, zoomTo, zoom,
        waveColor, waveStyle, setWaveColor, setWaveStyle,
        showBeatGrid, setShowBeatGrid, hasBpm: !!bpm && bpm > 0,
      })
    : [];

  return (
    <div ref={containerRef} className="relative w-full h-full select-none">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: size.h, display: 'block', cursor: 'crosshair' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={() => { dragRef.current = 'none'; }}
        onMouseLeave={() => { dragRef.current = 'none'; }}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
