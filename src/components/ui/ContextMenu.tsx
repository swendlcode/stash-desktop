import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Clamped position — calculated after mount so we know the menu dimensions
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp to viewport so the menu never goes off-screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      left: Math.min(x, vw - width - 8),
      top: Math.min(y, vh - height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Use capture so we catch clicks before anything else
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={ref}
      // Render at initial position first (invisible), then snap to clamped pos
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[9999] min-w-[200px] overflow-hidden rounded-lg border border-gray-600 bg-gray-900 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)] outline-none"
    >
      {items.map((item, i) =>
        item.label === '—' ? (
          <div key={i} className="mx-2 my-1 border-t border-gray-700" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              item.onSelect();
              onClose();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-stack-white hover:bg-gray-700/80'
            }`}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );

  // Portal to document.body — escapes any transform/overflow stacking context
  return createPortal(menu, document.body);
}
