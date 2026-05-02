import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown2 } from './icons';

interface DropdownProps {
  /** The trigger button label */
  label: ReactNode;
  /** Whether any filter inside is active — highlights the trigger */
  active?: boolean;
  children: ReactNode;
  /** Min-width of the panel in px */
  minWidth?: number;
  /** Alignment of the dropdown panel */
  align?: 'left' | 'right';
}

/**
 * Generic dropdown panel. Renders the panel in a portal so it floats above
 * everything. Closes on outside click or Escape.
 */
export function Dropdown({
  label,
  active = false,
  children,
  minWidth = 240,
  align = 'left',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    
    let left = r.left;
    if (align === 'right') {
      left = r.right - minWidth;
      // Ensure it doesn't go off the left edge of the screen
      left = Math.max(8, left);
    }
    
    // Ensure it doesn't go off the right edge of the screen
    const maxLeft = window.innerWidth - minWidth - 8;
    left = Math.min(left, maxLeft);
    
    setPos({ top: r.bottom + 6, left });
  }, [align, minWidth]);

  const toggle = () => {
    if (!open) reposition();
    setOpen((o) => !o);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
          active || open
            ? 'border-stack-fire bg-stack-fire/10 text-stack-fire'
            : 'border-gray-600 bg-transparent text-gray-300 hover:border-gray-500 hover:bg-gray-800 hover:text-stack-white'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <ArrowDown2
          size={11}
          color="currentColor"
          variant="Linear"
          style={{
            transition: 'transform 150ms',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, minWidth }}
            className="fixed z-50 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl shadow-black/40"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

/** Reusable section header inside a dropdown panel */
export function DropdownSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-3 py-3">
      {title && (
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** Divider between sections */
export function DropdownDivider() {
  return <div className="h-px bg-gray-700/80" />;
}

/** Row of action buttons at the bottom of a dropdown */
export function DropdownActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-3 py-2">
      {children}
    </div>
  );
}
