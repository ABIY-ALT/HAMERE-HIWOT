// ─────────────────────────────────────────────────────────────────────────────
// Library book import from the template (Library → Books → Import): one title
// per row with how many copies the library has. Header names in Amharic or
// English; the example row is skipped; a title (with the same author) already
// in the catalogue or twice in the file is not imported again — add copies to
// it instead. Pure functions — no browser or file APIs.
// ─────────────────────────────────────────────────────────────────────────────

import { BOOK_AUDIENCES, BOOK_CATEGORIES, BOOK_LANGUAGES, type BookAudience, type BookLanguage, type CopySource } from '@/lib/library/types';
import { titleKey } from '@/lib/import/hymns';

export const MAX_BOOK_IMPORT = 1000;
const EXAMPLE_MARK = 'ምሳሌ (example)';

export const BOOK_TEMPLATE_HEADERS = [
  'ርዕስ · Title *',
  'ደራሲ · Author',
  'ምድብ · Category',
  'ቋንቋ · Language',
  'ለማን · Audience',
  'መደርደሪያ · Shelf',
  'የቅጂዎች ብዛት · Copies',
  'የተገኘበት · Source (ግዢ / ስጦታ)',
  'ለጋሽ · Donor',
  'አሳታሚ · Publisher',
  'የታተመበት ዓመት · Year',
  'ISBN',
  'መግለጫ · Description',
];

export const BOOK_TEMPLATE_EXAMPLE = [
  'ትምህርተ ሃይማኖት', 'ማኅበረ ቅዱሳን', 'ትምህርተ ሃይማኖት', 'አማርኛ', 'ለሁሉም', 'A-1', 3, 'ግዢ', '', '', 2010, '',
  `${EXAMPLE_MARK} — ይህ ረድፍ አይገባም · this row is skipped`,
];

type Field = 'title' | 'author' | 'category' | 'language' | 'audience' | 'shelf' | 'copies' | 'source' | 'donor' | 'publisher' | 'year' | 'isbn' | 'description';

const COLUMNS: [Field, RegExp][] = [
  ['title', /ርዕስ|^title|title \*/i],
  ['author', /ደራሲ|author/i],
  ['category', /ምድብ|category/i],
  ['language', /ቋንቋ|language/i],
  ['audience', /ለማን|audience/i],
  ['shelf', /መደርደሪያ|shelf/i],
  ['copies', /ቅጂ|copies|quantity|ብዛት/i],
  ['source', /የተገኘበት|source/i],
  ['donor', /ለጋሽ|donor/i],
  ['publisher', /አሳታሚ|publisher/i],
  ['year', /ዓመት|year/i],
  ['isbn', /isbn/i],
  ['description', /መግለጫ|description|notes?/i],
];

export interface BookDraft {
  title: string;
  subtitle: string;
  author: string;
  category: string;
  language: BookLanguage;
  audience: BookAudience;
  isbn: string;
  publisher: string;
  published_year: number | '';
  shelf: string;
  description: string;
  is_active: boolean;
  copies: { count: number; source: CopySource; donor: string; acquired_on: string; condition: 'GOOD' };
}

export interface BookImportRow {
  rowNumber: number;
  title: string;
  author: string;
  copies: number;
  errors: string[];
  warnings: string[];
  draft: BookDraft | null;
}

export type BookImportResult = { ok: false; noHeader: true } | { ok: true; rows: BookImportRow[]; tooMany: boolean };

const text = (v: unknown) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

/** A label of a list (Amharic, English or its key) → its key */
function pick<K extends string>(list: Record<K, [string, string]>, value: string): K | null {
  const v = titleKey(value);
  for (const [key, [en, am]] of Object.entries(list) as [K, [string, string]][]) {
    if (v === key.toLowerCase() || v === titleKey(am) || v === titleKey(en) || titleKey(en).startsWith(v) && v.length >= 4) return key;
  }
  return null;
}

function sourceOf(value: string): CopySource | null {
  const v = titleKey(value);
  if (!v || /ግዢ|የተገዛ|purchase|bought|buy/.test(v)) return 'PURCHASE';
  if (/ስጦታ|ልገሳ|donat|gift/.test(v)) return 'DONATION';
  if (/ሌላ|other/.test(v)) return 'OTHER';
  return null;
}

