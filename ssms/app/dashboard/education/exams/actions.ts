'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Online exams — the teacher's side. Students sit an exam on /exam with the
// ticket printed for them (app/exam/actions.ts).
//   GRADE_VIEW    see exams, tickets and results
//   GRADE_CREATE  write questions, open / close, mark short answers,
//                 send results to grades (GRADE_UPDATE to overwrite a grade)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { parseScheme, parseScores } from '@/lib/education/types';
import { notifyLater } from '@/lib/push/send';
import { escapeHtml, siteUrl, telegramLater, telegramToPersons } from '@/lib/telegram/bot';
import {
  GRACE_SECONDS,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  examTotal,
  extraMinutesAfter,
  isTimeUp,
  markAttempt,
  newStartKey,
  newTicket,
  scaleToPart,
  type Exam,
  type EndedReason,
  type ExamAttempt,
  type ExamQuestion,
} from '@/lib/exams/types';

type Named = { name_en: string; name_am: string | null } | null;

export interface ExamSummary extends Exam {
  class_name: string;
  class_name_am: string;
  subject_name: string;
  subject_name_am: string;
  questions: number;
  total_marks: number;
  tickets: number;
  started: number;
  submitted: number;
  needs_marking: number;
}

export interface AttemptRow extends ExamAttempt {
  student: string;
  student_am: string;
  reg_no: string;
}

export interface ExamDetail {
  exam: ExamSummary;
  questions: ExamQuestion[];
  attempts: AttemptRow[];
  /** Students of the class who have no ticket yet (enrolled after the exam was opened) */
  without_ticket: number;
  /** The grade part the result fills, from the exam's academic year */
  part: { key: string; name_en: string; name_am: string; weight: number } | null;
}

const MIGRATION_022 = 'Run database migration 022 (online exams) first';
const missing = (message: string) =>
  /exam_attempts|exam_questions|\bexams\b/.test(message) && /does not exist|schema cache/.test(message) ? MIGRATION_022 : message;

const EXAM_SELECT =
  '*, class:classes(name_en, name_am), subject:subjects(name_en, name_am), questions:exam_questions(marks), attempts:exam_attempts(started_at, submitted_at, needs_marking)';

function toSummary(r: Record<string, unknown>): ExamSummary {
  const cls = r.class as Named;
  const subject = r.subject as Named;
  const questions = (r.questions as { marks: number }[] | null) ?? [];
  const attempts = (r.attempts as { started_at: string | null; submitted_at: string | null; needs_marking: boolean }[] | null) ?? [];
  return {
    id: r.id as string,
    title: r.title as string,
    instructions: (r.instructions as string) ?? '',
    class_id: r.class_id as string,
    subject_id: r.subject_id as string,
    academic_year_id: r.academic_year_id as string,
    term: Number(r.term),
    part_key: (r.part_key as string) ?? '',
    duration_minutes: Number(r.duration_minutes),
    shuffle: Boolean(r.shuffle),
    show_score: Boolean(r.show_score),
    use_start_key: Boolean(r.use_start_key),
    start_key: (r.start_key as string) ?? null,
    leave_limit: Number(r.leave_limit ?? 0),
    status: r.status as Exam['status'],
    opened_at: (r.opened_at as string) ?? null,
    closed_at: (r.closed_at as string) ?? null,
    sent_to_grades_at: (r.sent_to_grades_at as string) ?? null,
    created_at: r.created_at as string,
    class_name: cls?.name_en ?? '',
    class_name_am: cls?.name_am || cls?.name_en || '',
    subject_name: subject?.name_en ?? '',
    subject_name_am: subject?.name_am || subject?.name_en || '',
    questions: questions.length,
    total_marks: examTotal(questions.map((q) => ({ marks: Number(q.marks) }))),
    tickets: attempts.length,
    started: attempts.filter((a) => a.started_at).length,
    submitted: attempts.filter((a) => a.submitted_at).length,
    needs_marking: attempts.filter((a) => a.needs_marking).length,
  };
}

function toQuestion(r: Record<string, unknown>): ExamQuestion {
  return {
    id: r.id as string,
    exam_id: r.exam_id as string,
    position: Number(r.position),
    kind: r.kind as ExamQuestion['kind'],
    prompt: r.prompt as string,
    options: Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [],
    answer: (r.answer as string) ?? '',
    marks: Number(r.marks),
  };
}

