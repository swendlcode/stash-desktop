import type { HTMLAttributes, ReactNode } from 'react';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ScrollArea({ children, className = '', ...rest }: ScrollAreaProps) {
  return (
    <div className={`h-full overflow-y-auto ${className}`} {...rest}>
      {children}
    </div>
  );
}
