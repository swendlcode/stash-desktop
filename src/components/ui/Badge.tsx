import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'muted' | 'outline';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-gray-700 text-stack-white',
  accent: 'bg-stack-fire/70 text-stack-white',
  muted: 'bg-gray-800 text-gray-400',
  outline: 'border border-gray-600 text-gray-300 bg-transparent',
};

export function Badge({ children, tone = 'neutral', className = '', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`badge ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
