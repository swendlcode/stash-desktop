import { create } from 'zustand';
import type { Asset } from '../types';
import { useUiStore } from './uiStore';

interface PlayerStore {
  currentAsset: Asset | null;
  /** The current page's asset list — kept in sync by AssetGrid */
  playlist: Asset[];
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  bpmSync: number | null;

  play: (asset: Asset) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  playNext: () => void;
  playPrev: () => void;
  setVolume: (volume: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBpmSync: (bpm: number | null) => void;
  setPlaylist: (assets: Asset[]) => void;
  /** Seek function — wired up by usePlayer hook */
  seekTo: ((time: number) => void) | null;
  registerSeek: (fn: (time: number) => void) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentAsset: null,
  playlist: [],
  isPlaying: false,
  volume: 0.9,
  currentTime: 0,
  duration: 0,
  bpmSync: null,
  seekTo: null,

  play: (asset) =>
    set({ currentAsset: asset, isPlaying: true, currentTime: 0, duration: 0 }),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),

  playNext: () => {
    const { currentAsset, playlist } = get();
    if (!playlist.length) return;
    const idx = currentAsset ? playlist.findIndex((a) => a.id === currentAsset.id) : -1;
    const next = playlist[idx + 1];
    if (next) set({ currentAsset: next, isPlaying: true, currentTime: 0, duration: 0 });
  },

  playPrev: () => {
    const { currentAsset, playlist, currentTime, seekTo } = get();
    if (!playlist.length) return;
    // If more than 3 seconds in, restart current track instead of going back
    if (currentTime > 3 && seekTo) {
      seekTo(0);
      return;
    }
    const idx = currentAsset ? playlist.findIndex((a) => a.id === currentAsset.id) : 1;
    const prev = playlist[idx - 1];
    if (prev) set({ currentAsset: prev, isPlaying: true, currentTime: 0, duration: 0 });
  },

  setVolume: (volume) => set({ volume }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setBpmSync: (bpmSync) => set({ bpmSync }),
  setPlaylist: (playlist) => {
    const { currentAsset } = get();
    if (currentAsset && !playlist.find(a => a.id === currentAsset.id)) {
      // Keep playback alive when the editor has this asset open — the user
      // explicitly opened the editor and navigated to a different pack.
      if (useUiStore.getState().editorAssetId === currentAsset.id) {
        set({ playlist });
        return;
      }
      set({ playlist, currentAsset: null, isPlaying: false, currentTime: 0, duration: 0 });
    } else {
      set({ playlist });
    }
  },
  registerSeek: (fn) => set({ seekTo: fn }),
}));
