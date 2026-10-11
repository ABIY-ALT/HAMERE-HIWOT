// ─────────────────────────────────────────────────────────────────────────────
// Asset import from the official Hamere Hiwot template
// (public/templates/asset_import_template.xlsx): template check, mapping of
// the template's Amharic lists onto the app's values, and row validation.
// Pure functions — no browser or file APIs — so they are easy to test.
// ─────────────────────────────────────────────────────────────────────────────

import { ethiopianToIso, isoToEthiopian } from '@/lib/utils/ethiopian-calendar';
import type { AcquisitionType, AssetCondition } from '@/lib/property/types';
import { SCHOOL_DEPARTMENTS } from '@/lib/organization/departments';

export const TEMPLATE_URL = '/templates/asset_import_template.xlsx';
export const TEMPLATE_FILE_NAME = 'ንብረት_መመዝገቢያ_ቅጽ.xlsx';
export const TEMPLATE_SHEET = 'የንብረት መዝገብ';
/** Header cells that identify the template (the check required before importing). */
export const REQUIRED_HEADERS = ['የንብረቱ ስም', 'ምድብ', 'ባለቤት ክፍል', 'ብዛት', 'የአንዱ ዋጋ (ብር)'];
const EXAMPLE_MARK = 'ምሳሌ';
const TOTALS_MARK = 'ድምር';
export const MAX_IMPORT_ROWS = 500;

/** The template's "ባለቤት ክፍል" list (and the per-department files), mapped onto organization units. */
export const TEMPLATE_DEPARTMENTS = SCHOOL_DEPARTMENTS;

/** Template category → ASSET_CATEGORIES key. `keep` = also write the template's category in the notes. */
const CATEGORY_MAP: Record<string, { category: string; keep?: boolean }> = {
  'የዜማ መሣሪያዎች': { category: 'Musical instruments' },
  'ኤሌክትሮኒክስ': { category: 'IT equipment' },
  'የድምፅ መሣሪያዎች': { category: 'Audio-visual & sound' },
  'የቤት ዕቃዎች': { category: 'Furniture' },
  'መጻሕፍትና የትምህርት መርጃ': { category: 'Books & library' },
  'አልባሳት (ካባ፣ ቀሚስ)': { category: 'Liturgical items & vestments' },
  'የዲኮር ዕቃዎች': { category: 'Other', keep: true },
  'የጽሕፈት መሣሪያዎች': { category: 'Other', keep: true },
  'ፍጆታ ዕቃዎች': { category: 'Other', keep: true },
};

type SourceEntry = { type: AcquisitionType; keep?: boolean };
const SOURCE_MAP: Record<string, SourceEntry> = {
  'ግዢ': { type: 'PURCHASE' },
  'ስጦታ / ልገሳ': { type: 'DONATION' },
  'በአባላት የተሠራ': { type: 'OTHER', keep: true },
  'ከደብሩ የተሰጠ': { type: 'DONATION', keep: true },
};

/** "የጠፋ" (lost) is a status in the app, not a condition. */
type ConditionEntry = { condition: AssetCondition; lost?: boolean; keep?: boolean };
const CONDITION_MAP: Record<string, ConditionEntry> = {
  'አዲስ': { condition: 'NEW' },
  'ጥሩ': { condition: 'GOOD' },
  'መጠነኛ': { condition: 'FAIR' },
  'ጥገና ያስፈልገዋል': { condition: 'POOR', keep: true },
  'የተበላሸ': { condition: 'DAMAGED' },
  'የጠፋ': { condition: 'FAIR', lost: true, keep: true },
};

/** Header text → field. Only the five REQUIRED_HEADERS must be present. */
const COLUMNS = {
  code: 'የንብረት ኮድ',
  name: 'የንብረቱ ስም',
  description: 'ዝርዝር መግለጫ (ዓይነት፣ ሞዴል፣ ቀለም)',
  category: 'ምድብ',
  department: 'ባለቤት ክፍል',
  quantity: 'ብዛት',
  measure: 'መለኪያ',
  price: 'የአንዱ ዋጋ (ብር)',
  source: 'የተገኘበት መንገድ',
  year: 'የተገኘበት ዓ.ም',
  condition: 'ያለበት ሁኔታ',
  location: 'የሚገኝበት ቦታ',
  custodian: 'ኃላፊ (ተረካቢ)',
  notes: 'ማስታወሻ',
} as const;
type Column = keyof typeof COLUMNS;
const INPUT_COLUMNS: Column[] = ['name', 'description', 'category', 'department', 'quantity', 'measure', 'price', 'source', 'year', 'condition', 'location', 'custodian', 'notes'];

