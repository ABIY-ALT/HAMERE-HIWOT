// ─────────────────────────────────────────────────────────────────────────────
// Member dues (ወርሃዊ መዋጮ) — which months are due, and who is behind. Pure
// functions shared by the dues page, its server actions and the tests.
// Months are Ethiopian: Meskerem = 1 … Nehase = 12 (no dues in Pagume).
// ─────────────────────────────────────────────────────────────────────────────

import { isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';

export const DUES_MONTHS = 12;

/** How many months of the year are due by today: all of a past year, none of a future one. */
export function monthsDue(year: number, today = todayIso()): number {
  const now = isoToEthiopian(today);
  if (!now) return 0;
  if (year < now.year) return DUES_MONTHS;
  if (year > now.year) return 0;
  return Math.min(now.month, DUES_MONTHS);
}

/** Due months (1…due) that are not paid yet. */
export function unpaidMonths(paid: Iterable<number>, due: number): number[] {
  const done = new Set(paid);
  return Array.from({ length: due }, (_, i) => i + 1).filter((m) => !done.has(m));
}

/** The current Ethiopian year. */
export function currentEthiopianYear(today = todayIso()): number {
  return isoToEthiopian(today)?.year ?? new Date().getFullYear() - 8;
}
