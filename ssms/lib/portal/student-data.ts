// ─────────────────────────────────────────────────────────────────────────────
// A student's own data for the student portal (/dashboard/my) and the parent
// portal (/dashboard/family) — server only, and never a server action itself:
// the callers decide which student the signed-in person may see. Results are
// approved grades only; the class rank is worked out here and only this
// student's own rank leaves the server.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { check } from '@/lib/auth/authorize';
import { PASS_MARK, letterGrade, parseScheme, parseScores, type AssessmentPart, type PartScore } from '@/lib/education/types';
import { examTotal, type EndedReason, type ExamStatus } from '@/lib/exams/types';

type Row = Record<string, unknown>;
type Named = { name_en: string; name_am: string | null } | null;

export interface MyGrade {
  id: string;
  subject: string;
  subject_am: string;
  term: number;
  scores: PartScore[];
  total: number;
  grade: string;
}

export interface MyExam {
  id: string;
  title: string;
  subject: string;
  subject_am: string;
  term: number;
  exam_status: ExamStatus;
  duration_minutes: number;
  questions: number;
  total_marks: number;
  started: boolean;
  submitted: boolean;
  /** Only while the student can still sit it — it opens the exam on /exam */
  ticket: string | null;
  /** Only when the teacher shows scores and nothing is left to mark */
  score: number | null;
  needs_marking: boolean;
  ended_reason: EndedReason | null;
}

export interface MyAttendance {
  date: string;
  topic: string;
  topic_am: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

export interface MyPortal {
  student: {
    reg_no: string;
    name_en: string;
    name_am: string;
    baptismal: string;
    gender: 'MALE' | 'FEMALE';
    date_of_birth: string | null;
    guardian: string;
    guardian_phone: string;
    class_name: string;
    class_name_am: string;
    year: string;
  };
  scheme: AssessmentPart[];
  grades: MyGrade[];
  /** Grades entered but not yet approved (not shown until they are) */
  pending: number;
  average: number | null;
  rank: number | null;
  class_size: number;
  pass_mark: number;
  exams: MyExam[];
  attendance: MyAttendance[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Everything the portal shows about one student. `tickets`: include the codes
 * that start open exams (the student themself, not their parents).
 */
export async function studentPortalData(db: SupabaseClient, studentId: string, opts: { tickets: boolean }): Promise<MyPortal> {
  const student = (await db.from('students')
    .select('id, reg_no, person:persons!students_person_id_fkey(full_name_en, full_name_am, baptismal_name, gender, date_of_birth, emergency_contact_name, emergency_contact_phone)')
    .eq('id', studentId)
    .maybeSingle()
    .then(check)) as Row | null;
  if (!student) throw new Error('Student not found');
  const person = (student.person ?? {}) as Record<string, string | null>;

  const year = (await db.from('academic_years')
    .select('id, name, assessment_scheme')
    .order('is_current', { ascending: false })
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(check)) as { id: string; name: string; assessment_scheme: unknown } | null;
  const enrollment = year
    ? ((await db.from('enrollments')
        .select('class_id, class:classes(name_en, name_am)')
        .eq('student_id', studentId)
        .eq('academic_year_id', year.id)
        .maybeSingle()
        .then(check)) as { class_id: string; class: Named } | null)
    : null;
  const classId = enrollment?.class_id ?? null;

  const [gradeRows, classGrades, attemptRows, recordRows] = await Promise.all([
    year
      ? (db.from('grades')
          .select('id, term, scores, total_score, continuous_score, final_score, status, subject:subjects(name_en, name_am)')
          .eq('student_id', studentId)
          .eq('academic_year_id', year.id)
          .order('term')
          .then(check) as Promise<Row[]>)
      : Promise.resolve([] as Row[]),
    // For the rank: approved totals of the student's classmates (only numbers, never names)
    year && classId
      ? db.from('enrollments')
          .select('student_id')
          .eq('class_id', classId)
          .eq('academic_year_id', year.id)
          .then(check)
          .then((rows) =>
            db.from('grades')
              .select('student_id, total_score')
              .eq('academic_year_id', year.id)
              .eq('status', 'APPROVED')
              .in('student_id', (rows as { student_id: string }[]).map((r) => r.student_id))
              .then(check)
          ) as Promise<{ student_id: string; total_score: number }[]>
      : Promise.resolve([] as { student_id: string; total_score: number }[]),
    db.from('exam_attempts')
      .select('ticket, started_at, submitted_at, score, needs_marking, ended_reason, exam:exams(id, title, status, term, duration_minutes, show_score, subject:subjects(name_en, name_am), questions:exam_questions(marks))')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? [] : (data as Row[]))), // before migration 022: no exams
    db.from('attendance_records')
      .select('status, session:attendance_sessions(session_date, topic_en, topic_am, class_id)')
      .eq('student_id', studentId)
      .then(check) as Promise<Row[]>,
  ]);

