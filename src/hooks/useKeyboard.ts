import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useUiStore } from '../stores/uiStore';

export function useKeyboard() {
  const editorAssetId = useUiStore((s) => s.editorAssetId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While sample editor is open, keyboard transport is owned by editor logic.
      if (editorAssetId) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const { currentAsset, isPlaying, pause, resume } = usePlayerStore.getState();

      if (e.code === 'Space' && currentAsset) {
        e.preventDefault();
        if (isPlaying) pause();
        else resume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorAssetId]);
}
