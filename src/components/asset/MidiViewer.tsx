import { useEffect, useRef } from 'react';
import type { MidiNote } from '../../types';

interface MidiViewerProps {
  notes: MidiNote[];
  height?: number;
  className?: string;
}

export function MidiViewer({ notes, height = 60, className = '' }: MidiViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    if (notes.length === 0) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, h / 2 - 1, w, 2);
      return;
    }

    let maxTick = 0;
    let minPitch = 127;
    let maxPitch = 0;
    for (const n of notes) {
      const end = n.startTick + n.durationTicks;
      if (end > maxTick) maxTick = end;
      if (n.pitch < minPitch) minPitch = n.pitch;
      if (n.pitch > maxPitch) maxPitch = n.pitch;
    }
    const pitchSpan = Math.max(1, maxPitch - minPitch + 1);
    const rowHeight = h / pitchSpan;

    for (const n of notes) {
      const x = (n.startTick / maxTick) * w;
      const noteW = Math.max(2, (n.durationTicks / maxTick) * w);
      const y = h - (n.pitch - minPitch + 1) * rowHeight;
      const intensity = 0.3 + (n.velocity / 127) * 0.7;
      ctx.fillStyle = `rgba(242, 97, 63, ${intensity})`;
      ctx.fillRect(x, y, noteW, Math.max(2, rowHeight - 1));
    }
  }, [notes]);

  return <canvas ref={canvasRef} className={`w-full ${className}`} style={{ height }} />;
}
