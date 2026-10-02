// ─────────────────────────────────────────────────────────────────────────────
// Education module data shapes (what the pages render). Built from the
// database by app/dashboard/education/actions.ts, or from demo data.
// ─────────────────────────────────────────────────────────────────────────────

import type { Student } from '@/lib/students/store';
import type { AttendanceSession, AttendanceStatus } from '@/lib/attendance/store';

export type { Student, AttendanceSession, AttendanceStatus };

export type AcademicYearStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

export interface AcademicYear {
  id: string;
  name: string;
  name_am: string;
  start_date: string; // ISO date
  end_date: string;
  is_current: boolean;
  status: AcademicYearStatus;
  students_enrolled: number;
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
  continuous: number;
  final: number;
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
