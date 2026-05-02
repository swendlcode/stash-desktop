import { useCallback, useEffect, useRef } from 'react';
import { useUiStore } from '../../stores/uiStore';

const DEFAULT_HEIGHT = 280;

/**
 * Resizable bottom dock — the sample editor's outer frame. The top edge is a
 * drag handle that resizes the dock up/down, styled to match the sidebar's
 * column-resize affordance. Height is persisted in the ui store.
 */
export function EditorDock({ children }: { children: React.ReactNode }) {
  const editorHeight = useUiStore((s) => s.editorHeight);
  const setEditorHeight = useUiStore((s) => s.setEditorHeight);

  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHRef = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHRef.current = editorHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [editorHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const newHeight = startHRef.current + (startYRef.current - e.clientY);
      if (newHeight < 100) {
        useUiStore.getState().closeEditor();
        setEditorHeight(DEFAULT_HEIGHT); // Reset to default for next open
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      } else {
        setEditorHeight(newHeight);
      }
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      useUiStore.getState().snapEditorHeight();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setEditorHeight]);

  return (
    <section
      className="relative flex shrink-0 flex-col border-t border-gray-700 bg-stack-black"
      style={{ height: editorHeight }}
      role="region"
      aria-label="Sample editor"
    >
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={() => setEditorHeight(DEFAULT_HEIGHT)}
        className="absolute left-0 right-0 top-0 z-10 h-1.5 -translate-y-1/2 cursor-row-resize transition-colors hover:bg-stack-fire/40 active:bg-stack-fire/60"
        aria-label="Resize editor"
        title="Drag to resize · double-click to reset"
      />
      {children}
    </section>
  );
}
