// ─────────────────────────────────────────────────────────────────────────────
// Students store (mock persistence)
//
// Students added by the enroll form or by an import are kept in the browser's
// localStorage and merged with the demo students. When Supabase is connected,
// replace the functions here (and the hook) — pages only use these names.
// ─────────────────────────────────────────────────────────────────────────────

import { MOCK_STUDENTS } from '@/lib/mock/modules';

export type StudentGender = 'MALE' | 'FEMALE';
export type StudentStatus = 'ACTIVE' | 'INACTIVE';

export interface Student {
  id: string;
  reg_no: string;
  name_en: string;
  name_am: string;
  baptismal: string;
  gender: StudentGender;
  class: string;
  class_id: string;
  grade_level: number;
  status: StudentStatus;
  enrollment_date: string; // Gregorian ISO
  parent: string;
  phone: string;
}

export const DEMO_STUDENTS = MOCK_STUDENTS as unknown as Student[];

const STORAGE_KEY = 'ssms_students_v1';
const CHANGE_EVENT = 'ssms-students-changed';

export function readRawStudents(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function parseStudents(raw: string): Student[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Student[]) : [];
  } catch {
    return [];
  }
}

export function subscribeStudents(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Add students. Returns false if the browser refused to store them. */
export function addStudents(students: Student[]): boolean {
  try {
    const existing = parseStudents(readRawStudents());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...students, ...existing]));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Replace a student saved in this browser. Returns false if it isn't one of them (or storage failed). */
export function replaceSavedStudent(student: Student): boolean {
  try {
    const saved = parseStudents(readRawStudents());
    if (!saved.some((s) => s.id === student.id)) return false;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(saved.map((s) => (s.id === student.id ? student : s)))
    );
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Demo students plus saved ones, saved first. */
export function mergeStudents(saved: Student[]): Student[] {
  return [...saved, ...DEMO_STUDENTS];
}

/**
 * Next registration numbers after the highest existing REG-YYYY-NNNN for that
 * year. Returns `count` numbers so a batch import never repeats one.
 */
export function nextRegNos(existing: Pick<Student, 'reg_no'>[], count: number, year: number): string[] {
  const prefix = `REG-${year}-`;
  let max = 0;
  for (const s of existing) {
    if (s.reg_no.startsWith(prefix)) {
      const n = Number(s.reg_no.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + i + 1).padStart(4, '0')}`);
}
