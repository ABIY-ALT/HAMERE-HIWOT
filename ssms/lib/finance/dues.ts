// ─────────────────────────────────────────────────────────────────────────────
// Member dues (ወርሃዊ መዋጮ) — which months are due, and who is behind. Pure
// functions shared by the dues page, its server actions, the bot and the tests.
// Months are Ethiopian: Meskerem = 1 … Nehase = 12 (no dues in Pagume).
// A member owes from the month they joined (their registration date).
// ─────────────────────────────────────────────────────────────────────────────

import { ETHIOPIAN_MONTHS_AM, ETHIOPIAN_MONTHS_EN, isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';

export const DUES_MONTHS = 12;

/** How many months of the year are due by today: all of a past year, none of a future one. */
export function monthsDue(year: number, today = todayIso()): number {
  const now = isoToEthiopian(today);
  if (!now) return 0;
  if (year < now.year) return DUES_MONTHS;
  if (year > now.year) return 0;
  return Math.min(now.month, DUES_MONTHS);
}

/** Due months (from…due) that are not paid yet. `from`: the first month owed (see firstOwedMonth). */
export function unpaidMonths(paid: Iterable<number>, due: number, from = 1): number[] {
  const done = new Set(paid);
  return Array.from({ length: due }, (_, i) => i + 1).filter((m) => m >= from && !done.has(m));
}

/**
 * The first month of `year` a member owes: the month they joined (registration
 * date, else when their record was made). 1 if they joined before the year,
 * 13 (= none) if they joined after it or in Pagume.
 */
export function firstOwedMonth(joined: string | null | undefined, year: number): number {
  const j = isoToEthiopian(joined ?? null);
  if (!j || j.year < year) return 1;
  if (j.year > year) return DUES_MONTHS + 1;
  return Math.min(j.month, DUES_MONTHS + 1);
}

/** The current Ethiopian year. */
export function currentEthiopianYear(today = todayIso()): number {
  return isoToEthiopian(today)?.year ?? new Date().getFullYear() - 8;
}

// ── Months of more than one year (a payment can cover last year's and this year's) ──

/** A month of a year as one number: 201811 = Hamle 2018, 201901 = Meskerem 2019. */
export const toPeriod = (year: number, month: number) => year * 100 + month;
export const periodYear = (p: number) => Math.floor(p / 100);
export const periodMonth = (p: number) => p % 100;

/** "ሐምሌ፣ ነሐሴ 2018 · መስከረም 2019" — oldest first, grouped by year. */
export function periodsLabel(periods: number[], locale: 'am' | 'en' = 'am'): string {
  const names = locale === 'am' ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS_EN;
  const sorted = [...periods].sort((a, b) => a - b);
  const years = [...new Set(sorted.map(periodYear))];
  return years
    .map((y) => `${sorted.filter((p) => periodYear(p) === y).map((p) => names[periodMonth(p) - 1]).join(locale === 'am' ? '፣ ' : ', ')} ${y}`)
    .join(' · ');
}

export interface ClaimPart {
  year: number;
  months: number[];
  amount_per_month: number;
}

/**
 * How a reported payment is recorded: one part (one receipt) per year.
 * `perMonth` given → that amount for every month. Otherwise each year's
 * monthly amount when the total is exactly what they come to, else the total
 * shared equally over the months.
 */
export function claimPlan(periods: number[], total: number, rates: Record<number, number | undefined>, perMonth?: number): ClaimPart[] {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const years = [...new Set(sorted.map(periodYear))];
  const parts = years.map((year) => ({ year, months: sorted.filter((p) => periodYear(p) === year).map(periodMonth) }));
  const expected = expectedTotal(sorted, rates);
  const atRates = perMonth === undefined && expected !== null && Math.abs(expected - total) < 0.005;
  const even = Math.round((total / Math.max(sorted.length, 1)) * 100) / 100;
  return parts.map((p) => ({ ...p, amount_per_month: perMonth ?? (atRates ? rates[p.year]! : even) }));
}

/** What these months come to at each year's monthly amount; null when a year has none set. */
export function expectedTotal(periods: number[], rates: Record<number, number | undefined>): number | null {
  let sum = 0;
  for (const p of periods) {
    const rate = rates[periodYear(p)];
    if (rate === undefined || rate === null) return null;
    sum += rate;
  }
  return Math.round(sum * 100) / 100;
}
