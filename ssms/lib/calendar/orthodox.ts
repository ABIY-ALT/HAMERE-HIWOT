// ─────────────────────────────────────────────────────────────────────────────
// Ethiopian Orthodox Tewahedo calendar: the great feasts and the fasts of an
// Ethiopian year, and whether a day is a fasting day. No server code.
//
// Movable feasts hang on Fasika (Easter), which falls on the same day as the
// Eastern Orthodox Easter: the Julian computus, moved to the Gregorian
// calendar (+13 days, right for 1900–2099). From it, as Bahire Hasab gives:
//   Nineveh  −69…−67 · Hudade (Lent) −55…−1 · Debre Zeit −28 · Hosanna −7
//   Siklet −2 · Fasika 0 · Rikbe Kahnat +24 · Erget +39 · Peraklitos +49
//   Fast of the Apostles +50 … Hamle 4
// Fixed feasts are kept by their Ethiopian dates (Genna by its Gregorian one,
// 7 January, as the Church keeps it). Wednesday and Friday are fasting days,
// except in the fifty days after Fasika and on Genna and Timket.
// ─────────────────────────────────────────────────────────────────────────────

import { ethiopianToIso, isoToEthiopian } from '@/lib/utils/ethiopian-calendar';

export type Bilingual = [en: string, am: string];

