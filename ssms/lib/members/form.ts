// ─────────────────────────────────────────────────────────────────────────────
// The member registration form — the choices and wording of the paper form
// "የሐመረ ሕይወት ሰንበት ትምህርት ቤት የአባላት መመዝገቢያ ቅጽ", shared by the
// register / edit dialog, the profile and the server actions.
// ─────────────────────────────────────────────────────────────────────────────

import { todayIso } from '@/lib/utils/ethiopian-calendar';
import { SCHOOL_DEPARTMENTS } from '@/lib/organization/departments';

export type MembershipType = 'REGULAR' | 'SPECIAL' | 'HONORARY';
export type MaritalStatus = 'MARRIED' | 'SINGLE';

/** [code, English, Amharic] — in the order of the paper form */
export const MEMBERSHIP_TYPES: [MembershipType, string, string][] = [
  ['REGULAR', 'Regular member', 'መደበኛ አባል'],
  ['SPECIAL', 'Special regular member', 'ልዩ መደበኛ አባል'],
  ['HONORARY', 'Honorary member', 'የክብር አባል'],
];

export const MARITAL_STATUSES: [MaritalStatus, string, string][] = [
  ['MARRIED', 'Married', 'ያገባ'],
  ['SINGLE', 'Not married', 'ያላገባ'],
];

/** "በሐመረ ሕይወት ሰ/ት/ቤት ማገልገል የሚፈልጉበት ክፍል (ምርጫ)" — the same departments as the asset template */
export const SERVICE_DEPARTMENTS: [string, string, string][] = SCHOOL_DEPARTMENTS.map((d) => [d.code, d.name_en, d.name]);
export const SERVICE_DEPARTMENT_CODES = SERVICE_DEPARTMENTS.map(([code]) => code);

export const DECLARATION_AM =
  'እኔ ስሜ ከላይ የተገለጸው አባል፤ በሳሎ ደብረ ጸሐይ ቅ/ጊዮርጊስ ቤ/ክ የሐመረ ሕይወት ሰ/ት/ቤት መተዳደሪያ ደንብ እና የኦርቶዶክስ ተዋሕዶ እምነት ስርዓት መሰረት በታማኝነት ለማገልገል፣ በመርሐ ግብራት ላይ በትጋት ለመገኘትና የአባልነት ግዴታዬን ለመወጣት ቃል እገባለሁ።';
export const DECLARATION_EN =
  'I, the member named above, promise to serve faithfully according to the by-laws of Hamere Hiwot Sunday School of Salo Debre Tsehay St. George Church and the order of the Orthodox Tewahedo faith, to attend the programmes diligently and to fulfil my duties as a member.';

/** The member's declaration; `school` [en, am] for Sunday schools other than Hamere Hiwot. */
export function declaration(locale: string, school: [string, string] | null): string {
  if (!school) return locale === 'am' ? DECLARATION_AM : DECLARATION_EN;
  return locale === 'am'
    ? `እኔ ስሜ ከላይ የተገለጸው አባል፤ በ${school[1]} መተዳደሪያ ደንብ እና የኦርቶዶክስ ተዋሕዶ እምነት ስርዓት መሰረት በታማኝነት ለማገልገል፣ በመርሐ ግብራት ላይ በትጋት ለመገኘትና የአባልነት ግዴታዬን ለመወጣት ቃል እገባለሁ።`
    : `I, the member named above, promise to serve faithfully according to the by-laws of ${school[0]} and the order of the Orthodox Tewahedo faith, to attend the programmes diligently and to fulfil my duties as a member.`;
}

/** Photos for the "ፎቶግራፍ" box */
export const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Label of a [code, English, Amharic] choice. */
export function choiceLabel(list: [string, string, string][], code: string | null | undefined, locale: string): string {
  const found = list.find(([c]) => c === code);
  return found ? (locale === 'am' ? found[2] : found[1]) : '';
}

/** Age in whole years from a Gregorian ISO birth date ("ዕድሜ"), or null. */
export function ageFrom(dateOfBirth: string | null | undefined, today = todayIso()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth ?? '');
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!m || !n) return null;
  const age = Number(n[1]) - Number(m[1]) - (n[2] + n[3] < m[2] + m[3] ? 1 : 0);
  return age >= 0 && age < 130 ? age : null;
}
