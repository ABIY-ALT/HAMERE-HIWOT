// ─────────────────────────────────────────────────────────────────────────────
// Online exams — shapes and rules shared by the teacher pages, the student
// page (/exam) and the server actions. Pure functions, no browser or file APIs.
// ─────────────────────────────────────────────────────────────────────────────

export type ExamStatus = 'DRAFT' | 'OPEN' | 'CLOSED';
export type QuestionKind = 'CHOICE' | 'TRUE_FALSE' | 'SHORT';
/** How an exam ended for a student */
export type EndedReason = 'STUDENT' | 'TIME' | 'CLOSED' | 'LEFT_PAGE';

export const EXAM_STATUS_BADGE: Record<ExamStatus, string> = {
  DRAFT: 'badge bg-slate-100 text-slate-600',
  OPEN: 'badge badge-success',
  CLOSED: 'badge badge-info',
};

/** Where /exam keeps the ticket of the exam in progress (also set by the student portal’s Start button). */
export const EXAM_TICKET_KEY = 'ssms-exam-ticket';

export const MAX_OPTIONS = 6;
export const MAX_QUESTIONS = 100;
/** Answers saved this long after the time is up still count (slow phones, poor network). */
export const GRACE_SECONDS = 30;

export interface Exam {
  id: string;
  title: string;
  instructions: string;
  class_id: string;
  subject_id: string;
  academic_year_id: string;
  term: number;
  /** Part of the year's assessment scheme the result fills; '' = not sent to grades */
  part_key: string;
  duration_minutes: number;
  shuffle: boolean;
  show_score: boolean;
  /** Students need the room key (shown by the teacher in class) to start */
  use_start_key: boolean;
  start_key: string | null;
  /** Hand in automatically after leaving the page this many times; 0 = off */
  leave_limit: number;
  status: ExamStatus;
  opened_at: string | null;
  closed_at: string | null;
  sent_to_grades_at: string | null;
  created_at: string;
}

/** A question as the teacher sees it — with the right answer. */
export interface ExamQuestion {
  id: string;
  exam_id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  /** CHOICE: option number as text ("0"…); TRUE_FALSE: "true"/"false"; SHORT: model answer */
  answer: string;
  marks: number;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  ticket: string;
  started_at: string | null;
  submitted_at: string | null;
  answers: Record<string, string>;
  marks: Record<string, number>;
  score: number | null;
  needs_marking: boolean;
  focus_lost: number;
  /** Extra time the teacher gave this student, added to the exam time */
  extra_minutes: number;
  /** The teacher allowed the next phone that opens this code to take it over */
  new_device_allowed: boolean;
  device_changes: number;
  /** Times this code was tried on another phone */
  blocked_tries: number;
  /** Times this student's phone tried another student's code */
  tried_other_codes: number;
  away_seconds: number;
  /** Set while the student is away from the exam page */
  left_at: string | null;
  ended_reason: EndedReason | null;
}

/** What a student's phone receives: no right answers, options in the student's own order. */
export interface StudentQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** i = the option's original number, which is what gets saved as the answer */
  options: { i: number; text: string }[];
  marks: number;
}

export type AttemptState = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Tickets ──────────────────────────────────────────────────────────────────

/** No 0/O, 1/I/L — easy to read from a printed slip and to type on a phone. */
const TICKET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 8 random characters (31^8 ≈ 850 billion codes), shown as ABCD-EFGH. */
export function newTicket(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TICKET_ALPHABET[b % TICKET_ALPHABET.length]).join('');
}

/** The 4-digit room key the teacher shows in class; students need it to start. */
export function newStartKey(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 10000).padStart(4, '0');
}

export function formatTicket(ticket: string): string {
  return ticket.length === 8 ? `${ticket.slice(0, 4)}-${ticket.slice(4)}` : ticket;
}

