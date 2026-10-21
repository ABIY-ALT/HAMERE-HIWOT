'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Online exams — the student's side (/exam). No account: the ticket printed
// for the student identifies them and the exam. Everything is checked here,
// with the service role; the right answers never leave the server, and the
// server keeps the time (started_at + duration + extra, plus a short grace).
//
// So that nobody can sit another student's exam:
//   • the ticket is locked to the phone that starts it (an httpOnly cookie);
//     the teacher can let another phone take over (a phone that died),
//   • a phone that has started one student's exam cannot start another's,
//   • starting needs the room key the teacher shows in class.
// Every refused try is counted for the teacher.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { platformClient, tenantClient } from '@/lib/tenant/db';
import { loadTenant, loadTenantAccess } from '@/lib/tenant/context';
import { loadBranding } from '@/lib/tenant/branding';
import { brandOf } from '@/lib/branding';
import {
  GRACE_SECONDS,
  OFFLINE_SECONDS,
  type OfflineAnswers,
  deadline,
  examTotal,
  isTimeUp,
  markAttempt,
  normalizeTicket,
  questionsForStudent,
  type EndedReason,
  type ExamQuestion,
  type StudentQuestion,
} from '@/lib/exams/types';

export interface TicketInfo {
  student: string;
  student_am: string;
  title: string;
  subject: string;
  subject_am: string;
  class_name: string;
  class_name_am: string;
  instructions: string;
  duration_minutes: number;
  questions: number;
  total_marks: number;
  /** The room key is needed to start */
  needs_key: boolean;
  /** Handed in after leaving the page this many times; 0 = off */
  leave_limit: number;
  /** The Sunday school giving the exam (header logo and name) */
  school: { name_en: string; name_am: string; logoUrl: string | null; color: string };
}

/** Shown after handing in; the score only when the teacher allows it. */
export interface ExamResult {
  score: number | null;
  total: number;
  /** Short answers still to be marked by the teacher */
  pending: boolean;
  ended_reason: EndedReason | null;
}

export type TicketError = 'NOT_FOUND' | 'NOT_OPEN' | 'CLOSED' | 'UNAVAILABLE' | 'OTHER_PHONE' | 'PHONE_TAKEN' | 'WRONG_KEY';

export type TicketResult =
  | { ok: false; error: TicketError }
  | { ok: true; state: 'READY'; info: TicketInfo }
  | {
      ok: true;
      state: 'IN_PROGRESS';
      info: TicketInfo;
      questions: StudentQuestion[];
      answers: Record<string, string>;
      deadline: string;
      now: string;
      /** Times the student has left the exam page so far */
      left: number;
    }
  | { ok: true; state: 'SUBMITTED'; info: TicketInfo; result: ExamResult };

type Row = Record<string, unknown>;
type Named = { name_en: string; name_am: string | null } | null;

const MAX_ANSWER_LENGTH = 4000;
const DEVICE_COOKIE = 'ssms_exam_device';

/** This phone's id: a random value in an httpOnly cookie, made on the first visit. */
async function deviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  store.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

