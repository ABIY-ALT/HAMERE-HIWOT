'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Education server actions — academic years, classes, subjects, students,
// attendance and grades. Each action re-checks the caller's permission and
// then uses the service-role client. loadEducationData returns
// { mode: 'demo' } when Supabase is not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import {
  letterGrade,
  type AcademicYear,
  type AttendanceSession,
  type AttendanceStatus,
  type EducationData,
  type GradeRow,
  type GradeStatus,
  type SchoolClass,
  type Student,
  type Subject,
  type Teacher,
} from '@/lib/education/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { id: string };
type Named = { full_name_en?: string | null } | null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function currentYear(db: SupabaseClient): Promise<{ id: string }> {
  const year = (await db.from('academic_years').select('id').eq('is_current', true).maybeSingle().then(check)) as {
    id: string;
  } | null;
  if (!year) throw new Error('Set a current academic year first (Education → Academic Years)');
  return year;
}

function duplicate(error: { code?: string; message: string }, text: string): Error {
  return new Error(error.code === '23505' ? text : error.message);
}

// ── Load everything the Education pages need ─────────────────────────────────

export async function loadEducationData(): Promise<Loaded<EducationData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('STUDENT_VIEW', 'ATTENDANCE_VIEW', 'GRADE_VIEW');
    const can = (p: string) => me.permissions.includes(p as never);

    const yearRows = (await db.from('academic_years').select('*').order('start_date', { ascending: false }).then(check)) as Row[];
    const active = yearRows.find((y) => y.is_current) ?? yearRows[0] ?? null;

    const [classRows, subjectRows, enrollRows, studentRows, staffRows] = await Promise.all([
      active
        ? (db.from('classes')
            .select('id, name_en, name_am, grade_level, academic_year_id, capacity, room, teacher_person_id, teacher:persons!classes_teacher_person_id_fkey(full_name_en)')
            .eq('academic_year_id', active.id)
            .order('grade_level')
            .order('name_en')
            .then(check) as Promise<Row[]>)
        : Promise.resolve([] as Row[]),
      db.from('subjects').select('*').order('code').then(check) as Promise<Row[]>,
      selectAll<Row>((a, b) =>
        db.from('enrollments').select('id, student_id, class_id, academic_year_id').order('id').range(a, b)
      ),
      can('STUDENT_VIEW')
        ? selectAll<Row>((a, b) =>
            db.from('students')
              .select('id, reg_no, status, enrollment_date, person:persons!students_person_id_fkey(full_name_en, full_name_am, baptismal_name, gender, phone_primary, emergency_contact_name, emergency_contact_phone)')
              .order('reg_no')
              .range(a, b)
          )
        : Promise.resolve([] as Row[]),
      db.from('system_users')
        .select('id, person_id, person:persons!system_users_person_id_fkey(full_name_en)')
        .eq('is_active', true)
        .then(check) as Promise<Row[]>,
    ]);

    // Enrollment counts per year and per class; each student's class this year
    const perYear = new Map<string, number>();
    const perClass = new Map<string, number>();
    const classOfStudent = new Map<string, string>();
    for (const e of enrollRows) {
      perYear.set(e.academic_year_id as string, (perYear.get(e.academic_year_id as string) ?? 0) + 1);
      if (active && e.academic_year_id === active.id) {
        perClass.set(e.class_id as string, (perClass.get(e.class_id as string) ?? 0) + 1);
        classOfStudent.set(e.student_id as string, e.class_id as string);
      }
    }

    const years: AcademicYear[] = yearRows.map((y) => ({
      id: y.id,
      name: y.name as string,
      name_am: (y.name_am as string) || (y.name as string),
      start_date: y.start_date as string,
      end_date: y.end_date as string,
      is_current: Boolean(y.is_current),
      status: y.status as AcademicYear['status'],
      students_enrolled: perYear.get(y.id) ?? 0,
    }));

    const classes: SchoolClass[] = classRows.map((c) => ({
      id: c.id,
      name_en: c.name_en as string,
      name_am: (c.name_am as string) || (c.name_en as string),
      grade_level: c.grade_level as number,
      academic_year_id: c.academic_year_id as string,
      teacher: (c.teacher as Named)?.full_name_en ?? '—',
      teacher_person_id: (c.teacher_person_id as string) ?? null,
      capacity: (c.capacity as number) ?? 0,
      enrolled: perClass.get(c.id) ?? 0,
      room: (c.room as string) ?? '',
    }));
    const classById = new Map(classes.map((c) => [c.id, c]));

    const subjects: Subject[] = subjectRows.map((s) => ({
      id: s.id,
      code: s.code as string,
      name_en: s.name_en as string,
      name_am: (s.name_am as string) || (s.name_en as string),
      min_grade: s.min_grade as number,
      credits: s.credits as number,
      instructor: (s.instructor as string) ?? '',
      syllabus: (s.syllabus as string) ?? '',
      is_active: Boolean(s.is_active),
    }));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    const students: Student[] = studentRows.map((s) => {
      const p = (s.person ?? {}) as Record<string, string | null>;
      const cls = classById.get(classOfStudent.get(s.id) ?? '');
      return {
        id: s.id,
        reg_no: s.reg_no as string,
        name_en: p.full_name_en ?? '',
        name_am: p.full_name_am || p.full_name_en || '',
        baptismal: p.baptismal_name ?? '',
        gender: (p.gender as Student['gender']) ?? 'MALE',
        class: cls?.name_en ?? '—',
        class_id: cls?.id ?? '',
        grade_level: cls?.grade_level ?? 0,
        status: s.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        enrollment_date: s.enrollment_date as string,
        parent: p.emergency_contact_name ?? '',
        phone: p.emergency_contact_phone || p.phone_primary || '',
      };
    });
    const studentById = new Map(students.map((s) => [s.id, s]));

    let sessions: AttendanceSession[] = [];
    if (can('ATTENDANCE_VIEW') && classes.length) {
      const sessionRows = await selectAll<Row>((a, b) =>
        db.from('attendance_sessions')
          .select('id, class_id, session_date, topic_en, topic_am, teacher:persons!attendance_sessions_teacher_person_id_fkey(full_name_en), records:attendance_records(student_id, status)')
          .in('class_id', classes.map((c) => c.id))
          .order('session_date', { ascending: false })
          .order('id')
          .range(a, b)
      );
      sessions = sessionRows.map((s) => ({
        id: s.id,
        class_id: s.class_id as string,
        class: classById.get(s.class_id as string)?.name_en ?? '—',
        date: s.session_date as string,
        topic: (s.topic_en as string) ?? '',
        topic_am: (s.topic_am as string) || (s.topic_en as string) || '',
        teacher: (s.teacher as Named)?.full_name_en ?? '—',
        records: Object.fromEntries(
          ((s.records ?? []) as { student_id: string; status: AttendanceStatus }[]).map((r) => [r.student_id, r.status])
        ),
      }));
    }

    let grades: GradeRow[] = [];
    if (can('GRADE_VIEW') && active) {
      const gradeRows = await selectAll<Row>((a, b) =>
        db.from('grades')
          .select('id, student_id, subject_id, term, continuous_score, final_score, total_score, status, approver:system_users!grades_approved_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
          .eq('academic_year_id', active.id)
          .order('id')
          .range(a, b)
      );
      grades = gradeRows.map((g) => {
        const stu = studentById.get(g.student_id as string);
        const sub = subjectById.get(g.subject_id as string);
        const total = Number(g.total_score);
        return {
          id: g.id,
          student_id: g.student_id as string,
          student: stu?.name_en ?? '—',
          student_am: stu?.name_am ?? '—',
          reg_no: stu?.reg_no ?? '',
          class: stu?.class ?? '—',
          subject_id: g.subject_id as string,
          subject: sub?.name_en ?? '—',
          subject_am: sub?.name_am ?? '—',
          term: g.term as number,
          continuous: Number(g.continuous_score),
          final: Number(g.final_score),
          total,
          grade: letterGrade(total),
          status: (['APPROVED', 'REJECTED'].includes(g.status as string) ? g.status : 'PENDING') as GradeStatus,
          approved_by: ((g.approver as { person?: Named } | null)?.person?.full_name_en) ?? '',
        };
      });
    }

    const teachers: Teacher[] = staffRows
      .map((u) => ({ person_id: u.person_id as string, name: (u.person as Named)?.full_name_en ?? '' }))
      .filter((u) => u.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      mode: 'live',
      data: { activeYearId: active?.id ?? null, years, classes, subjects, students, sessions, grades, teachers },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

// ── Academic years ───────────────────────────────────────────────────────────

const YearSchema = z
  .object({
    name: z.string().trim().min(4, 'Enter the academic year, e.g. 2026/2027'),
    name_am: z.string().trim(),
    start_date: isoDate,
    end_date: isoDate,
  })
  .refine((y) => y.end_date > y.start_date, 'The end date must be after the start date');

export async function createAcademicYear(input: z.input<typeof YearSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    const y = YearSchema.parse(input);
    const { count } = await db.from('academic_years').select('id', { count: 'exact', head: true }).eq('is_current', true);
    const first = (count ?? 0) === 0; // the first year becomes current automatically
    const { error } = await db.from('academic_years').insert({
      name: y.name,
      name_am: y.name_am || y.name,
      start_date: y.start_date,
      end_date: y.end_date,
      is_current: first,
      status: first ? 'ACTIVE' : 'PLANNED',
    });
    if (error) throw duplicate(error, `Academic year ${y.name} already exists`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setCurrentAcademicYear(yearId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    await db.from('academic_years')
      .update({ is_current: false, status: 'COMPLETED' })
      .eq('is_current', true)
      .neq('id', yearId)
      .then(check);
    await db.from('academic_years').update({ is_current: true, status: 'ACTIVE' }).eq('id', yearId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Classes ──────────────────────────────────────────────────────────────────

const ClassSchema = z.object({
  name_en: z.string().trim().min(1, 'Enter the class name'),
  name_am: z.string().trim(),
  grade_level: z.coerce.number().int().min(1, 'Grade level must be 1 or more').max(20),
  capacity: z.coerce.number().int().min(1, 'Capacity must be 1 or more').max(500),
  room: z.string().trim(),
  teacher_person_id: z.string(),
});

export async function createClass(input: z.input<typeof ClassSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    const c = ClassSchema.parse(input);
    const year = await currentYear(db);
    const { error } = await db.from('classes').insert({
      academic_year_id: year.id,
      name_en: c.name_en,
      name_am: c.name_am || c.name_en,
      grade_level: c.grade_level,
      capacity: c.capacity,
      room: c.room || null,
      teacher_person_id: c.teacher_person_id || null,
    });
    if (error) throw duplicate(error, `A class named ${c.name_en} already exists this year`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Subjects ─────────────────────────────────────────────────────────────────

const SubjectSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((c) => c.toUpperCase().replace(/\s+/g, '-'))
    .refine((c) => /^[A-Z0-9-]{2,20}$/.test(c), 'Code must be 2–20 letters, digits or dashes, e.g. BIB-101'),
  name_en: z.string().trim().min(2, 'Enter the subject title'),
  name_am: z.string().trim(),
  min_grade: z.coerce.number().int().min(1).max(20),
  credits: z.coerce.number().int().min(1, 'Credit hours must be 1 or more').max(20),
  instructor: z.string().trim(),
  syllabus: z.string().trim(),
});

export async function createSubject(input: z.input<typeof SubjectSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    const s = SubjectSchema.parse(input);
    const { error } = await db.from('subjects').insert({
      code: s.code,
      name_en: s.name_en,
      name_am: s.name_am || s.name_en,
      min_grade: s.min_grade,
      credits: s.credits,
      instructor: s.instructor || null,
      syllabus: s.syllabus || null,
    });
    if (error?.message.includes('instructor') || error?.message.includes('syllabus')) {
      throw new Error('Run database migration 007 first (adds subject instructor and syllabus)');
    }
    if (error) throw duplicate(error, `Subject code ${s.code} already exists`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Students ─────────────────────────────────────────────────────────────────

const StudentSchema = z.object({
  name_en: z.string().trim().min(2, 'Enter the student name'),
  name_am: z.string().trim(),
  baptismal: z.string().trim(),
  gender: z.enum(['MALE', 'FEMALE']),
  class_id: z.string().min(1, 'Choose a class'),
  parent: z.string().trim(),
  phone: z.string().trim(),
  enrollment_date: isoDate,
});

export type EnrollResult = { ok: true; regNos: string[] } | { ok: false; error: string };

/** Registers students (person + student + enrollment). All-or-nothing. */
export async function enrollStudents(input: z.input<typeof StudentSchema>[]): Promise<EnrollResult> {
  const created = { persons: [] as string[], students: [] as string[] };
  let db: SupabaseClient | null = null;
  try {
    const auth = await authorize('STUDENT_CREATE');
    db = auth.db;
    const rows = z.array(StudentSchema).min(1).max(1000).parse(input);

    const classIds = [...new Set(rows.map((r) => r.class_id))];
    const classRows = (await db.from('classes').select('id, academic_year_id').in('id', classIds).then(check)) as {
      id: string; academic_year_id: string;
    }[];
    const yearOfClass = new Map(classRows.map((c) => [c.id, c.academic_year_id]));
    const missing = classIds.find((id) => !yearOfClass.has(id));
    if (missing) throw new Error('One of the chosen classes no longer exists');

    const planned = rows.map((r) => ({ r, personId: crypto.randomUUID(), studentId: crypto.randomUUID() }));

    for (const part of chunk(planned, 500)) {
      await db.from('persons')
        .insert(part.map(({ r, personId }) => ({
          id: personId,
          membership_code: `STU-${personId.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
          full_name_en: r.name_en,
          full_name_am: r.name_am || null,
          baptismal_name: r.baptismal || null,
          gender: r.gender,
          status: 'ACTIVE',
          emergency_contact_name: r.parent || null,
          emergency_contact_phone: r.phone || null,
        })))
        .then(check);
      created.persons.push(...part.map((p) => p.personId));
    }

    const regNoById = new Map<string, string>();
    for (const part of chunk(planned, 500)) {
      const inserted = (await db.from('students')
        .insert(part.map(({ r, personId, studentId }) => ({
          id: studentId,
          person_id: personId,
          status: 'ACTIVE',
          enrollment_date: r.enrollment_date,
        })))
        .select('id, reg_no')
        .then(check)) as { id: string; reg_no: string }[];
      created.students.push(...part.map((p) => p.studentId));
      for (const s of inserted) regNoById.set(s.id, s.reg_no);
    }

    for (const part of chunk(planned, 500)) {
      await db.from('enrollments')
        .insert(part.map(({ r, studentId }) => ({
          student_id: studentId,
          class_id: r.class_id,
          academic_year_id: yearOfClass.get(r.class_id),
          status: 'ACTIVE',
        })))
        .then(check);
    }

    return { ok: true, regNos: planned.map((p) => regNoById.get(p.studentId) ?? '') };
  } catch (e) {
    // Roll back (enrollments cascade with students)
    if (db) {
      for (const ids of chunk(created.students, 100)) await db.from('students').delete().in('id', ids);
      for (const ids of chunk(created.persons, 100)) await db.from('persons').delete().in('id', ids);
    }
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Attendance ───────────────────────────────────────────────────────────────

const AttendanceSchema = z.object({
  class_id: z.string().min(1),
  date: isoDate,
  topic: z.string().trim(),
  topic_am: z.string().trim(),
  records: z.record(z.string(), z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])),
});

export async function saveAttendance(input: z.input<typeof AttendanceSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ATTENDANCE_RECORD', 'ATTENDANCE_UPDATE');
    const a = AttendanceSchema.parse(input);
    const studentIds = Object.keys(a.records);
    if (studentIds.length === 0) throw new Error('Mark at least one student');

    const existing = (await db.from('attendance_sessions')
      .select('id, recorded_by')
      .eq('class_id', a.class_id)
      .eq('session_date', a.date)
      .maybeSingle()
      .then(check)) as { id: string; recorded_by: string | null } | null;

    const fields = {
      topic_en: a.topic || null,
      topic_am: a.topic_am || null,
      teacher_person_id: me.person.id,
      recorded_by: me.systemUser.id,
      status: 'COMPLETED',
    };

    let sessionId: string;
    if (existing) {
      // Teachers may correct their own roll call; changing someone else's needs ATTENDANCE_UPDATE.
      if (!me.permissions.includes('ATTENDANCE_UPDATE') && existing.recorded_by !== me.systemUser.id) {
        throw new Error('Attendance for this class and date was recorded by someone else');
      }
      await db.from('attendance_sessions').update(fields).eq('id', existing.id).then(check);
      sessionId = existing.id;
    } else {
      if (!me.permissions.includes('ATTENDANCE_RECORD')) throw new Error('You do not have permission to record attendance');
      const row = (await db.from('attendance_sessions')
        .insert({ class_id: a.class_id, session_date: a.date, ...fields })
        .select('id')
        .single()
        .then(check)) as { id: string };
      sessionId = row.id;
    }

    await db.from('attendance_records')
      .upsert(
        studentIds.map((id) => ({ session_id: sessionId, student_id: id, status: a.records[id] })),
        { onConflict: 'session_id,student_id' }
      )
      .then(check);
    // Drop marks for students no longer on this roll
    await db.from('attendance_records')
      .delete()
      .eq('session_id', sessionId)
      .not('student_id', 'in', `(${studentIds.join(',')})`)
      .then(check);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Grades ───────────────────────────────────────────────────────────────────

const GradeSchema = z.object({
  student_id: z.string().min(1, 'Choose a student'),
  subject_id: z.string().min(1, 'Choose a subject'),
  term: z.coerce.number().int().min(1).max(4),
  continuous: z.coerce.number().min(0).max(30, 'Continuous assessment is out of 30'),
  final: z.coerce.number().min(0).max(70, 'Final exam is out of 70'),
});

export async function saveGrade(input: z.input<typeof GradeSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('GRADE_CREATE', 'GRADE_UPDATE');
    const g = GradeSchema.parse(input);
    const year = await currentYear(db);

    const existing = (await db.from('grades')
      .select('id')
      .eq('student_id', g.student_id)
      .eq('subject_id', g.subject_id)
      .eq('academic_year_id', year.id)
      .eq('term', g.term)
      .maybeSingle()
      .then(check)) as { id: string } | null;

    const scores = {
      continuous_score: g.continuous,
      final_score: g.final,
      status: 'PENDING',
      entered_by: me.systemUser.id,
      approved_by: null,
      approved_at: null,
    };

    if (existing) {
      if (!me.permissions.includes('GRADE_UPDATE')) {
        throw new Error('A grade already exists for this student, subject and term');
      }
      await db.from('grades').update(scores).eq('id', existing.id).then(check);
    } else {
      if (!me.permissions.includes('GRADE_CREATE')) throw new Error('You do not have permission to enter grades');
      await db.from('grades')
        .insert({ student_id: g.student_id, subject_id: g.subject_id, academic_year_id: year.id, term: g.term, ...scores })
        .then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function reviewGrade(gradeId: string, decision: 'APPROVED' | 'REJECTED'): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('GRADE_APPROVE');
    if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new Error('Invalid decision');
    await db.from('grades')
      .update({ status: decision, approved_by: me.systemUser.id, approved_at: new Date().toISOString() })
      .eq('id', gradeId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
