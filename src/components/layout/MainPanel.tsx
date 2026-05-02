import type { ReactNode } from 'react';

export function MainPanel({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-panel"
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-stack-black"
    >
      {children}
    </main>
  );
}
