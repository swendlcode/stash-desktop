import { useCallback, useRef } from 'react';

interface KnobProps {
  /** Normalized 0..1 value the knob displays. */
  value: number;
  /** Value applied on double-click. If unset, double-click is a no-op. */
  defaultValue?: number;
  onChange: (v: number) => void;
  size?: number;
  label?: string;
  /** Formatted value shown under the knob (e.g. "1.2 kHz"). */
  valueText?: string;
  /** Pixels of vertical drag to cover the full 0..1 range. Shift = fine (×4). */
  sensitivity?: number;
}

const START_ANGLE = -135;
const END_ANGLE = 135;

export function Knob({
  value,
  defaultValue,
  onChange,
  size = 32,
  label,
  valueText,
  sensitivity = 180,
}: KnobProps) {
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startValueRef = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startValueRef.current = value;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    let rafId: number | null = null;
    let pendingValue = value;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const fine = ev.shiftKey ? 4 : 1;
      const delta = (startYRef.current - ev.clientY) / (sensitivity * fine);
      pendingValue = Math.max(0, Math.min(1, startValueRef.current + delta));
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          onChange(pendingValue);
        });
      }
    };
    const onUp = () => {
      draggingRef.current = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        onChange(pendingValue);
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, sensitivity, onChange]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const fine = e.shiftKey ? 4 : 1;
    const step = (e.deltaY < 0 ? 1 : -1) * 0.02 / fine;
    onChange(Math.max(0, Math.min(1, value + step)));
  };

  const onDoubleClick = () => {
    if (defaultValue != null) onChange(defaultValue);
  };

  const v = Math.max(0, Math.min(1, value));
  const angle = START_ANGLE + v * (END_ANGLE - START_ANGLE);
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const rad = ((angle - 90) * Math.PI) / 180;
  const innerR = r * 0.35;
  const ix0 = cx + Math.cos(rad) * innerR;
  const iy0 = cy + Math.sin(rad) * innerR;
  const ix = cx + Math.cos(rad) * r * 0.85;
  const iy = cy + Math.sin(rad) * r * 0.85;
  const trackPath = describeArc(cx, cy, r, START_ANGLE, END_ANGLE);
  const valuePath = describeArc(cx, cy, r, START_ANGLE, angle);

  return (
    <div
      className="flex shrink-0 select-none flex-col items-center gap-1 overflow-hidden"
      style={{ width: 60 }}
    >
      {label && (
        <span className="w-full truncate text-center text-[10px] uppercase tracking-widest text-gray-500">
          {label}
        </span>
      )}
      <svg
        width={size}
        height={size}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        className="cursor-ns-resize"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={v}
        aria-label={label ?? 'knob'}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="rgb(var(--gray-800))"
          stroke="rgb(var(--gray-600))"
          strokeWidth="1"
        />
        <path
          d={trackPath}
          stroke="rgb(var(--gray-600))"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={valuePath}
          stroke="rgb(var(--stack-fire))"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <line
          x1={ix0}
          y1={iy0}
          x2={ix}
          y2={iy}
          stroke="rgb(var(--stack-fire))"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      {/* Fixed-height slot so the row doesn't jump when the text width changes. */}
      <span className="mono h-3 w-full truncate text-center text-[10px] leading-3 text-gray-300">
        {valueText ?? ''}
      </span>
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number): string {
  if (Math.abs(end - start) < 0.01) {
    const p = polarToCartesian(cx, cy, r, start);
    return `M ${p.x} ${p.y}`;
  }
  const s = polarToCartesian(cx, cy, r, end);
  const e = polarToCartesian(cx, cy, r, start);
  const largeArc = end - start <= 180 ? '0' : '1';
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 0 ${e.x} ${e.y}`;
}
