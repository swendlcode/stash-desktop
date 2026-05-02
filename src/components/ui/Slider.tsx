import type { ChangeEvent } from 'react';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  className = '',
}: SliderProps) {
  const range = Math.max(0.0001, max - min);
  const safe = Math.min(max, Math.max(min, value));
  const pct = ((safe - min) / range) * 100;
  return (
    <input
      type="range"
      className={`stack-slider ${className}`}
      style={{
        ['--slider-pct' as string]: `${pct}%`,
      }}
      value={safe}
      min={min}
      max={max}
      step={step}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
    />
  );
}
