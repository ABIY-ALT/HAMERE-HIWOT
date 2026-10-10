// ─────────────────────────────────────────────────────────────────────────────
// Education module data shapes (what the pages render). Built from the
// database by app/dashboard/education/actions.ts, or from demo data.
// ─────────────────────────────────────────────────────────────────────────────

import type { Student } from '@/lib/students/store';
import type { AttendanceSession, AttendanceStatus } from '@/lib/attendance/store';

export type { Student, AttendanceSession, AttendanceStatus };

export type AcademicYearStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

/** One part of a grade and how many of the 100 marks it carries. */
export interface AssessmentPart {
  /** Stable id; kept when the part is renamed so earlier grades still match. */
  key: string;
  name_en: string;
  name_am: string;
  weight: number;
  /** 'attendance' = suggested from the student's roll calls. */
  source?: 'attendance';
}

export interface AcademicYear {
  id: string;
  name: string;
  name_am: string;
  start_date: string; // ISO date
  end_date: string;
  is_current: boolean;
  status: AcademicYearStatus;
  students_enrolled: number;
  /** How grades are made up this year. */
  scheme: AssessmentPart[];
}

export interface SchoolClass {
  id: string;
  name_en: string;
  name_am: string;
  grade_level: number;
  academic_year_id: string;
  teacher: string; // display name, '—' when none
  teacher_person_id: string | null;
  capacity: number;
  enrolled: number;
  room: string;
}

export interface Subject {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  min_grade: number;
  credits: number;
  instructor: string;
  syllabus: string;
  is_active: boolean;
}

export type GradeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A part's score as entered, with the marks the part carried at the time. */
export interface PartScore {
  key: string;
  max: number;
  score: number;
}

export interface GradeRow {
  id: string;
  student_id: string;
  student: string;
  student_am: string;
  reg_no: string;
  class: string;
  subject_id: string;
  subject: string;
  subject_am: string;
  term: number;
  scores: PartScore[];
  total: number;
  grade: string; // letter
  status: GradeStatus;
  approved_by: string;
}

/** Staff who can be assigned as class teachers (people with a system account). */
export interface Teacher {
  person_id: string;
  name: string;
}

export interface EducationData {
  /** The current academic year (or the latest one if none is marked current). */
  activeYearId: string | null;
  years: AcademicYear[];
  /** Classes of the active year. */
  classes: SchoolClass[];
  subjects: Subject[];
  /** Students with their class in the active year. */
  students: Student[];
  /** Roll-call sessions with per-student marks (active year). */
  sessions: AttendanceSession[];
  /** Grades of the active year. */
  grades: GradeRow[];
  teachers: Teacher[];
}

export const EMPTY_EDUCATION: EducationData = {
  activeYearId: null,
  years: [],
  classes: [],
  subjects: [],
  students: [],
  sessions: [],
  grades: [],
  teachers: [],
};

export function letterGrade(total: number): string {
  if (total >= 90) return 'A+';
  if (total >= 85) return 'A';
  if (total >= 80) return 'A-';
  if (total >= 75) return 'B+';
  if (total >= 70) return 'B';
  if (total >= 60) return 'C';
  if (total >= 50) return 'D';
  return 'F';
}

export const PASS_MARK = 60;

// ── Assessment scheme ────────────────────────────────────────────────────────

/** The scheme every year had before weights became configurable (migration 018). */
export const DEFAULT_SCHEME: AssessmentPart[] = [
  { key: 'continuous', name_en: 'Continuous assessment', name_am: 'ተከታታይ ምዘና', weight: 30 },
  { key: 'final', name_en: 'Final exam', name_am: 'የማጠቃለያ ፈተና', weight: 70 },
];

export const MAX_PARTS = 8;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reads a stored scheme, falling back to the default when it is missing or malformed. */
export function parseScheme(value: unknown): AssessmentPart[] {
  if (!Array.isArray(value)) return DEFAULT_SCHEME;
  const parts = value
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .map((p) => ({
      key: String(p.key ?? ''),
      name_en: String(p.name_en ?? ''),
      name_am: String(p.name_am ?? '') || String(p.name_en ?? ''),
      weight: Number(p.weight),
      ...(p.source === 'attendance' ? { source: 'attendance' as const } : {}),
    }))
    .filter((p) => p.key && p.name_en && p.weight > 0);
  return parts.length ? parts : DEFAULT_SCHEME;
}

/** Reads stored part scores; grades from before migration 018 come as continuous + final. */
export function parseScores(value: unknown, legacy?: { continuous: unknown; final: unknown }): PartScore[] {
  if (Array.isArray(value) && value.length) {
    return value
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
      .map((s) => ({ key: String(s.key ?? ''), max: Number(s.max) || 0, score: Number(s.score) || 0 }))
      .filter((s) => s.key);
  }
  if (!legacy) return [];
  return [
    { key: 'continuous', max: 30, score: Number(legacy.continuous) || 0 },
    { key: 'final', max: 70, score: Number(legacy.final) || 0 },
  ];
}

export const schemeTotal = (scheme: AssessmentPart[]) => round2(scheme.reduce((sum, p) => sum + p.weight, 0));

export const scoresTotal = (scores: PartScore[]) => round2(scores.reduce((sum, s) => sum + s.score, 0));

/** The grade's score for one part of the scheme, or null if it was entered without that part. */
export function partScore(grade: Pick<GradeRow, 'scores'>, part: AssessmentPart): PartScore | null {
  return grade.scores.find((s) => s.key === part.key) ?? null;
}

/** True when the grade was entered with the scheme's current parts and weights. */
export function followsScheme(grade: Pick<GradeRow, 'scores'>, scheme: AssessmentPart[]): boolean {
  return (
    grade.scores.length === scheme.length &&
    scheme.every((p) => grade.scores.some((s) => s.key === p.key && s.max === p.weight))
  );
}

/** The scheme of the active academic year. */
export function activeScheme(data: Pick<EducationData, 'years' | 'activeYearId'>): AssessmentPart[] {
  return data.years.find((y) => y.id === data.activeYearId)?.scheme ?? DEFAULT_SCHEME;
}

/** "Attendance 10 · Mid exam 25 · Final exam 65" */
export function describeScheme(scheme: AssessmentPart[], locale: string): string {
  return scheme.map((p) => `${locale === 'am' ? p.name_am : p.name_en} ${p.weight}`).join(' · ');
}

/**
 * Marks suggested for an attendance part: the student's attendance rate
 * (present + late over all marked sessions, excused not counted) times the weight.
 */
export function attendanceMarks(
  sessions: { records: Record<string, string> }[],
  studentId: string,
  weight: number
): { marks: number; attended: number; counted: number } | null {
  let attended = 0;
  let counted = 0;
  for (const s of sessions) {
    const status = s.records[studentId];
    if (!status || status === 'EXCUSED') continue;
    counted += 1;
    if (status === 'PRESENT' || status === 'LATE') attended += 1;
  }
  if (counted === 0) return null;
  return { marks: round1((attended / counted) * weight), attended, counted };
}

/** A short key for a new part, unique within the scheme. */
export function partKey(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'part';
  const start = /^[a-z]/.test(base) ? base : `p_${base}`;
  let key = start;
  for (let i = 2; taken.includes(key); i++) key = `${start}_${i}`;
  return key;
}
