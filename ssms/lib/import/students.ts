// ─────────────────────────────────────────────────────────────────────────────
// Student bulk import: header mapping, row validation, and the template.
// Pure functions — no browser or file APIs — so they are easy to test.
// ─────────────────────────────────────────────────────────────────────────────

import { parseIsoDate, toIsoDate } from '@/lib/utils/ethiopian-calendar';
import type { Student, StudentGender } from '@/lib/students/store';

export const MAX_IMPORT_ROWS = 1000;

export type ImportField =
  | 'name_en'
  | 'name_am'
  | 'baptismal'
  | 'gender'
  | 'class'
  | 'parent'
  | 'phone'
  | 'enrollment_date';

const REQUIRED_FIELDS: ImportField[] = ['name_en', 'gender', 'class'];

/** Header text (normalized) → field. Includes the Amharic column names. */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  name_en: ['name english', 'name en', 'name_en', 'english name', 'student name', 'full name', 'name'],
  name_am: ['name amharic', 'name am', 'name_am', 'amharic name', 'ስም በአማርኛ', 'የአማርኛ ስም'],
  baptismal: ['baptismal name', 'baptismal', 'christian name', 'የክርስትና ስም'],
  gender: ['gender', 'sex', 'ፆታ'],
  class: ['class', 'grade', 'class name', 'ክፍል'],
  parent: ['parent guardian', 'parent', 'guardian', 'parent name', 'guardian name', 'ወላጅ'],
  phone: ['guardian phone', 'phone', 'phone number', 'mobile', 'parent phone', 'ስልክ'],
  enrollment_date: ['enrollment date', 'enrollment_date', 'enrolled', 'date enrolled'],
};

export interface ClassRef {
  id: string;
  name_en: string;
  name_am: string;
  grade_level: number;
}

export type StudentDraft = Omit<Student, 'id' | 'reg_no'>;

export interface ImportRowResult {
  /** Row number as shown in Excel (the header is row 1) */
  rowNumber: number;
  cells: string[];
  errors: string[];
  draft: StudentDraft | null;
}

