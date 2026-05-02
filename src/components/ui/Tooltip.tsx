import type { ReactNode } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
}

/**
 * Minimal tooltip — uses native title for now. Can be replaced with a positioned
 * tooltip later without touching callers.
 */
export function Tooltip({ label, children }: TooltipProps) {
  return <span title={label}>{children}</span>;
}