  const approved = gradeRows.filter((g) => g.status === 'APPROVED');
  const grades: MyGrade[] = approved.map((g) => {
    const subject = g.subject as Named;
    const total = Number(g.total_score);
    return {
      id: g.id as string,
      subject: subject?.name_en ?? '',
      subject_am: subject?.name_am || subject?.name_en || '',
      term: Number(g.term),
      scores: parseScores(g.scores, { continuous: g.continuous_score, final: g.final_score }),
      total,
      grade: letterGrade(total),
    };
  });

  // Same rule as the Results page: average of approved grades; equal averages share a rank
  const totals = new Map<string, number[]>();
  for (const g of classGrades) totals.set(g.student_id, [...(totals.get(g.student_id) ?? []), Number(g.total_score)]);
  const averages = [...totals.entries()].map(([id, list]) => ({ id, average: round1(list.reduce((s, n) => s + n, 0) / list.length) }));
  const average = grades.length ? round1(grades.reduce((s, g) => s + g.total, 0) / grades.length) : null;
  const rank = average === null ? null : averages.filter((a) => a.average > average).length + 1;

  const exams: MyExam[] = attemptRows
    .map((a): MyExam | null => {
      const exam = a.exam as Row | null;
      if (!exam || exam.status === 'DRAFT') return null;
      const subject = exam.subject as Named;
      const questions = ((exam.questions as { marks: number }[] | null) ?? []).map((q) => ({ marks: Number(q.marks) }));
      const submitted = Boolean(a.submitted_at);
      return {
        id: exam.id as string,
        title: exam.title as string,
        subject: subject?.name_en ?? '',
        subject_am: subject?.name_am || subject?.name_en || '',
        term: Number(exam.term),
        exam_status: exam.status as ExamStatus,
        duration_minutes: Number(exam.duration_minutes),
        questions: questions.length,
        total_marks: examTotal(questions),
        started: Boolean(a.started_at),
        submitted,
        ticket: opts.tickets && exam.status === 'OPEN' && !submitted ? (a.ticket as string) : null,
        score: submitted && exam.show_score && !a.needs_marking && a.score !== null ? Number(a.score) : null,
        needs_marking: Boolean(a.needs_marking),
        ended_reason: (a.ended_reason as EndedReason | null) ?? null,
      };
    })
    .filter((e): e is MyExam => e !== null);

  const attendance: MyAttendance[] = recordRows
    .map((r) => ({ r, session: r.session as Row | null }))
    .filter(({ session }) => session && (!classId || session.class_id === classId))
    .map(({ r, session }) => ({
      date: session!.session_date as string,
      topic: (session!.topic_en as string) ?? '',
      topic_am: (session!.topic_am as string) || (session!.topic_en as string) || '',
      status: r.status as MyAttendance['status'],
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    student: {
      reg_no: student.reg_no as string,
      name_en: person.full_name_en ?? '',
      name_am: person.full_name_am || person.full_name_en || '',
      baptismal: person.baptismal_name ?? '',
      gender: person.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
      date_of_birth: person.date_of_birth ?? null,
      guardian: person.emergency_contact_name ?? '',
      guardian_phone: person.emergency_contact_phone ?? '',
      class_name: enrollment?.class?.name_en ?? '',
      class_name_am: enrollment?.class?.name_am || enrollment?.class?.name_en || '',
      year: year?.name ?? '',
    },
    scheme: parseScheme(year?.assessment_scheme),
    grades,
    pending: gradeRows.length - approved.length,
    average,
    rank,
    class_size: averages.length,
    pass_mark: PASS_MARK,
    exams,
    attendance,
  };
}
