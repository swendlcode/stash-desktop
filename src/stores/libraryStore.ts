import { create } from 'zustand';
import type { ScanProgress } from '../types';

interface LibraryStore {
  scanProgress: ScanProgress;
  externalDeleteNotice: string | null;
  setScanProgress: (p: ScanProgress) => void;
  setExternalDeleteNotice: (notice: string | null) => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  scanProgress: { total: 0, indexed: 0, queued: 0, isScanning: false },
  externalDeleteNotice: null,
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setExternalDeleteNotice: (externalDeleteNotice) => set({ externalDeleteNotice }),
}));
