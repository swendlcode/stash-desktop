// Pack color palette — only uses the 3 brand colors + neutral grays
const PALETTE = [
  '#F2613F', // fire
  '#888888', // gray-400
  '#555555', // gray-500
  '#AAAAAA', // gray-300
  '#333333', // gray-600
  '#ff7a5a', // fire light
  '#cc4f33', // fire dark
  '#666666',
  '#444444',
  '#999999',
];

export function packColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}