/** What the student typed → the stored form (capitals, without the dash or spaces). */
export function normalizeTicket(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ── Marking ──────────────────────────────────────────────────────────────────

export const examTotal = (questions: Pick<ExamQuestion, 'marks'>[]) => round2(questions.reduce((s, q) => s + q.marks, 0));

/** Marks for an automatically marked question; null for a short answer (the teacher marks it). */
export function autoMark(q: Pick<ExamQuestion, 'kind' | 'answer' | 'marks'>, given: string | undefined): number | null {
  if (q.kind === 'SHORT') return null;
  return given !== undefined && given !== '' && given === q.answer ? q.marks : 0;
}

/** Marks every question it can; short answers keep the teacher's marks if already given. */
export function markAttempt(questions: ExamQuestion[], answers: Record<string, string>, teacherMarks: Record<string, number> = {}) {
  const marks: Record<string, number> = {};
  let needsMarking = false;
  for (const q of questions) {
    const auto = autoMark(q, answers[q.id]);
    if (auto !== null) marks[q.id] = auto;
    else if (!(answers[q.id] ?? '').trim()) marks[q.id] = 0; // blank short answer: nothing to mark
    else if (teacherMarks[q.id] !== undefined) marks[q.id] = Math.min(Math.max(teacherMarks[q.id], 0), q.marks);
    else needsMarking = true;
  }
  const score = round2(Object.values(marks).reduce((s, m) => s + m, 0));
  return { marks, score, needsMarking };
}

/** The exam score scaled to the marks of the grade part it fills (e.g. 38/50 → 19/25). */
export function scaleToPart(score: number, total: number, partMax: number): number {
  if (total <= 0) return 0;
  return round2(Math.min(score / total, 1) * partMax);
}

// ── Time ─────────────────────────────────────────────────────────────────────

type Timed = Pick<ExamAttempt, 'started_at'> & { extra_minutes?: number };

/** When the student's time runs out (ISO): start + exam time + their extra time; null before they start. */
export function deadline(attempt: Timed, exam: Pick<Exam, 'duration_minutes'>): string | null {
  if (!attempt.started_at) return null;
  const minutes = exam.duration_minutes + (attempt.extra_minutes ?? 0);
  return new Date(new Date(attempt.started_at).getTime() + minutes * 60_000).toISOString();
}

export function isTimeUp(attempt: Timed, exam: Pick<Exam, 'duration_minutes'>, now = Date.now(), graceSeconds = 0): boolean {
  const end = deadline(attempt, exam);
  return end !== null && now > new Date(end).getTime() + graceSeconds * 1000;
}

/**
 * The student's extra_minutes after the teacher gives `add` more minutes.
 * Before the start, and while time is left, they are simply added. When the
 * time has already run out (e.g. the phone died and the exam was handed in by
 * itself) the student gets `add` minutes from now.
 */
export function extraMinutesAfter(
  attempt: Pick<ExamAttempt, 'started_at' | 'extra_minutes'>,
  exam: Pick<Exam, 'duration_minutes'>,
  add: number,
  now = Date.now()
): number {
  const extra = attempt.extra_minutes + add;
  if (!attempt.started_at || !isTimeUp(attempt, exam, now)) return extra;
  const sinceStart = Math.ceil((now - new Date(attempt.started_at).getTime()) / 60_000);
  return Math.max(extra, sinceStart - exam.duration_minutes + add);
}

export function attemptState(attempt: Pick<ExamAttempt, 'started_at' | 'submitted_at'>): AttemptState {
  if (attempt.submitted_at) return 'SUBMITTED';
  return attempt.started_at ? 'IN_PROGRESS' : 'NOT_STARTED';
}

// ── Order ────────────────────────────────────────────────────────────────────

/** Same seed → same order, so a student who reloads the page sees the exam unchanged. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The questions as one student sees them: their own order (when the exam shuffles) and no answers. */
export function questionsForStudent(questions: ExamQuestion[], attemptId: string, shuffle: boolean): StudentQuestion[] {
  const random = seededRandom(attemptId);
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  return (shuffle ? shuffled(ordered, random) : ordered).map((q) => {
    const options = q.kind === 'CHOICE' ? q.options.map((text, i) => ({ i, text })) : [];
    return {
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      options: shuffle ? shuffled(options, random) : options,
      marks: q.marks,
    };
  });
}