export interface ImportParseResult {
  /** Problems that stop the whole file (missing columns, too many rows) */
  fileErrors: string[];
  results: ImportRowResult[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Turn any spreadsheet cell into trimmed text. Dates become YYYY-MM-DD (UTC, as Excel stores them). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ''
      : toIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  return String(value).trim();
}

export function mapHeaders(headerRow: unknown[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {};
  headerRow.forEach((cell, index) => {
    const key = normalize(cellText(cell));
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
      if (map[field] === undefined && aliases.includes(key)) {
        map[field] = index;
        break;
      }
    }
  });
  return map;
}

export function parseGender(text: string): StudentGender | null {
  const g = normalize(text);
  if (['m', 'male', 'man', 'boy', 'ወንድ'].includes(g)) return 'MALE';
  if (['f', 'female', 'woman', 'girl', 'ሴት'].includes(g)) return 'FEMALE';
  return null;
}

/** Ethiopian mobile numbers → +251XXXXXXXXX. Returns null when the format is wrong. */
export function normalizePhone(text: string): string | null {
  const digits = text.replace(/[\s\-().]/g, '');
  const match = /^(?:\+?251|0)?([79]\d{8})$/.exec(digits);
  return match ? `+251${match[1]}` : null;
}

export type ClassMatch = { ok: true; cls: ClassRef } | { ok: false; reason: string };

/** Match by id, full name (English or Amharic), "Grade 3" prefix, or just the grade number. */
export function matchClass(text: string, classes: ClassRef[]): ClassMatch {
  const q = normalize(text);
  if (!q) return { ok: false, reason: 'Class is required' };

  const exact = classes.filter(
    (c) => normalize(c.id) === q || normalize(c.name_en) === q || normalize(c.name_am) === q
  );
  if (exact.length === 1) return { ok: true, cls: exact[0] };

  const prefix = classes.filter(
    (c) => normalize(c.name_en).startsWith(`${q} `) || normalize(c.name_am).startsWith(`${q} `)
  );
  if (prefix.length === 1) return { ok: true, cls: prefix[0] };

  if (/^\d+$/.test(q)) {
    const byLevel = classes.filter((c) => c.grade_level === Number(q));
    if (byLevel.length === 1) return { ok: true, cls: byLevel[0] };
    if (byLevel.length > 1) return { ok: false, reason: `Grade ${q} matches more than one class — use the full class name` };
  }
  if (exact.length > 1 || prefix.length > 1) {
    return { ok: false, reason: `"${text}" matches more than one class — use the full class name` };
  }
  return { ok: false, reason: `Class "${text}" not found` };
}

const dupKey = (nameEn: string, parent: string) => `${normalize(nameEn)}|${normalize(parent)}`;

// ── main entry ───────────────────────────────────────────────────────────────

export function parseStudentImport(
  rows: unknown[][],
  ctx: { classes: ClassRef[]; existing: Pick<Student, 'name_en' | 'parent' | 'reg_no'>[]; today: string }
): ImportParseResult {
  const fileErrors: string[] = [];
  if (rows.length === 0) return { fileErrors: ['The file is empty.'], results: [] };

  const columns = mapHeaders(rows[0]);
  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);
  if (missing.length) {
    fileErrors.push(
      `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
        'Download the template to see the expected headers.'
    );
  }

  const dataRows = rows.slice(1).filter((r) => r.some((c) => cellText(c) !== ''));
  if (dataRows.length === 0 && fileErrors.length === 0) fileErrors.push('No student rows found under the header.');
  if (dataRows.length > MAX_IMPORT_ROWS) {
    fileErrors.push(`Too many rows (${dataRows.length}). Import at most ${MAX_IMPORT_ROWS} students at a time.`);
  }
  if (fileErrors.length) return { fileErrors, results: [] };

  const get = (row: unknown[], field: ImportField) =>
    columns[field] === undefined ? '' : cellText(row[columns[field] as number]);

  const seen = new Map<string, number>(); // dup key → first row number in this file
  const existing = new Map(ctx.existing.map((s) => [dupKey(s.name_en, s.parent), s.reg_no]));
  const results: ImportRowResult[] = [];

  rows.slice(1).forEach((row, i) => {
    if (!row.some((c) => cellText(c) !== '')) return; // skip blank lines, keep numbering
    const rowNumber = i + 2;
    const errors: string[] = [];

    const nameEn = get(row, 'name_en');
    if (nameEn.length < 2) errors.push('English name is required');

    const gender = parseGender(get(row, 'gender'));
    if (!gender) errors.push(`Gender must be Male or Female (got "${get(row, 'gender')}")`);

    const classMatch = matchClass(get(row, 'class'), ctx.classes);
    if (!classMatch.ok) errors.push(classMatch.reason);

    const rawPhone = get(row, 'phone');
    let phone = '';
    if (rawPhone) {
      const normalized = normalizePhone(rawPhone);
      if (normalized) phone = normalized;
      else errors.push(`Phone "${rawPhone}" is not a valid Ethiopian mobile number`);
    }

    const rawDate = get(row, 'enrollment_date');
    let enrollment = ctx.today;
    if (rawDate) {
      if (parseIsoDate(rawDate)) enrollment = rawDate.slice(0, 10);
      else errors.push(`Enrollment date "${rawDate}" must be YYYY-MM-DD`);
    }

    const parent = get(row, 'parent');
    if (nameEn.length >= 2) {
      const key = dupKey(nameEn, parent);
      const firstSeen = seen.get(key);
      if (firstSeen !== undefined) errors.push(`Duplicate of row ${firstSeen} in this file`);
      else if (existing.has(key)) errors.push(`Already enrolled as ${existing.get(key)}`);
      if (firstSeen === undefined) seen.set(key, rowNumber);
    }

    const draft: StudentDraft | null =
      errors.length === 0 && gender && classMatch.ok
        ? {
            name_en: nameEn,
            name_am: get(row, 'name_am') || nameEn,
            baptismal: get(row, 'baptismal') || nameEn.split(' ')[0],
            gender,
            class: classMatch.cls.name_en,
            class_id: classMatch.cls.id,
            grade_level: classMatch.cls.grade_level,
            status: 'ACTIVE',
            enrollment_date: enrollment,
            parent,
            phone,
          }
        : null;

    results.push({
      rowNumber,
      cells: row.map(cellText),
      errors,
      draft,
    });
  });

  return { fileErrors, results };
}

// ── template ─────────────────────────────────────────────────────────────────

export const TEMPLATE_HEADERS = [
  'Name (English)',
  'Name (Amharic)',
  'Baptismal name',
  'Gender',
  'Class',
  'Parent / Guardian',
  'Guardian phone',
  'Enrollment date',
];

export const TEMPLATE_EXAMPLES: string[][] = [
  ['Abel Tesfaye', 'አቤል ተስፋዬ', 'Abel', 'Male', 'Grade 1', 'Tesfaye Bekele', '0911223344', '2026-09-06'],
  ['Selam Kebede', 'ሰላም ከበደ', 'Selam', 'Female', 'Grade 3', 'Kebede Alemu', '+251922334455', ''],
];
