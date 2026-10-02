// ─────────────────────────────────────────────────────────────────────────────
// Ethiopian calendar (Ge'ez) conversion and formatting
//
// 13 months: 12 of 30 days + Pagume (5 days, 6 in a leap year).
// Leap year: Ethiopian year % 4 === 3. New year (Meskerem 1) falls on
// Sept 11 (Sept 12 in the Gregorian year before a Gregorian leap year).
//
// All dates are plain calendar dates (no time zone). ISO strings are
// "YYYY-MM-DD" and are parsed manually so a viewer's time zone can never
// shift the day.
// ─────────────────────────────────────────────────────────────────────────────

export interface EthiopianDate {
  year: number;
  /** 1–13 (13 = Pagume) */
  month: number;
  day: number;
}

type Locale = 'en' | 'am';

const JD_OFFSET = 1723856; // Julian Day Number of the Ethiopian epoch

export const ETHIOPIAN_MONTHS_EN = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit',
  'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
] as const;

export const ETHIOPIAN_MONTHS_AM = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት',
  'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን',
] as const;

const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_AM = ['እሑድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ'];

export function isEthiopianLeapYear(year: number): boolean {
  return ((year % 4) + 4) % 4 === 3;
}

export function daysInEthiopianMonth(year: number, month: number): number {
  if (month < 13) return 30;
  return isEthiopianLeapYear(year) ? 6 : 5;
}

// ── Julian Day Number helpers ────────────────────────────────────────────────

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number): { y: number; m: number; d: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    d: e - Math.floor((153 * m + 2) / 5) + 1,
    m: m + 3 - 12 * Math.floor(m / 10),
    y: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

function ethiopianToJdn({ year, month, day }: EthiopianDate): number {
  return (
    JD_OFFSET + 365 +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * month +
    day -
    31
  );
}

function jdnToEthiopian(jdn: number): EthiopianDate {
  const r = (jdn - JD_OFFSET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor((jdn - JD_OFFSET) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

// ── ISO string parsing (no time zone involved) ───────────────────────────────

/** Parse "YYYY-MM-DD" (extra time part is ignored). Returns null if invalid. */
export function parseIsoDate(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject impossible dates such as 2026-02-31 by round-tripping
  const back = jdnToGregorian(gregorianToJdn(y, m, d));
  if (back.y !== y || back.m !== m || back.d !== d) return null;
  return { y, m, d };
}

export function toIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── Public conversion API ────────────────────────────────────────────────────

/** Gregorian ISO date → Ethiopian date. Returns null for invalid input. */
export function isoToEthiopian(iso: string | null | undefined): EthiopianDate | null {
  const g = parseIsoDate(iso);
  if (!g) return null;
  return jdnToEthiopian(gregorianToJdn(g.y, g.m, g.d));
}

/** Ethiopian date → Gregorian ISO date. Returns null for an invalid date. */
export function ethiopianToIso(date: EthiopianDate): string | null {
  const { year, month, day } = date;
  if (!Number.isInteger(year) || year < 1) return null;
  if (month < 1 || month > 13) return null;
  if (day < 1 || day > daysInEthiopianMonth(year, month)) return null;
  const g = jdnToGregorian(ethiopianToJdn(date));
  return toIsoDate(g.y, g.m, g.d);
}

/** Today's date as a Gregorian ISO string, using the device's local date. */
export function todayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 0 = Sunday … 6 = Saturday. Null for invalid input. */
export function weekdayOfIso(iso: string | null | undefined): number | null {
  const g = parseIsoDate(iso);
  if (!g) return null;
  return (gregorianToJdn(g.y, g.m, g.d) + 1) % 7;
}

export function isSunday(iso: string | null | undefined): boolean {
  return weekdayOfIso(iso) === 0;
}

export function ethiopianMonthName(month: number, locale: Locale = 'en'): string {
  const names = locale === 'am' ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS_EN;
  return names[month - 1] ?? '';
}

export function weekdayName(weekday: number, locale: Locale = 'en'): string {
  return (locale === 'am' ? WEEKDAYS_AM : WEEKDAYS_EN)[weekday] ?? '';
}

/**
 * Format a Gregorian ISO date as an Ethiopian date, e.g.
 *   en: "Meskerem 22, 2019"      am: "መስከረም 22 2019"
 * Pass { weekday: true } to prefix the weekday name.
 * Returns "—" for empty or invalid input.
 */
export function formatEthiopianDate(
  iso: string | null | undefined,
  locale: Locale = 'en',
  options: { weekday?: boolean } = {}
): string {
  const et = isoToEthiopian(iso);
  if (!et) return '—';
  const month = ethiopianMonthName(et.month, locale);
  const base =
    locale === 'am'
      ? `${month} ${et.day} ${et.year}`
      : `${month} ${et.day}, ${et.year}`;
  if (!options.weekday) return base;
  const wd = weekdayOfIso(iso);
  return wd === null ? base : `${weekdayName(wd, locale)}, ${base}`;
}
