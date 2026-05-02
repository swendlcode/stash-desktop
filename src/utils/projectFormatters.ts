const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Format an ISO date (YYYY-MM-DD) as "Sep 23, 2023". Returns input on failure. */
export function formatDeadline(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  const monthIdx = parseInt(mm, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return iso;
  return `${MONTHS_SHORT[monthIdx]} ${parseInt(dd, 10)}, ${y}`;
}

export type DeadlineUrgency = 'overdue' | 'soon' | 'upcoming' | 'far';

/**
 * Days from today until the deadline (negative if overdue). null on parse failure.
 */
export function daysUntilDeadline(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const target = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function deadlineUrgency(iso: string): DeadlineUrgency {
  const d = daysUntilDeadline(iso);
  if (d === null) return 'far';
  if (d < 0) return 'overdue';
  if (d <= 7) return 'soon';
  if (d <= 30) return 'upcoming';
  return 'far';
}

/** "Overdue · 12 days", "Due in 3 days", "Due Sep 23, 2023". */
export function formatDeadlineRelative(iso: string): string {
  const d = daysUntilDeadline(iso);
  if (d === null) return iso;
  if (d < 0) return `Overdue · ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`;
  if (d === 0) return 'Due today';
  if (d <= 14) return `Due in ${d} day${d === 1 ? '' : 's'}`;
  return `Due ${formatDeadline(iso)}`;
}