async function findAttempt(ticket: string) {
  const code = normalizeTicket(ticket);
  if (!/^[A-Z0-9]{8}$/.test(code)) return null;
  // Tickets are unique across all Sunday schools: the ticket says whose exam it is
  const { data: owner, error: ownerError } = await platformClient().from('exam_attempts').select('tenant_id').eq('ticket', code).maybeSingle();
  if (ownerError) {
    console.error('exam ticket lookup failed:', ownerError.message);
    throw new Error(ownerError.message);
  }
  if (!owner) return null;
  const tenantId = owner.tenant_id as string;
  const access = await loadTenantAccess(tenantId);
  if (access.mode === 'blocked' || !access.modules.includes('online_exams')) return null;
  const db = tenantClient(tenantId, { readOnly: access.mode !== 'full' });
  const { data, error } = await db.from('exam_attempts')
    .select('*, student:students(person:persons!students_person_id_fkey(full_name_en, full_name_am)), exam:exams(*, class:classes(name_en, name_am), subject:subjects(name_en, name_am))')
    .eq('ticket', code)
    .maybeSingle();
  // A failing query is "could not reach the system", never "code not found"
  if (error) {
    console.error('exam ticket lookup failed:', error.message);
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as Row;
  const exam = row.exam as Row;
  const [tenant, branding] = await Promise.all([loadTenant(tenantId), loadBranding(tenantId)]);
  const look = brandOf(branding, tenant?.is_default ?? false);
  const questions = ((await db.from('exam_questions').select('*').eq('exam_id', exam.id).order('position').then((r) => r.data)) ?? []) as Row[];
  return {
    db,
    school: {
      name_en: tenant?.name_en ?? '',
      name_am: tenant?.name_am || tenant?.name_en || '',
      logoUrl: look.logoUrl,
      color: look.color,
    },
    attempt: {
      id: row.id as string,
      started_at: (row.started_at as string) ?? null,
      submitted_at: (row.submitted_at as string) ?? null,
      answers: (row.answers as Record<string, string>) ?? {},
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      needs_marking: Boolean(row.needs_marking),
      focus_lost: Number(row.focus_lost ?? 0),
      extra_minutes: Number(row.extra_minutes ?? 0),
      device_id: (row.device_id as string | null) ?? null,
      new_device_allowed: Boolean(row.new_device_allowed),
      device_changes: Number(row.device_changes ?? 0),
      blocked_tries: Number(row.blocked_tries ?? 0),
      away_seconds: Number(row.away_seconds ?? 0),
      left_at: (row.left_at as string | null) ?? null,
      ended_reason: (row.ended_reason as EndedReason) ?? null,
      person: (row.student as { person: { full_name_en: string; full_name_am: string | null } | null } | null)?.person ?? null,
    },
    exam: {
      id: exam.id as string,
      title: exam.title as string,
      instructions: (exam.instructions as string) ?? '',
      status: exam.status as string,
      duration_minutes: Number(exam.duration_minutes),
      shuffle: Boolean(exam.shuffle),
      show_score: Boolean(exam.show_score),
      use_start_key: Boolean(exam.use_start_key),
      start_key: (exam.start_key as string) ?? null,
      leave_limit: Number(exam.leave_limit ?? 0),
      class: exam.class as Named,
      subject: exam.subject as Named,
    },
    questions: questions.map(
      (q): ExamQuestion => ({
        id: q.id as string,
        exam_id: q.exam_id as string,
        position: Number(q.position),
        kind: q.kind as ExamQuestion['kind'],
        prompt: q.prompt as string,
        options: Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [],
        answer: (q.answer as string) ?? '',
        marks: Number(q.marks),
      })
    ),
  };
}

type Found = NonNullable<Awaited<ReturnType<typeof findAttempt>>>;

function info({ attempt, exam, questions, school }: Found): TicketInfo {
  return {
    school,
    student: attempt.person?.full_name_en ?? '',
    student_am: attempt.person?.full_name_am || attempt.person?.full_name_en || '',
    title: exam.title,
    subject: exam.subject?.name_en ?? '',
    subject_am: exam.subject?.name_am || exam.subject?.name_en || '',
    class_name: exam.class?.name_en ?? '',
    class_name_am: exam.class?.name_am || exam.class?.name_en || '',
    instructions: exam.instructions,
    duration_minutes: exam.duration_minutes,
    questions: questions.length,
    total_marks: examTotal(questions),
    needs_key: exam.use_start_key && Boolean(exam.start_key),
    leave_limit: exam.leave_limit,
  };
}

/**
 * Is this phone allowed to use the ticket? A started exam stays on its phone
 * unless the teacher allowed another one (then this phone takes it over).
 * `count` records refused tries for the teacher (not on every autosave).
 */
async function phoneAllowed(found: Found, device: string, count: boolean): Promise<boolean> {
  const { attempt, db } = found;
  if (!attempt.started_at || !attempt.device_id || attempt.device_id === device) return true;
  if (attempt.new_device_allowed) {
    await db.from('exam_attempts')
      .update({ device_id: device, new_device_allowed: false, device_changes: attempt.device_changes + 1 })
      .eq('id', attempt.id);
    attempt.device_id = device;
    return true;
  }
  if (count) await db.from('exam_attempts').update({ blocked_tries: attempt.blocked_tries + 1 }).eq('id', attempt.id);
  return false;
}

/** A phone sits one student's exam: has this phone already started another student's? (Both are recorded.) */
async function phoneTakenByOther(found: Found, device: string): Promise<boolean> {
  const { attempt, exam, db } = found;
  if (attempt.new_device_allowed) return false;
  const { data } = await db.from('exam_attempts')
    .select('id, tried_other_codes')
    .eq('exam_id', exam.id)
    .eq('device_id', device)
    .neq('id', attempt.id)
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const other = data as { id: string; tried_other_codes: number };
  await db.from('exam_attempts').update({ tried_other_codes: Number(other.tried_other_codes) + 1 }).eq('id', other.id);
  await db.from('exam_attempts').update({ blocked_tries: attempt.blocked_tries + 1 }).eq('id', attempt.id);
  return true;
}

/** Only answers to this exam's questions, as short text. */
function cleanAnswers(questions: ExamQuestion[], answers: Record<string, unknown>): Record<string, string> {
  const ids = new Set(questions.map((q) => q.id));
  return Object.fromEntries(
    Object.entries(answers ?? {})
      .filter(([id, v]) => ids.has(id) && typeof v === 'string')
      .map(([id, v]) => [id, (v as string).slice(0, MAX_ANSWER_LENGTH)])
  );
}

/**
 * Answers the phone kept while it had no network. They count when they were
 * written before the time was up (+ grace) and arrive within OFFLINE_SECONDS
 * after it; if they arrive late, how late is kept for the teacher (031). Only
 * for the exam's own phone, while the exam is open and not handed in.
 */
async function acceptOffline(found: Found, local: OfflineAnswers | null | undefined): Promise<void> {
  const { attempt, exam, db } = found;
  if (!local || !attempt.started_at || attempt.submitted_at || exam.status !== 'OPEN') return;
  const end = new Date(deadline(attempt, exam)!).getTime();
  const written = new Date(local.written_at).getTime();
  const now = Date.now();
  if (!Number.isFinite(written) || written < new Date(attempt.started_at).getTime() || written > now + 60_000) return;
  if (written > end + GRACE_SECONDS * 1000 || now > end + (GRACE_SECONDS + OFFLINE_SECONDS) * 1000) return;
  const answers = cleanAnswers(found.questions, local.answers ?? {});
  const late = Math.round((now - end) / 1000);
  const update: Record<string, unknown> = { answers, ...(late > GRACE_SECONDS ? { late_sync_seconds: late } : {}) };
  let { error } = await db.from('exam_attempts').update(update).eq('id', attempt.id).is('submitted_at', null);
  if (error && /late_sync_seconds/.test(error.message)) ({ error } = await db.from('exam_attempts').update({ answers }).eq('id', attempt.id).is('submitted_at', null));
  if (!error) attempt.answers = answers;
}

/** Hand in: mark what can be marked automatically and stop the clock. */
async function handIn(found: Found, answers: Record<string, string>, reason: EndedReason) {
  const m = markAttempt(found.questions, answers);
  const { data } = await found.db.from('exam_attempts')
    .update({
      answers,
      submitted_at: new Date().toISOString(),
      marks: m.marks,
      score: m.score,
      needs_marking: m.needsMarking,
      ended_reason: reason,
      left_at: null,
    })
    .eq('id', found.attempt.id)
    .is('submitted_at', null)
    .select('score, needs_marking, ended_reason')
    .maybeSingle();
  // Already handed in (another tab, or the teacher closed the exam): keep what was saved
  return (data as { score: number; needs_marking: boolean; ended_reason: EndedReason } | null) ?? found.attempt;
}

function submitted(found: Found, saved: { score: number | null; needs_marking: boolean; ended_reason: EndedReason | null }): TicketResult {
  return {
    ok: true,
    state: 'SUBMITTED',
    info: info(found),
    result: {
      score: found.exam.show_score && saved.score !== null ? Number(saved.score) : null,
      total: examTotal(found.questions),
      pending: saved.needs_marking,
      ended_reason: saved.ended_reason,
    },
  };
}

/**
 * The student is back on the exam page (or opened it again after closing it):
 * count the time away. With a leave limit, reaching it hands the exam in.
 */
async function cameBack(found: Found, answers: Record<string, string>, clientSeconds = 0): Promise<TicketResult | null> {
  const { attempt, exam, db } = found;
  const seconds = attempt.left_at
    ? Math.round((Date.now() - new Date(attempt.left_at).getTime()) / 1000)
    : Math.min(Math.max(Math.round(clientSeconds), 0), 3 * 3600);
  const left = attempt.focus_lost + 1;
  await db.from('exam_attempts')
    .update({ focus_lost: left, away_seconds: attempt.away_seconds + Math.max(seconds, 0), left_at: null })
    .eq('id', attempt.id)
    .is('submitted_at', null);
  attempt.focus_lost = left;
  attempt.left_at = null;
  if (exam.leave_limit > 0 && left >= exam.leave_limit) return submitted(found, await handIn(found, answers, 'LEFT_PAGE'));
  return null;
}

/** The exam itself, for a student who is writing. */
function inProgress(found: Found): TicketResult {
  const { attempt, exam, questions } = found;
  return {
    ok: true,
    state: 'IN_PROGRESS',
    info: info(found),
    questions: questionsForStudent(questions, attempt.id, exam.shuffle),
    answers: attempt.answers,
    deadline: deadline(attempt, exam)!,
    now: new Date().toISOString(),
    left: attempt.focus_lost,
  };
}

/**
 * What the student sees after typing the ticket — and, once started, the exam itself.
 * `local`: answers the phone kept while it had no network, sent first (acceptOffline).
 */
export async function openTicket(ticket: string, local?: OfflineAnswers | null): Promise<TicketResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'UNAVAILABLE' };
  try {
    const found = await findAttempt(ticket);
    if (!found) return { ok: false, error: 'NOT_FOUND' };
    const device = await deviceId();
    const { attempt, exam } = found;
    if (!(await phoneAllowed(found, device, true))) return { ok: false, error: 'OTHER_PHONE' };
    await acceptOffline(found, local);
    if (attempt.submitted_at) return submitted(found, attempt);
    if (attempt.started_at && exam.status !== 'OPEN') return submitted(found, await handIn(found, attempt.answers, 'CLOSED'));
    if (attempt.started_at && isTimeUp(attempt, exam, Date.now(), GRACE_SECONDS)) return submitted(found, await handIn(found, attempt.answers, 'TIME'));
    if (exam.status === 'DRAFT') return { ok: false, error: 'NOT_OPEN' };
    if (exam.status === 'CLOSED') return { ok: false, error: 'CLOSED' };
    if (!attempt.started_at) {
      if (await phoneTakenByOther(found, device)) return { ok: false, error: 'PHONE_TAKEN' };
      return { ok: true, state: 'READY', info: info(found) };
    }
    // Closed the page while away and opened it again: that counts as leaving too
    if (attempt.left_at) {
      const handedIn = await cameBack(found, attempt.answers);
      if (handedIn) return handedIn;
    }
    return inProgress(found);
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

/** Start the clock (only the first time) with the room key, then return the exam. */
export async function startExam(ticket: string, key: string): Promise<TicketResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'UNAVAILABLE' };
  try {
    const found = await findAttempt(ticket);
    if (!found) return { ok: false, error: 'NOT_FOUND' };
    const { attempt, exam, db } = found;
    if (exam.status === 'OPEN' && !attempt.started_at) {
      const device = await deviceId();
      if (await phoneTakenByOther(found, device)) return { ok: false, error: 'PHONE_TAKEN' };
      if (exam.use_start_key && exam.start_key && key.trim() !== exam.start_key) return { ok: false, error: 'WRONG_KEY' };
      await db.from('exam_attempts')
        .update({ started_at: new Date().toISOString(), device_id: device, new_device_allowed: false })
        .eq('id', attempt.id)
        .is('started_at', null);
    }
    return openTicket(ticket);
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

/** A found ticket that this phone may write on right now, or null. */
async function writing(ticket: string) {
  const found = await findAttempt(ticket);
  if (!found || !found.attempt.started_at || found.attempt.submitted_at) return null;
  if (!(await phoneAllowed(found, await deviceId(), false))) return null;
  return found;
}

/** The time left, checked on the server — the teacher may have given extra time. */
export type ExamClock = { state: 'IN_PROGRESS'; deadline: string; now: string } | { state: 'OVER' };

export async function examClock(ticket: string): Promise<ExamClock | null> {
  if (!isSupabaseEnabled()) return null;
  try {
    const found = await writing(ticket);
    if (!found) return { state: 'OVER' };
    const { attempt, exam } = found;
    if (exam.status !== 'OPEN' || isTimeUp(attempt, exam, Date.now(), GRACE_SECONDS)) return { state: 'OVER' };
    return { state: 'IN_PROGRESS', deadline: deadline(attempt, exam)!, now: new Date().toISOString() };
  } catch {
    return null;
  }
}

/** Autosave while the student works. Refused once the time is up, the exam is closed, or on another phone. */
export async function saveAnswers(
  ticket: string,
  answers: Record<string, string>
): Promise<{ ok: boolean; closed?: boolean; deadline?: string; now?: string }> {
  if (!isSupabaseEnabled()) return { ok: false };
  try {
    const found = await writing(ticket);
    if (!found) return { ok: false, closed: true };
    const { attempt, exam } = found;
    if (exam.status !== 'OPEN' || isTimeUp(attempt, exam, Date.now(), GRACE_SECONDS)) return { ok: false, closed: true };
    const { error } = await found.db.from('exam_attempts')
      .update({ answers: cleanAnswers(found.questions, answers) })
      .eq('id', attempt.id)
      .is('submitted_at', null);
    return { ok: !error, deadline: deadline(attempt, exam)!, now: new Date().toISOString() };
  } catch {
    return { ok: false };
  }
}

/**
 * Hand in the exam (also when the time runs out on the student's phone).
 * `writtenAt` (server time of the last change): sent by a phone that had no
 * network, so answers written in time still count when they arrive late.
 */
export async function submitExam(ticket: string, answers: Record<string, string>, writtenAt?: string): Promise<TicketResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'UNAVAILABLE' };
  try {
    const found = await findAttempt(ticket);
    if (!found) return { ok: false, error: 'NOT_FOUND' };
    if (!(await phoneAllowed(found, await deviceId(), true))) return { ok: false, error: 'OTHER_PHONE' };
    if (writtenAt) await acceptOffline(found, { answers, written_at: writtenAt });
    const { attempt, exam } = found;
    if (attempt.submitted_at) return submitted(found, attempt);
    if (!attempt.started_at) return { ok: false, error: 'NOT_OPEN' };
    // Late or after closing: hand in what was saved before, not what was sent now
    if (exam.status !== 'OPEN') return submitted(found, await handIn(found, attempt.answers, 'CLOSED'));
    if (isTimeUp(attempt, exam, Date.now(), GRACE_SECONDS)) return submitted(found, await handIn(found, attempt.answers, 'TIME'));
    return submitted(found, await handIn(found, cleanAnswers(found.questions, answers), 'STUDENT'));
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

/** The student switched away from the exam page: remember since when. */
export async function reportLeft(ticket: string): Promise<void> {
  if (!isSupabaseEnabled()) return;
  try {
    const found = await writing(ticket);
    if (!found || found.attempt.left_at) return;
    await found.db.from('exam_attempts').update({ left_at: new Date().toISOString() }).eq('id', found.attempt.id).is('left_at', null);
  } catch {
    // Not important enough to bother the student
  }
}

/**
 * The student is back on the exam page. Returns how many times they have left
 * so far — or the handed-in result when the exam's leave limit was reached.
 * `seconds` (measured on the phone) is used only if leaving was not recorded.
 */
export async function reportBack(
  ticket: string,
  seconds: number,
  answers: Record<string, string>
): Promise<{ left: number; limit: number; result?: TicketResult } | null> {
  if (!isSupabaseEnabled()) return null;
  try {
    const found = await writing(ticket);
    if (!found) return null;
    const handedIn = await cameBack(found, cleanAnswers(found.questions, answers), seconds);
    return { left: found.attempt.focus_lost, limit: found.exam.leave_limit, ...(handedIn ? { result: handedIn } : {}) };
  } catch {
    return null;
  }
}
