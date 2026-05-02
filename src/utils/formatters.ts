export function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '--';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBpm(bpm: number | null): string {
  if (bpm == null) return '--';
  return `${Math.round(bpm)}`;
}

export function formatKey(note: string | null, scale: string | null): string {
  if (!note) return '--';
  if (!scale) return note;
  return `${note} ${scale === 'minor' ? 'min' : 'maj'}`;
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Format a unix timestamp (seconds) as "Sep 23, 2023". */
export function formatProjectDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return '--';
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '--';
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