export interface HolyDay {
  key: string;
  /** Gregorian ISO date (for a fast: its first day) */
  date: string;
  /** Last day of a fast */
  end?: string;
  kind: 'FEAST' | 'FAST';
  name: Bilingual;
  /** A great feast or a fast of the year (reminders go out for these) */
  major: boolean;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Fasika in a Gregorian year (Julian computus, +13 days). */
export function fasika(gregorianYear: number): string {
  const a = gregorianYear % 4;
  const b = gregorianYear % 7;
  const c = gregorianYear % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(iso(gregorianYear, month, day), 13);
}

/** An Ethiopian date of the year → Gregorian ISO */
const et = (year: number, month: number, day: number) => ethiopianToIso({ year, month, day }) as string;

const fixed = (key: string, year: number, month: number, day: number, name: Bilingual, major = true): HolyDay => ({
  key,
  date: et(year, month, day),
  kind: 'FEAST',
  name,
  major,
});

/** The feasts and fasts of an Ethiopian year (Meskerem 1 to the end of Pagume), by date. */
export function holyDays(ethYear: number): HolyDay[] {
  const g = ethYear + 8; // the Gregorian year of this Ethiopian year's Fasika
  const easter = fasika(g);
  const genna = iso(g, 1, 7);
  const movable = (key: string, offset: number, name: Bilingual, major = true): HolyDay => ({ key, date: addDays(easter, offset), kind: 'FEAST', name, major });

  const days: HolyDay[] = [
    fixed('enkutatash', ethYear, 1, 1, ['Ethiopian New Year (Enkutatash) · St. John', 'ርዕሰ ዓውደ ዓመት (እንቁጣጣሽ) · ቅዱስ ዮሐንስ']),
    fixed('demera', ethYear, 1, 16, ['Demera (eve of Meskel)', 'ደመራ'], false),
    fixed('meskel', ethYear, 1, 17, ['Meskel — Finding of the True Cross', 'መስቀል — የመስቀል በዓል']),
    fixed('hidar-mikael', ethYear, 3, 12, ['Hidar Mikael', 'ኅዳር ሚካኤል'], false),
    { key: 'tsome-nebiyat', date: et(ethYear, 3, 15), end: addDays(genna, -1), kind: 'FAST', name: ['Fast of the Prophets (Advent)', 'ጾመ ነቢያት'], major: true },
    fixed('hidar-tsion', ethYear, 3, 21, ['Hidar Tsion (St. Mary of Zion)', 'ኅዳር ጽዮን']),
    { key: 'genna', date: genna, kind: 'FEAST', name: ['Genna — Nativity of Christ', 'ገና — ልደተ ክርስቶስ'], major: true },
    fixed('ketera', ethYear, 5, 10, ['Ketera (eve of Timket)', 'ከተራ'], false),
    fixed('timket', ethYear, 5, 11, ['Timket — Epiphany', 'ጥምቀት']),
    fixed('kana', ethYear, 5, 12, ['Kana Ze Galila', 'ቃና ዘገሊላ'], false),
    fixed('astemihro', ethYear, 5, 21, ['Asteriyo Mariam', 'አስተርእዮ ማርያም'], false),
    { key: 'nineveh', date: addDays(easter, -69), end: addDays(easter, -67), kind: 'FAST', name: ['Fast of Nineveh', 'ጾመ ነነዌ'], major: true },
    { key: 'hudade', date: addDays(easter, -55), end: addDays(easter, -1), kind: 'FAST', name: ['Great Lent (Abiy Tsom)', 'ዐቢይ ጾም (ሁዳዴ)'], major: true },
    movable('debre-zeit', -28, ['Debre Zeit (Mount of Olives)', 'ደብረ ዘይት'], false),
    movable('hosanna', -7, ['Hosanna — Palm Sunday', 'ሆሣዕና']),
    movable('siklet', -2, ['Siklet — Good Friday', 'ስቅለት']),
    movable('fasika', 0, ['Fasika — Resurrection (Easter)', 'ፋሲካ — ትንሣኤ']),
    fixed('giorgis', ethYear, 8, 23, ['Kidus Giorgis (St. George)', 'ቅዱስ ጊዮርጊስ']),
    movable('rikbe-kahnat', 24, ['Rikbe Kahnat', 'ርክበ ካህናት'], false),
    fixed('lideta', ethYear, 9, 1, ['Lideta Mariam — Birth of St. Mary', 'ልደታ ለማርያም'], false),
    movable('erget', 39, ['Erget — Ascension', 'ዕርገት']),
    movable('peraklitos', 49, ['Peraklitos — Pentecost', 'ጰራቅሊጦስ']),
    { key: 'tsome-hawariat', date: addDays(easter, 50), end: et(ethYear, 11, 4), kind: 'FAST', name: ['Fast of the Apostles', 'ጾመ ሐዋርያት'], major: true },
    fixed('sene-mikael', ethYear, 10, 12, ['Sene Mikael', 'ሰኔ ሚካኤል'], false),
    fixed('petros-paulos', ethYear, 11, 5, ['Sts. Peter and Paul', 'ጴጥሮስ ወጳውሎስ']),
    { key: 'filseta', date: et(ethYear, 12, 1), end: et(ethYear, 12, 15), kind: 'FAST', name: ['Fast of the Assumption (Filseta)', 'ጾመ ፍልሰታ'], major: true },
    fixed('debre-tabor', ethYear, 12, 13, ['Debre Tabor — Transfiguration (Buhe)', 'ደብረ ታቦር (ቡሄ)']),
    fixed('filseta-feast', ethYear, 12, 16, ['Assumption of St. Mary', 'ፍልሰታ ለማርያም']),
  ];
  // The Apostles' fast is short (or none) when Fasika is late
  return days.filter((d) => !d.end || d.end >= d.date).sort((a, b) => a.date.localeCompare(b.date));
}

/** Monthly commemorations by day of the Ethiopian month */
export const MONTHLY: Record<number, Bilingual> = {
  5: ['Abune Gebre Menfes Kidus', 'አቡነ ገብረ መንፈስ ቅዱስ'],
  7: ['Holy Trinity', 'ሥላሴ'],
  12: ['St. Michael', 'ቅዱስ ሚካኤል'],
  16: ['Kidane Mihret', 'ኪዳነ ምሕረት'],
  19: ['St. Gabriel', 'ቅዱስ ገብርኤል'],
  21: ['St. Mary', 'እመቤታችን ማርያም'],
  23: ['St. George', 'ቅዱስ ጊዮርጊስ'],
  27: ['Medhane Alem', 'መድኃኔ ዓለም'],
  29: ['Bale Wold', 'በዓለ ወልድ'],
};

export interface DayInfo {
  feasts: HolyDay[];
  /** The fast (of the year) this day is in */
  fast: HolyDay | null;
  /** A fasting day: in a fast, or a Wednesday / Friday outside the fifty days */
  fasting: boolean;
  monthly: Bilingual | null;
}

/** What a day is in the Church's year. `days`: holyDays() of the years around it (pass them when asking about many days). */
export function dayInfo(date: string, days?: HolyDay[]): DayInfo {
  const eth = isoToEthiopian(date);
  const list = days ?? (eth ? [...holyDays(eth.year - 1), ...holyDays(eth.year)] : []);
  const feasts = list.filter((d) => d.kind === 'FEAST' && d.date === date);
  const fast = list.find((d) => d.kind === 'FAST' && d.date <= date && date <= (d.end ?? d.date)) ?? null;
  const g = Number(date.slice(0, 4));
  // The fifty days: from Fasika to Peraklitos (of this Gregorian year's Fasika)
  const easter = fasika(g);
  const inFifty = date >= easter && date <= addDays(easter, 49);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const noFast = feasts.some((f) => f.key === 'genna' || f.key === 'timket');
  const fasting = !noFast && (Boolean(fast) || (!inFifty && (weekday === 3 || weekday === 5)));
  return { feasts, fast, fasting, monthly: eth ? MONTHLY[eth.day] ?? null : null };
}

/** The major feasts and fasts coming from a date on, soonest first. */
export function upcoming(from: string, count = 8): HolyDay[] {
  const eth = isoToEthiopian(from);
  if (!eth) return [];
  return [...holyDays(eth.year), ...holyDays(eth.year + 1)]
    .filter((d) => d.major && (d.end ?? d.date) >= from)
    .slice(0, count);
}