function toAttempt(r: Record<string, unknown>): ExamAttempt {
  return {
    id: r.id as string,
    exam_id: r.exam_id as string,
    student_id: r.student_id as string,
    ticket: r.ticket as string,
    started_at: (r.started_at as string) ?? null,
    submitted_at: (r.submitted_at as string) ?? null,
    answers: (r.answers as Record<string, string>) ?? {},
    marks: Object.fromEntries(Object.entries((r.marks as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v)])),
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    needs_marking: Boolean(r.needs_marking),
    focus_lost: Number(r.focus_lost ?? 0),
    extra_minutes: Number(r.extra_minutes ?? 0),
    new_device_allowed: Boolean(r.new_device_allowed),
    device_changes: Number(r.device_changes ?? 0),
    blocked_tries: Number(r.blocked_tries ?? 0),
    tried_other_codes: Number(r.tried_other_codes ?? 0),
    away_seconds: Number(r.away_seconds ?? 0),
    left_at: (r.left_at as string) ?? null,
    ended_reason: (r.ended_reason as EndedReason) ?? null,
  };
}

async function getExam(db: SupabaseClient, id: string): Promise<ExamSummary> {
  const { data, error } = await db.from('exams').select(EXAM_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(missing(error.message));
  if (!data) throw new Error('Exam not found');
  return toSummary(data as Record<string, unknown>);
}

async function getQuestions(db: SupabaseClient, examId: string): Promise<ExamQuestion[]> {
  const rows = (await db.from('exam_questions').select('*').eq('exam_id', examId).order('position').order('created_at').then(check)) as Record<string, unknown>[];
  return rows.map(toQuestion);
}

function requireDraft(exam: Exam) {
  if (exam.status !== 'DRAFT') throw new Error('Questions can only be changed before the exam is opened');
}

/** Submit attempts whose time ran out (or all unfinished ones when the exam closes). */
async function finalizeAttempts(db: SupabaseClient, exam: Exam, questions: ExamQuestion[], all: boolean) {
  const rows = (await db.from('exam_attempts')
    .select('*')
    .eq('exam_id', exam.id)
    .not('started_at', 'is', null)
    .is('submitted_at', null)
    .then(check)) as Record<string, unknown>[];
  const now = new Date().toISOString();
  for (const a of rows.map(toAttempt)) {
    if (!all && !isTimeUp(a, exam, Date.now(), GRACE_SECONDS)) continue;
    const m = markAttempt(questions, a.answers);
    await db.from('exam_attempts')
      .update({ submitted_at: now, marks: m.marks, score: m.score, needs_marking: m.needsMarking, ended_reason: all ? 'CLOSED' : 'TIME', left_at: null })
      .eq('id', a.id)
      .is('submitted_at', null)
      .then(check);
  }
}

/** Give every student enrolled in the class a ticket (students who already have one keep it). */
async function ensureTickets(db: SupabaseClient, exam: Exam): Promise<number> {
  const enrolled = (await db.from('enrollments')
    .select('student_id')
    .eq('class_id', exam.class_id)
    .eq('academic_year_id', exam.academic_year_id)
    .eq('status', 'ACTIVE')
    .then(check)) as { student_id: string }[];
  const have = new Set(
    ((await db.from('exam_attempts').select('student_id').eq('exam_id', exam.id).then(check)) as { student_id: string }[]).map((a) => a.student_id)
  );
  const needed = enrolled.map((e) => e.student_id).filter((id) => !have.has(id));
  for (let attempt = 0; needed.length && attempt < 3; attempt++) {
    const { error } = await db.from('exam_attempts').insert(needed.map((student_id) => ({ exam_id: exam.id, student_id, ticket: newTicket() })));
    if (!error) return needed.length;
    // A ticket collided with another one (extremely rare): new codes and try again
    if (error.code !== '23505' || /student/.test(error.message)) throw new Error(error.message);
  }
  return 0;
}

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadExams(): Promise<Loaded<ExamSummary[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('GRADE_VIEW', 'AUDIT_VIEW_ALL');
    const { data, error } = await db.from('exams').select(EXAM_SELECT).order('created_at', { ascending: false });
    if (error) throw new Error(missing(error.message));
    return { mode: 'live', data: (data as Record<string, unknown>[]).map(toSummary) };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

export async function loadExam(id: string): Promise<Loaded<ExamDetail>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('GRADE_VIEW', 'AUDIT_VIEW_ALL');
    let exam = await getExam(db, id);
    const questions = await getQuestions(db, id);
    if (exam.status === 'OPEN') {
      await finalizeAttempts(db, exam, questions, false);
      exam = await getExam(db, id);
    }
    const [attemptRows, enrolled, year] = await Promise.all([
      db.from('exam_attempts')
        .select('*, student:students(reg_no, person:persons!students_person_id_fkey(full_name_en, full_name_am))')
        .eq('exam_id', id)
        .then(check) as Promise<Record<string, unknown>[]>,
      db.from('enrollments')
        .select('student_id')
        .eq('class_id', exam.class_id)
        .eq('academic_year_id', exam.academic_year_id)
        .eq('status', 'ACTIVE')
        .then(check) as Promise<{ student_id: string }[]>,
      db.from('academic_years').select('assessment_scheme').eq('id', exam.academic_year_id).maybeSingle().then(check) as Promise<{
        assessment_scheme: unknown;
      } | null>,
    ]);
    const attempts: AttemptRow[] = attemptRows
      .map((r) => {
        const student = r.student as { reg_no: string; person: { full_name_en: string; full_name_am: string | null } | null } | null;
        return {
          ...toAttempt(r),
          student: student?.person?.full_name_en ?? '',
          student_am: student?.person?.full_name_am || student?.person?.full_name_en || '',
          reg_no: student?.reg_no ?? '',
        };
      })
      .sort((a, b) => a.student.localeCompare(b.student));
    const withTicket = new Set(attempts.map((a) => a.student_id));
    const part = exam.part_key ? parseScheme(year?.assessment_scheme).find((p) => p.key === exam.part_key) ?? null : null;
    return {
      mode: 'live',
      data: {
        exam,
        questions,
        attempts,
        without_ticket: enrolled.filter((e) => !withTicket.has(e.student_id)).length,
        part: part && { key: part.key, name_en: part.name_en, name_am: part.name_am, weight: part.weight },
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

// ── Exam ─────────────────────────────────────────────────────────────────────

const ExamSchema = z.object({
  title: z.string().trim().min(2, 'Give the exam a title').max(200),
  instructions: z.string().trim().max(2000),
  class_id: z.string().min(1, 'Choose the class'),
  subject_id: z.string().min(1, 'Choose the subject'),
  term: z.coerce.number().int().min(1).max(4),
  part_key: z.string().trim(),
  duration_minutes: z.coerce.number().int().min(1, 'The exam needs at least 1 minute').max(300, 'At most 300 minutes'),
  shuffle: z.boolean(),
  show_score: z.boolean(),
  use_start_key: z.boolean(),
  leave_limit: z.coerce.number().int().min(0).max(20, 'At most 20 times'),
});

export type ExamInput = z.input<typeof ExamSchema>;

/** The class's academic year, and the part key checked against that year's scheme. */
async function examYear(db: SupabaseClient, classId: string, partKey: string) {
  const cls = (await db.from('classes')
    .select('academic_year_id, year:academic_years(assessment_scheme)')
    .eq('id', classId)
    .single()
    .then(check)) as unknown as { academic_year_id: string; year: { assessment_scheme: unknown } | null };
  if (partKey) {
    const part = parseScheme(cls.year?.assessment_scheme).find((p) => p.key === partKey);
    if (!part) throw new Error('That grade part is not in this year’s assessment weights');
    if (part.source === 'attendance') throw new Error('The attendance part is filled from roll calls, not from an exam');
  }
  return cls.academic_year_id;
}

export async function createExam(input: ExamInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('GRADE_CREATE');
    const e = ExamSchema.parse(input);
    const academic_year_id = await examYear(db, e.class_id, e.part_key);
    const { data, error } = await db.from('exams')
      .insert({ ...e, instructions: e.instructions || null, part_key: e.part_key || null, academic_year_id, created_by: me.systemUser.id })
      .select('id')
      .single();
    if (error) throw new Error(missing(error.message));
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateExam(id: string, input: ExamInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const exam = await getExam(db, id);
    const e = ExamSchema.parse(input);
    if (exam.status !== 'DRAFT' && (e.class_id !== exam.class_id || e.duration_minutes !== exam.duration_minutes || e.shuffle !== exam.shuffle)) {
      throw new Error('The class, time and order cannot change once the exam has been opened');
    }
    const academic_year_id = await examYear(db, e.class_id, e.part_key);
    // Turning the room key on while the exam is open makes one at once
    const start_key = e.use_start_key && exam.status !== 'DRAFT' ? exam.start_key ?? newStartKey() : exam.start_key;
    await db.from('exams')
      .update({ ...e, instructions: e.instructions || null, part_key: e.part_key || null, academic_year_id, start_key })
      .eq('id', id)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Only an exam nobody has started can be deleted. */
export async function deleteExam(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const exam = await getExam(db, id);
    if (exam.started > 0) throw new Error('Students have already sat this exam — close it instead');
    await db.from('exams').delete().eq('id', id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Questions ────────────────────────────────────────────────────────────────

const QuestionSchema = z
  .object({
    kind: z.enum(['CHOICE', 'TRUE_FALSE', 'SHORT']),
    prompt: z.string().trim().min(1, 'Write the question').max(4000),
    options: z.array(z.string().trim().max(1000)).max(MAX_OPTIONS),
    answer: z.string().trim().max(4000),
    marks: z.coerce.number().positive('Marks must be above 0').max(100),
  })
  .transform((q) => ({ ...q, options: q.kind === 'CHOICE' ? q.options : [] }))
  .superRefine((q, ctx) => {
    if (q.kind === 'CHOICE') {
      if (q.options.length < 2 || q.options.some((o) => !o)) ctx.addIssue({ code: 'custom', message: 'Write at least two choices and leave none empty' });
      const n = Number(q.answer);
      if (!/^\d+$/.test(q.answer) || n >= q.options.length) ctx.addIssue({ code: 'custom', message: 'Mark the right choice' });
    }
    if (q.kind === 'TRUE_FALSE' && q.answer !== 'true' && q.answer !== 'false') {
      ctx.addIssue({ code: 'custom', message: 'Choose whether the statement is true or false' });
    }
  });

export type QuestionInput = z.input<typeof QuestionSchema>;

export async function saveQuestion(examId: string, questionId: string | null, input: QuestionInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const exam = await getExam(db, examId);
    requireDraft(exam);
    const q = QuestionSchema.parse(input);
    const row = { kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer || null, marks: Math.round(q.marks * 100) / 100 };
    if (questionId) {
      await db.from('exam_questions').update(row).eq('id', questionId).eq('exam_id', examId).then(check);
    } else {
      if (exam.questions >= MAX_QUESTIONS) throw new Error(`An exam can have at most ${MAX_QUESTIONS} questions`);
      const questions = await getQuestions(db, examId);
      const position = questions.reduce((max, x) => Math.max(max, x.position), 0) + 1;
      await db.from('exam_questions').insert({ ...row, exam_id: examId, position }).then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteQuestion(examId: string, questionId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    requireDraft(await getExam(db, examId));
    await db.from('exam_questions').delete().eq('id', questionId).eq('exam_id', examId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Swap a question with the one above (-1) or below (+1). */
export async function moveQuestion(examId: string, questionId: string, direction: -1 | 1): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    requireDraft(await getExam(db, examId));
    const questions = await getQuestions(db, examId);
    const i = questions.findIndex((q) => q.id === questionId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= questions.length) return { ok: true };
    // Number them 1…n first, so equal positions can't stop the swap
    const order = questions.map((q) => q.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [index, id] of order.entries()) {
      await db.from('exam_questions').update({ position: index + 1 }).eq('id', id).then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Open / close ─────────────────────────────────────────────────────────────

/** Open the exam: every student of the class gets a ticket. Also used to reopen, and to give late students a ticket. */
export async function openExam(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const exam = await getExam(db, id);
    if (exam.questions === 0) throw new Error('Add at least one question first');
    await ensureTickets(db, exam);
    if (exam.status !== 'OPEN') {
      await db.from('exams')
        .update({
          status: 'OPEN',
          opened_at: exam.opened_at ?? new Date().toISOString(),
          closed_at: null,
          start_key: exam.use_start_key ? exam.start_key ?? newStartKey() : exam.start_key,
        })
        .eq('id', id)
        .then(check);
      // Telegram: the first time it opens, tell the students who connected
      if (exam.status === 'DRAFT') {
        telegramLater(async (bg) => {
          const { data } = await bg.from('exam_attempts').select('student:students(person_id)').eq('exam_id', id);
          const people = ((data ?? []) as unknown as { student: { person_id: string } | null }[]).map((r) => r.student?.person_id).filter((p): p is string => Boolean(p));
          const text =
            `🖊️ <b>${escapeHtml(exam.title)}</b>\n` +
            escapeHtml(`የ${exam.subject_name_am} የኦንላይን ፈተና ተከፍቷል — ${exam.duration_minutes} ደቂቃ።\n`) +
            escapeHtml(`The ${exam.subject_name} online exam is open — ${exam.duration_minutes} minutes.\n`) +
            `${siteUrl()}/exam`;
          await telegramToPersons(bg, people, text);
        });
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Close the exam: nobody can start any more, and unfinished answers are handed in as they are. */
export async function closeExam(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const exam = await getExam(db, id);
    if (exam.status !== 'OPEN') throw new Error('The exam is not open');
    await db.from('exams').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('id', id).then(check);
    await finalizeAttempts(db, exam, await getQuestions(db, id), true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Marking ──────────────────────────────────────────────────────────────────

/** The teacher's marks for the short answers of one handed-in exam. */
export async function markShortAnswers(attemptId: string, given: Record<string, number>): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const attempt = toAttempt((await db.from('exam_attempts').select('*').eq('id', attemptId).single().then(check)) as Record<string, unknown>);
    if (!attempt.submitted_at) throw new Error('The student has not handed in this exam yet');
    const questions = await getQuestions(db, attempt.exam_id);
    const teacherMarks = { ...attempt.marks };
    for (const q of questions) {
      if (q.kind !== 'SHORT' || given[q.id] === undefined) continue;
      const m = Number(given[q.id]);
      if (Number.isNaN(m) || m < 0 || m > q.marks) throw new Error(`Question marks must be between 0 and ${q.marks}`);
      teacherMarks[q.id] = Math.round(m * 100) / 100;
    }
    const m = markAttempt(questions, attempt.answers, teacherMarks);
    await db.from('exam_attempts')
      .update({ marks: m.marks, score: m.score, needs_marking: m.needsMarking })
      .eq('id', attemptId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Extra time ───────────────────────────────────────────────────────────────

/**
 * Give one student more minutes. If their time already ran out or they had
 * handed in, the exam is reopened for them with their answers kept, and the
 * minutes count from now — they type their code again to continue.
 */
export async function giveExtraTime(attemptId: string, minutes: number): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const add = z.coerce.number().int('Whole minutes only').min(1, 'At least 1 minute').max(180, 'At most 180 minutes at a time').parse(minutes);
    const attempt = toAttempt((await db.from('exam_attempts').select('*').eq('id', attemptId).single().then(check)) as Record<string, unknown>);
    const exam = await getExam(db, attempt.exam_id);
    if (exam.status !== 'OPEN') throw new Error('Open the exam again first — students can only continue while it is open');
    const { error } = await db.from('exam_attempts')
      .update({
        extra_minutes: extraMinutesAfter(attempt, exam, add),
        // Handed in: back to writing, with the answers kept and the marks worked out again on hand-in
        ...(attempt.submitted_at ? { submitted_at: null, marks: {}, score: null, needs_marking: false, ended_reason: null } : {}),
      })
      .eq('id', attemptId);
    if (error) throw new Error(/extra_minutes/.test(error.message) ? 'Run database migration 022 again (it adds extra time)' : error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── One student, one phone ───────────────────────────────────────────────────

/** Let the next phone that opens this student's code take the exam over (their phone died, or they share one). */
export async function allowAnotherPhone(attemptId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const attempt = toAttempt((await db.from('exam_attempts').select('*').eq('id', attemptId).single().then(check)) as Record<string, unknown>);
    if (attempt.submitted_at) throw new Error('This exam is already handed in — give extra time to reopen it');
    await db.from('exam_attempts').update({ new_device_allowed: true }).eq('id', attemptId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * A new code for one student, when someone else got theirs: the old code stops
 * working, and anything written with it is cleared so the student starts fresh.
 */
export async function giveNewCode(attemptId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    const attempt = toAttempt((await db.from('exam_attempts').select('*').eq('id', attemptId).single().then(check)) as Record<string, unknown>);
    const exam = await getExam(db, attempt.exam_id);
    if (exam.status !== 'OPEN') throw new Error('Open the exam first');
    const fresh = {
      started_at: null,
      submitted_at: null,
      answers: {},
      marks: {},
      score: null,
      needs_marking: false,
      device_id: null,
      new_device_allowed: false,
      extra_minutes: 0,
      focus_lost: 0,
      away_seconds: 0,
      left_at: null,
      ended_reason: null,
    };
    for (let i = 0; i < 3; i++) {
      const { error } = await db.from('exam_attempts').update({ ...fresh, ticket: newTicket() }).eq('id', attemptId);
      if (!error) return { ok: true };
      if (error.code !== '23505') throw new Error(error.message);
    }
    throw new Error('Could not make a new code — try again');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** A new room key (e.g. it was seen outside the class). Students already writing are not affected. */
export async function changeStartKey(examId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('GRADE_CREATE');
    await db.from('exams').update({ start_key: newStartKey() }).eq('id', examId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── To grades ────────────────────────────────────────────────────────────────

/**
 * Write each student's result into their grade for this subject and term, as
 * the exam's part of the assessment scheme (scaled to its marks). Other parts
 * of the grade are kept; the grade goes back to PENDING for approval.
 */
export async function sendExamToGrades(id: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('GRADE_CREATE');
    const exam = await getExam(db, id);
    if (exam.status !== 'CLOSED') throw new Error('Close the exam first');
    if (!exam.part_key) throw new Error('Choose which grade part this exam fills (Edit exam)');
    if (exam.needs_marking > 0) throw new Error('Mark the short answers first');

    const year = (await db.from('academic_years').select('assessment_scheme').eq('id', exam.academic_year_id).single().then(check)) as {
      assessment_scheme: unknown;
    };
    const part = parseScheme(year.assessment_scheme).find((p) => p.key === exam.part_key);
    if (!part) throw new Error('That grade part is no longer in the year’s assessment weights');

    const attempts = ((await db.from('exam_attempts').select('*').eq('exam_id', id).not('submitted_at', 'is', null).then(check)) as Record<string, unknown>[]).map(toAttempt);
    if (attempts.length === 0) throw new Error('Nobody has handed in this exam');
    const existing = (await db.from('grades')
      .select('id, student_id, scores')
      .eq('subject_id', exam.subject_id)
      .eq('academic_year_id', exam.academic_year_id)
      .eq('term', exam.term)
      .in('student_id', attempts.map((a) => a.student_id))
      .then(check)) as { id: string; student_id: string; scores: unknown }[];
    const byStudent = new Map(existing.map((g) => [g.student_id, g]));
    if (existing.length && !me.permissions.includes('GRADE_UPDATE')) {
      throw new Error('Some students already have a grade for this subject and term — only staff who may change grades can send these results');
    }

    let count = 0;
    for (const a of attempts) {
      const score = scaleToPart(a.score ?? 0, exam.total_marks, part.weight);
      const grade = byStudent.get(a.student_id);
      const scores = [...parseScores(grade?.scores).filter((s) => s.key !== part.key), { key: part.key, max: part.weight, score }];
      const row = {
        scores,
        total_score: Math.min(100, Math.round(scores.reduce((sum, s) => sum + s.score, 0) * 100) / 100),
        status: 'PENDING',
        entered_by: me.systemUser.id,
        approved_by: null,
        approved_at: null,
      };
      const { error } = grade
        ? await db.from('grades').update(row).eq('id', grade.id)
        : await db.from('grades').insert({ student_id: a.student_id, subject_id: exam.subject_id, academic_year_id: exam.academic_year_id, term: exam.term, ...row });
      if (error) throw new Error(/scores|total_score/.test(error.message) ? 'Run database migration 018 first (configurable assessment weights)' : error.message);
      count += 1;
    }
    await db.from('exams').update({ sent_to_grades_at: new Date().toISOString() }).eq('id', id).then(check);
    if (count) {
      notifyLater(
        { permissions: ['GRADE_APPROVE'], except: me.systemUser.id },
        { title: 'ውጤቶች ማጽደቅ ይጠብቃሉ · Grades to approve', body: `Results of the online exam "${exam.title}" were added to grades.`, url: '/dashboard/education/grades', tag: 'grades-to-approve' }
      );
    }
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