export interface AssetImportDraft {
  /** The template's code (HH-MZ-001); empty → the database gives an AST- tag */
  tag: string;
  name: string;
  category: string;
  unit_id: string;
  custodian_id: string;
  condition: AssetCondition;
  lost: boolean;
  location: string;
  acquired_on: string;
  acquisition_type: AcquisitionType;
  value: number;
  notes: string;
}

export interface AssetImportRow {
  /** Row number as shown in Excel */
  rowNumber: number;
  name: string;
  department: string;
  quantity: string;
  errors: string[];
  warnings: string[];
  draft: AssetImportDraft | null;
}

export type AssetImportResult = { ok: false; notTemplate: true } | { ok: true; rows: AssetImportRow[]; tooMany: boolean };

export interface AssetImportContext {
  units: { id: string; code: string }[];
  people: { id: string; name: string; name_am: string }[];
  existingTags: string[];
  today: string;
  t: (en: string, am: string) => string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * Amharic spelling variants that sound the same (ሐ/ኀ → ሀ, ሠ → ሰ, ዐ → አ, ፀ → ጸ),
 * so a pasted "ህጻናት ክፍል" still matches "ሕጻናት ክፍል".
 */
function fold(s: string): string {
  let out = '';
  for (const ch of clean(s).toLowerCase()) {
    const c = ch.codePointAt(0)!;
    const shift =
      c >= 0x1210 && c <= 0x1217 ? -0x10 :
      c >= 0x1280 && c <= 0x1287 ? -0x80 :
      c >= 0x1220 && c <= 0x1227 ? 0x10 :
      c >= 0x12d0 && c <= 0x12d7 ? -0x30 :
      c >= 0x1340 && c <= 0x1347 ? -0x08 : 0;
    out += String.fromCodePoint(c + shift);
  }
  return out.replace(/\s*\/\s*/g, '/');
}

function lookup<T>(map: Record<string, T>, text: string): T | undefined {
  const key = fold(text);
  for (const [label, value] of Object.entries(map)) if (fold(label) === key) return value;
  return undefined;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return clean(String(value));
}

/** 6500, "6,500" or "6,500 ብር" → 6500. Empty → null, junk → NaN. */
function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  const text = cellText(value).replace(/,/g, '').replace(/ብር|birr|etb/gi, '').trim();
  if (!text) return null;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Template departments mapped onto an organization unit (for the per-department download). */
export function templateDepartmentsForUnit(unitCode: string | undefined) {
  return unitCode ? TEMPLATE_DEPARTMENTS.filter((d) => d.unitCode === unitCode) : [];
}

// ── parse ────────────────────────────────────────────────────────────────────

/** Find the template sheet and its header row; null when the file is not the template. */
function findTemplate(sheets: { sheet: string; data: unknown[][] }[]) {
  const sheet = sheets.find((s) => clean(s.sheet) === TEMPLATE_SHEET);
  if (!sheet) return null;
  const headerIndex = sheet.data.slice(0, 30).findIndex((row) => {
    const cells = row.map(cellText);
    return REQUIRED_HEADERS.every((h) => cells.includes(h));
  });
  if (headerIndex < 0) return null;
  const header = sheet.data[headerIndex].map(cellText);
  const col = Object.fromEntries(
    (Object.keys(COLUMNS) as Column[]).map((k) => [k, header.indexOf(COLUMNS[k])])
  ) as Record<Column, number>;
  return { data: sheet.data, headerIndex, col };
}

export function parseAssetTemplate(sheets: { sheet: string; data: unknown[][] }[], ctx: AssetImportContext): AssetImportResult {
  const found = findTemplate(sheets);
  if (!found) return { ok: false, notTemplate: true };
  const { data, headerIndex, col } = found;
  const { t } = ctx;

  const unitByCode = new Map(ctx.units.map((u) => [u.code, u.id]));
  const peopleByName = new Map<string, string>();
  for (const p of ctx.people) {
    if (p.name) peopleByName.set(fold(p.name), p.id);
    if (p.name_am) peopleByName.set(fold(p.name_am), p.id);
  }
  const existingTags = new Set(ctx.existingTags.map((x) => x.toUpperCase()));
  const seenTags = new Map<string, number>();
  const currentYear = isoToEthiopian(ctx.today)?.year ?? 9999;

  const rows: AssetImportRow[] = [];
  for (let i = headerIndex + 1; i < data.length; i++) {
    const raw = data[i] ?? [];
    const get = (k: Column) => (col[k] >= 0 ? raw[col[k]] : null);
    const text = (k: Column) => cellText(get(k));

    if (cellText(raw[0]) === EXAMPLE_MARK) continue;
    if (text('name') === TOTALS_MARK) break;
    // Every row has formulas (code, totals…), so a row is empty when nothing was typed into it
    if (INPUT_COLUMNS.every((k) => text(k) === '')) continue;

    const rowNumber = i + 1;
    const errors: string[] = [];
    const warnings: string[] = [];
    const notes: string[] = [];

    const name = text('name');
    if (name.length < 2) errors.push(t('Item name (የንብረቱ ስም) is missing', 'የንብረቱ ስም አልተሞላም'));
    if (text('description')) notes.push(text('description'));

    const categoryText = text('category');
    const category = lookup(CATEGORY_MAP, categoryText);
    if (!categoryText) errors.push(t('Choose a category (ምድብ)', 'ምድብ አልተመረጠም'));
    else if (!category) errors.push(t(`Unknown category "${categoryText}"`, `«${categoryText}» የሚባል ምድብ የለም`));
    else if (category.keep) notes.push(`ምድብ በቅጹ፦ ${categoryText}`);

    const departmentText = text('department');
    const department = TEMPLATE_DEPARTMENTS.find((d) => fold(d.name) === fold(departmentText));
    const unitId = department ? unitByCode.get(department.unitCode) : undefined;
    if (!departmentText) errors.push(t('Choose the owner department (ባለቤት ክፍል)', 'ባለቤት ክፍል አልተመረጠም'));
    else if (!department) errors.push(t(`Unknown department "${departmentText}"`, `«${departmentText}» የሚባል ክፍል የለም`));
    else if (!unitId) errors.push(t(`"${departmentText}" is not set up in the system yet (unit ${department.unitCode})`, `«${departmentText}» በሲስተሙ ውስጥ ገና አልተመዘገበም (${department.unitCode})`));

    const quantity = parseNumber(get('quantity'));
    const price = parseNumber(get('price'));
    if (quantity === null) errors.push(t('Quantity (ብዛት) is missing', 'ብዛት አልተሞላም'));
    else if (Number.isNaN(quantity) || quantity <= 0) errors.push(t(`Quantity "${text('quantity')}" must be a number above 0`, `ብዛት «${text('quantity')}» ከ0 በላይ ቁጥር መሆን አለበት`));
    if (price === null) errors.push(t('Unit price (የአንዱ ዋጋ) is missing — estimate it for gifts', 'የአንዱ ዋጋ አልተሞላም — ለስጦታ ግምት ይጻፉ'));
    else if (Number.isNaN(price) || price < 0) errors.push(t(`Unit price "${text('price')}" must be a number`, `የአንዱ ዋጋ «${text('price')}» ቁጥር መሆን አለበት`));
    const measure = text('measure');
    const value = quantity && price !== null && !Number.isNaN(quantity) && !Number.isNaN(price) ? Math.round(quantity * price * 100) / 100 : 0;
    if (value > 1_000_000_000) errors.push(t('Total value is too large', 'ጠቅላላ ዋጋው በጣም ትልቅ ነው'));
    if (quantity && quantity !== 1 && price !== null) notes.push(`ብዛት፦ ${fmt(quantity)} ${measure} × ${fmt(price)} ብር`.replace(/\s+/g, ' '));

    const sourceText = text('source');
    const source: SourceEntry | undefined = sourceText ? lookup(SOURCE_MAP, sourceText) : { type: 'OTHER' };
    if (!source) errors.push(t(`Unknown acquisition "${sourceText}"`, `«${sourceText}» የሚባል የተገኘበት መንገድ የለም`));
    else if (source.keep) notes.push(`የተገኘበት መንገድ፦ ${sourceText}`);

    let acquiredOn = '';
    const year = parseNumber(get('year'));
    if (year !== null) {
      if (Number.isNaN(year) || !Number.isInteger(year) || year < 1900 || year > currentYear) {
        errors.push(t(`Year "${text('year')}" must be an Ethiopian year such as 2017`, `ዓመት «${text('year')}» በኢትዮጵያ አቆጣጠር መሆን አለበት (ለምሳሌ 2017)`));
      } else {
        // Only the year is known: stored as 1 Meskerem of that year
        acquiredOn = ethiopianToIso({ year, month: 1, day: 1 }) ?? '';
        notes.push(`የተገኘበት ዓ.ም፦ ${year}`);
      }
    }

    const conditionText = text('condition');
    const condition: ConditionEntry | undefined = conditionText ? lookup(CONDITION_MAP, conditionText) : { condition: 'GOOD' };
    if (!condition) errors.push(t(`Unknown condition "${conditionText}"`, `«${conditionText}» የሚባል ሁኔታ የለም`));
    else if (condition.keep) notes.push(`ሁኔታ በቅጹ፦ ${conditionText}`);

    const custodianText = text('custodian');
    const custodianId = custodianText ? peopleByName.get(fold(custodianText)) ?? '' : '';
    if (custodianText && !custodianId) {
      notes.push(`ኃላፊ (ተረካቢ)፦ ${custodianText}`);
      warnings.push(t(`Custodian "${custodianText}" is not a person in the system — kept in the notes`, `ኃላፊ «${custodianText}» በሲስተሙ ውስጥ የለም — በማስታወሻ ተቀምጧል`));
    }
    if (text('notes')) notes.push(text('notes'));

    // The code is a formula; a department it cannot look up gives #N/A
    const codeText = text('code').toUpperCase();
    const tag = /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(codeText) ? codeText : '';
    if (!tag) {
      warnings.push(t('No asset code in the file — the system will give one', 'በፋይሉ የንብረት ኮድ የለም — ሲስተሙ ይሰጣል'));
    } else if (seenTags.has(tag)) {
      errors.push(t(`Code ${tag} is also on row ${seenTags.get(tag)}`, `ኮድ ${tag} በረድፍ ${seenTags.get(tag)} ላይም አለ`));
    } else if (existingTags.has(tag)) {
      errors.push(t(`Code ${tag} is already in the register`, `ኮድ ${tag} ቀድሞ በመዝገቡ ውስጥ አለ`));
    }
    if (tag && !seenTags.has(tag)) seenTags.set(tag, rowNumber);

    const displayName = quantity && quantity !== 1 && !Number.isNaN(quantity) ? `${name} (${fmt(quantity)}${measure ? ` ${measure}` : ''})` : name;
    rows.push({
      rowNumber,
      name: displayName,
      department: departmentText,
      quantity: quantity === null || Number.isNaN(quantity) ? text('quantity') : `${fmt(quantity)}${measure ? ` ${measure}` : ''}`,
      errors,
      warnings,
      draft:
        errors.length > 0 || !category || !source || !condition || !unitId
          ? null
          : {
              tag,
              name: displayName,
              category: category.category,
              unit_id: unitId,
              custodian_id: custodianId,
              condition: condition.condition,
              lost: Boolean(condition.lost),
              location: text('location'),
              acquired_on: acquiredOn,
              acquisition_type: source.type,
              value,
              notes: notes.join('\n'),
            },
    });
  }
  return { ok: true, rows, tooMany: rows.length > MAX_IMPORT_ROWS };
}
