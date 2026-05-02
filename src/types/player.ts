import type { Asset } from './asset';

export interface PlayerState {
  currentAsset: Asset | null;
  queue: Asset[];
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  bpmSync: number | null;
}
