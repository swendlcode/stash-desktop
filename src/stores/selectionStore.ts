import { create } from 'zustand';

interface SelectionStore {
  selectedIds: Set<string>;
  lastSelectedId: string | null;

  /** Toggle a single asset in/out of the selection */
  toggleId: (id: string) => void;
  /** Select a range of IDs (for Shift+click) */
  selectRange: (ids: string[]) => void;
  /** Replace the entire selection */
  setSelection: (ids: string[]) => void;
  /** Add IDs to the current selection */
  addToSelection: (ids: string[]) => void;
  /** Clear all selected IDs */
  clearSelection: () => void;
  /** Whether a given ID is selected */
  isSelected: (id: string) => boolean;
  /** Count of selected items */
  count: () => number;
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: new Set(),
  lastSelectedId: null,

  toggleId: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next, lastSelectedId: id };
    }),

  selectRange: (ids) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      for (const id of ids) next.add(id);
      return { selectedIds: next, lastSelectedId: ids[ids.length - 1] ?? s.lastSelectedId };
    }),

  setSelection: (ids) =>
    set({ selectedIds: new Set(ids), lastSelectedId: ids[ids.length - 1] ?? null }),

  addToSelection: (ids) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      for (const id of ids) next.add(id);
      return { selectedIds: next };
    }),

  clearSelection: () => set({ selectedIds: new Set(), lastSelectedId: null }),

  isSelected: (id) => get().selectedIds.has(id),

  count: () => get().selectedIds.size,
}));
