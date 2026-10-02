// ─────────────────────────────────────────────────────────────────────────────
// Demo-mode Education data (used when Supabase is not configured).
// Students and roll calls added in demo mode live in this browser's storage.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MOCK_ACADEMIC_YEARS,
  MOCK_CLASSES,
  MOCK_GRADES,
  MOCK_SUBJECTS,
} from '@/lib/mock/modules';
import { mergeStudents, parseStudents, readRawStudents } from '@/lib/students/store';
import { parseSessions, readRawSessions } from '@/lib/attendance/store';
import type {
  AcademicYear,
  EducationData,
  GradeRow,
  GradeStatus,
  SchoolClass,
  Subject,
} from './types';

function demoYears(): AcademicYear[] {
  return MOCK_ACADEMIC_YEARS.map((y) => ({
    id: y.id,
    name: y.name,
    name_am: y.name_am,
    start_date: y.start_date,
    end_date: y.end_date,
    is_current: y.is_current,
    status: y.status as AcademicYear['status'],
    students_enrolled: y.students_enrolled,
  }));
}

function demoClasses(): SchoolClass[] {
  return MOCK_CLASSES.map((c) => ({
    id: c.id,
    name_en: c.name_en,
    name_am: c.name_am,
    grade_level: c.grade_level,
    academic_year_id: c.academic_year_id,
    teacher: c.teacher,
    teacher_person_id: null,
    capacity: c.capacity,
    enrolled: c.enrolled,
    room: c.room,
  }));
}

function demoSubjects(): Subject[] {
  return MOCK_SUBJECTS.map((s) => ({
    id: s.id,
    code: s.code,
    name_en: s.name_en,
    name_am: s.name_am,
    min_grade: Number.parseInt(String(s.grade_level), 10) || 1,
    credits: s.credits,
    instructor: s.teacher,
    syllabus: '',
    is_active: true,
  }));
}

/** Built on demand so students/roll calls saved in this browser are included. */
export function demoEducation(): EducationData {
  const students = mergeStudents(
    typeof window === 'undefined' ? [] : parseStudents(readRawStudents())
  );
  const byReg = new Map(students.map((s) => [s.reg_no, s]));
  const subjects = demoSubjects();

  const grades: GradeRow[] = MOCK_GRADES.map((g) => {
    const subject = subjects.find((s) => s.name_en.startsWith(g.subject));
    return {
      id: g.id,
      student_id: byReg.get(g.reg_no)?.id ?? '',
      student: g.student,
      student_am: byReg.get(g.reg_no)?.name_am ?? g.student,
      reg_no: g.reg_no,
      class: g.class,
      subject_id: subject?.id ?? '',
      subject: g.subject,
      subject_am: subject?.name_am ?? g.subject,
      term: 1,
      continuous: g.continuous,
      final: g.final,
      total: g.total,
      grade: g.grade,
      status: g.status as GradeStatus,
      approved_by: g.approved_by ?? '',
    };
  });

  const years = demoYears();
  return {
    activeYearId: years.find((y) => y.is_current)?.id ?? null,
    years,
    classes: demoClasses(),
    subjects,
    students,
    sessions: typeof window === 'undefined' ? [] : parseSessions(readRawSessions()),
    grades,
    teachers: [],
  };
}
