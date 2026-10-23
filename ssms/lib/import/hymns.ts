// ─────────────────────────────────────────────────────────────────────────────
// Hymn import from the template (Sacred Arts → Hymn Library → Import):
// one hymn per row — Amharic title (required), English title, type, feast,
// lyrics (several lines in one cell), notes. The header row is found by its
// names (Amharic or English), so a CSV or a re-arranged sheet also works.
// The example row is skipped; titles already in the library or twice in the
// file are not imported again. Pure functions — no browser or file APIs.
// ─────────────────────────────────────────────────────────────────────────────

import { HYMN_CATEGORIES, type HymnCategory } from '@/lib/choir/types';

export const MAX_HYMN_IMPORT = 500;
const MAX_LYRICS = 20_000;
const EXAMPLE_MARK = 'ምሳሌ (example)';

export const HYMN_TEMPLATE_HEADERS = [
  'ርዕስ (አማርኛ) · Title (Amharic) *',
  'ርዕስ (እንግሊዝኛ) · Title (English)',
  'ዓይነት · Type',
  'በዓል · Feast',
  'ግጥም · Lyrics',
  'ማስታወሻ · Notes',
];

export const HYMN_TEMPLATE_EXAMPLE = [
  'እግዚአብሔር ብርሃኔ ነው',
  'The Lord is my light',
  'መዝሙር',
  'ጥምቀት',
  'እግዚአብሔር ብርሃኔ ነው\nመድኃኒቴም ነው\nማንን እፈራለሁ',
  `${EXAMPLE_MARK} — ይህ ረድፍ አይገባም · this row is skipped`,
];

/** Header words → field (checked in order; the first column that matches wins). */
const COLUMNS: [field: Field, re: RegExp][] = [
  ['title_am', /ርዕስ\s*\(አማርኛ\)|title\s*\(amharic\)|^ርዕስ$|^title_am$/i],
  ['title_en', /ርዕስ\s*\(እንግሊዝኛ\)|title\s*\(english\)|^title$|^title_en$/i],
  ['category', /ዓይነት|አይነት|type|category/i],
  ['feast', /በዓል|በአል|feast/i],
  ['lyrics', /ግጥም|lyrics|words/i],
  ['notes', /ማስታወሻ|notes?/i],
];
type Field = 'title_am' | 'title_en' | 'category' | 'feast' | 'lyrics' | 'notes';

export interface HymnDraft {
  title_am: string;
  title_en: string;
  category: HymnCategory;
  feast: string;
  lyrics: string;
  notes: string;
  is_active: boolean;
}

export interface HymnImportRow {
  /** Row number as shown in Excel */
  rowNumber: number;
  title: string;
  category: HymnCategory | null;
  errors: string[];
  warnings: string[];
  draft: HymnDraft | null;
}

export type HymnImportResult = { ok: false; noHeader: true } | { ok: true; rows: HymnImportRow[]; tooMany: boolean };

const text = (v: unknown) => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').trim();
/** For comparing titles: case, spaces and the Amharic letters that sound alike (ሐ/ኀ→ሀ, ሠ→ሰ, ዐ→አ, ፀ→ጸ). */
export function titleKey(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()) {
    const c = ch.codePointAt(0)!;
    const shift =
      c >= 0x1210 && c <= 0x1217 ? -0x10 :
      c >= 0x1280 && c <= 0x1287 ? -0x80 :
      c >= 0x1220 && c <= 0x1227 ? 0x10 :
      c >= 0x12d0 && c <= 0x12d7 ? -0x30 :
      c >= 0x1340 && c <= 0x1347 ? -0x08 : 0;
    out += String.fromCodePoint(c + shift);
  }
  return out.replace(/[።፣፤,.!?'"]/g, '');
}

/** "መዝሙር", "Mezmur", "Mezmur (hymn)", "MEZMUR" → MEZMUR */
function categoryOf(value: string): HymnCategory | null {
  const v = titleKey(value);
  if (!v) return 'MEZMUR';
  for (const [code, [en, am]] of Object.entries(HYMN_CATEGORIES) as [HymnCategory, [string, string]][]) {
    if (v === code.toLowerCase() || v === titleKey(am) || v === titleKey(en) || v === titleKey(en.split(' (')[0])) return code;
  }
  return null;
}

export function parseHymnImport(rows: unknown[][], existingTitles: string[], t: (en: string, am: string) => string): HymnImportResult {
  const headerIndex = rows.slice(0, 20).findIndex((r) => r.some((c) => COLUMNS[0][1].test(text(c))));
  if (headerIndex < 0) return { ok: false, noHeader: true };
  const header = rows[headerIndex].map(text);
  const col = {} as Record<Field, number>;
  for (const [field, re] of COLUMNS) col[field] = header.findIndex((h, i) => re.test(h) && !Object.values(col).includes(i));

  const existing = new Set(existingTitles.map(titleKey));
  const seen = new Map<string, number>();
  const out: HymnImportRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    const get = (f: Field) => (col[f] >= 0 ? text(raw[col[f]]) : '');
    const values = { title_am: get('title_am'), title_en: get('title_en'), category: get('category'), feast: get('feast'), lyrics: get('lyrics'), notes: get('notes') };
    if (Object.values(values).every((v) => !v)) continue;
    if (values.notes.startsWith(EXAMPLE_MARK)) continue;

    const errors: string[] = [];
    const warnings: string[] = [];
    const key = titleKey(values.title_am);
    if (values.title_am.length < 2) errors.push(t('The Amharic title is missing', 'የአማርኛ ርዕስ የለም'));
    else if (existing.has(key)) errors.push(t('Already in the library', 'በማውጫው ውስጥ አለ'));
    else if (seen.has(key)) errors.push(t(`Same title as row ${seen.get(key)}`, `ከረድፍ ${seen.get(key)} ጋር አንድ ርዕስ`));
    let category = categoryOf(values.category);
    if (!category) {
      warnings.push(t(`Type “${values.category}” is not known — saved as Other`, `ዓይነቱ «${values.category}» አልታወቀም — እንደ «ሌላ» ተቀምጧል`));
      category = 'OTHER';
    }
    if (values.lyrics.length > MAX_LYRICS) warnings.push(t('The lyrics were very long and were cut', 'ግጥሙ በጣም ረጅም ስለሆነ ተቆርጧል'));
    if (!values.lyrics) warnings.push(t('No lyrics yet', 'ግጥም የለም'));
    if (key && !seen.has(key)) seen.set(key, i + 1);

    out.push({
      rowNumber: i + 1,
      title: values.title_am || values.title_en,
      category,
      errors,
      warnings,
      draft: errors.length
        ? null
        : {
            title_am: values.title_am.slice(0, 200),
            title_en: values.title_en.slice(0, 200),
            category,
            feast: values.feast.slice(0, 80),
            lyrics: values.lyrics.slice(0, MAX_LYRICS),
            notes: values.notes.slice(0, 1000),
            is_active: true,
          },
    });
  }
  return { ok: true, rows: out, tooMany: out.length > MAX_HYMN_IMPORT };
}
