import { useEffect, useState } from 'react';
import { editorEngine } from '../services/editorEngine';

/**
 * Subscribes to editorEngine and returns a snapshot of its state.
 * Uses a version counter so getSnapshot-style identity isn't required —
 * component re-renders each time the engine emits.
 */
export function useEditorEngine() {
  const [, setTick] = useState(0);
  useEffect(() => editorEngine.subscribe(() => setTick((t) => t + 1)), []);
  return {
    loadedPath: editorEngine.loadedPath,
    playing: editorEngine.playing,
    currentTime: editorEngine.currentTime,
    duration: editorEngine.duration,
    volume: editorEngine.volume,
    rate: editorEngine.rate,
    highCutHz: editorEngine.highCutHz,
    lowCutHz: editorEngine.lowCutHz,
    loopOn: editorEngine.loopOn,
    loopStart: editorEngine.loopStart,
    loopEnd: editorEngine.loopEnd,
    pitchSemitones: editorEngine.pitchSemitones,
    reversed: editorEngine.reversed,
  };
}
