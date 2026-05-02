/**
 * Shared column geometry for AssetRow and AssetColumnHeader.
 * All pixel values are fixed widths; the waveform column is flex-1.
 */
export const COL = {
  /** Checkbox column — fixed width before artwork, with right gap */
  checkbox: 40,
  /** Left section: artwork + play + name — flex-1, min-width prevents collapse */
  leftMinW: 260,
  /** Waveform — flex-1 inside centre, min-width so it never collapses */
  waveMinW: 120,
  /** Time column */
  time: 52,
  /** Key column */
  key: 72,
  /** BPM column */
  bpm: 52,
  /** Right section: fav + more — fixed */
  rightW: 72,
  /** Horizontal padding on each side of the row */
  px: 24,
} as const;