export function parseBookImport(rows: unknown[][], existing: { title: string; author: string }[], t: (en: string, am: string) => string): BookImportResult {
  const headerIndex = rows.slice(0, 20).findIndex((r) => r.some((c) => /ርዕስ|^title/i.test(text(c))) && r.some((c) => /ቅጂ|copies|ደራሲ|author/i.test(text(c))));
  if (headerIndex < 0) return { ok: false, noHeader: true };
  const header = rows[headerIndex].map(text);
  const col = {} as Record<Field, number>;
  for (const [field, re] of COLUMNS) col[field] = header.findIndex((h, i) => re.test(h) && !Object.values(col).includes(i));

  const key = (title: string, author: string) => `${titleKey(title)}|${titleKey(author)}`;
  const have = new Set(existing.map((b) => key(b.title, b.author)));
  const seen = new Map<string, number>();
  const out: BookImportRow[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    const get = (f: Field) => (col[f] >= 0 ? text(raw[col[f]]) : '');
    const v = Object.fromEntries(COLUMNS.map(([f]) => [f, get(f)])) as Record<Field, string>;
    if (Object.values(v).every((x) => !x)) continue;
    if (v.description.startsWith(EXAMPLE_MARK)) continue;

    const errors: string[] = [];
    const warnings: string[] = [];
    const k = key(v.title, v.author);
    if (v.title.length < 2) errors.push(t('The title is missing', 'ርዕሱ የለም'));
    else if (have.has(k)) errors.push(t('Already in the catalogue — add copies to it instead', 'በዝርዝሩ ውስጥ አለ — ቅጂ በእሱ ላይ ይጨምሩ'));
    else if (seen.has(k)) errors.push(t(`Same book as row ${seen.get(k)}`, `ከረድፍ ${seen.get(k)} ጋር አንድ መጽሐፍ`));

    let category = v.category ? pick(BOOK_CATEGORIES as Record<string, [string, string]>, v.category) : 'GENERAL';
    if (!category) {
      warnings.push(t(`Category “${v.category}” is not known — saved as General`, `ምድቡ «${v.category}» አልታወቀም — እንደ «አጠቃላይ» ተቀምጧል`));
      category = 'GENERAL';
    }
    let language = v.language ? pick(BOOK_LANGUAGES, v.language) : 'AM';
    if (!language) {
      warnings.push(t(`Language “${v.language}” is not known — saved as Other`, `ቋንቋው «${v.language}» አልታወቀም — እንደ «ሌላ» ተቀምጧል`));
      language = 'OTHER';
    }
    const audience = (v.audience ? pick(BOOK_AUDIENCES, v.audience) : 'ALL') ?? 'ALL';
    const copies = v.copies === '' ? 1 : Number(v.copies.replace(/,/g, ''));
    if (!Number.isInteger(copies) || copies < 0 || copies > 200) errors.push(t('Copies must be a whole number from 0 to 200', 'የቅጂዎች ብዛት ከ0 እስከ 200 ሙሉ ቁጥር መሆን አለበት'));
    const year = v.year === '' ? '' : Number(v.year);
    if (year !== '' && (!Number.isInteger(year) || year < 1000 || year > 2100)) errors.push(t(`Year “${v.year}” is not a year`, `«${v.year}» ዓመት አይደለም`));
    let source = sourceOf(v.source);
    if (!source) {
      warnings.push(t(`Source “${v.source}” is not known — saved as Other`, `የተገኘበት «${v.source}» አልታወቀም — እንደ «ሌላ» ተቀምጧል`));
      source = 'OTHER';
    }
    if (k && !seen.has(k)) seen.set(k, i + 1);

    out.push({
      rowNumber: i + 1,
      title: v.title,
      author: v.author,
      copies: Number.isInteger(copies) ? copies : 0,
      errors,
      warnings,
      draft: errors.length
        ? null
        : {
            title: v.title.slice(0, 300),
            subtitle: '',
            author: v.author.slice(0, 200),
            category,
            language,
            audience,
            isbn: v.isbn.slice(0, 40),
            publisher: v.publisher.slice(0, 200),
            published_year: year as number | '',
            shelf: v.shelf.slice(0, 60),
            description: v.description.slice(0, 2000),
            is_active: true,
            copies: { count: copies, source, donor: source === 'DONATION' ? v.donor.slice(0, 200) : '', acquired_on: '', condition: 'GOOD' },
          },
    });
  }
  return { ok: true, rows: out, tooMany: out.length > MAX_BOOK_IMPORT };
}
