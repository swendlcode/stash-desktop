import { useCallback, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { settingsService } from '../../services/settingsService';
import { VolumeHigh, VolumeLow, VolumeMute } from '../ui/icons';
import { Slider } from '../ui/Slider';

export function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  // Debounce the settings save so we don't hammer the backend while dragging
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((v: number) => {
    setVolume(v);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Persist as the new default volume
      settingsService.getSettings().then((current) => {
        settingsService.updateSettings({ ...current, defaultVolume: v }).catch(() => {});
      }).catch(() => {});
    }, 600);
  }, [setVolume]);

  const Icon = volume === 0 ? VolumeMute : volume < 0.5 ? VolumeLow : VolumeHigh;

  return (
    <div className="flex h-8 items-center gap-2">
      <button
        onClick={() => handleChange(volume === 0 ? 0.9 : 0)}
        className="flex h-8 w-8 items-center justify-center text-gray-400 transition-colors hover:text-stack-white"
        aria-label="Toggle mute"
        title={volume === 0 ? 'Unmute' : 'Mute'}
      >
        <Icon size={18} color="currentColor" variant="Linear" />
      </button>
      <div className="flex h-8 w-24 items-center">
        <Slider value={volume} min={0} max={1} step={0.01} onChange={handleChange} />
      </div>
    </div>
  );
}
