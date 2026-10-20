'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Education data on the client
//
// One shared store for all Education pages. In Supabase mode it is loaded from
// the server (loadEducationData) and reloaded after every change. In demo mode
// it is built from mock data plus students / roll calls kept in this browser.
// Pages read it with useEducation() and change it only through the functions
// exported here, which work the same way in both modes.
//
// Offline (Supabase mode): the last data loaded is kept on this phone, so the
// pages still open without a network (`offline: true`). Roll calls and grades
// saved then go to the outbox (lib/education/outbox), show on screen at once,
// and are sent by themselves when the connection is back — on reconnecting,
// on opening the app, and every 30 seconds while something is waiting.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import {
  createAcademicYear as createYearAction,
  createClass as createClassAction,
  createSubject as createSubjectAction,
  enrollStudents as enrollAction,
  loadEducationData,
  reviewGrade as reviewGradeAction,
  saveAssessmentScheme as saveSchemeAction,
  saveAttendance as saveAttendanceAction,
  saveGrade as saveGradeAction,
  setCurrentAcademicYear as setCurrentYearAction,
  updateStudent as updateStudentAction,
} from '@/app/dashboard/education/actions';
import { addStudents, nextRegNos, replaceSavedStudent, subscribeStudents } from '@/lib/students/store';
import { saveSession, subscribeSessions } from '@/lib/attendance/store';
import type { ActionResult } from '@/lib/admin/types';
import { clearOutbox, enqueue, markFailed, outboxItems, removeItem, type AttendancePayload, type GradePayload } from './outbox';
import { demoEducation } from './demo';
import {
  activeScheme,
  EMPTY_EDUCATION,
  letterGrade,
  scoresTotal,
  type AssessmentPart,
  type EducationData,
  type GradeRow,
  type Student,
} from './types';

export type EducationMode = 'loading' | 'demo' | 'live' | 'error';

export interface EducationState extends EducationData {
  mode: EducationMode;
  error: string;
  /** No network: this is the copy kept on this phone from the last time it was online */
  offline?: boolean;
}

const LOADING: EducationState = { ...EMPTY_EDUCATION, mode: 'loading', error: '' };
const STALE_AFTER_MS = 15_000;
const SNAPSHOT_KEY = 'ssms_education_snapshot_v1';
/** Cached pages (public/sw.js), dropped on sign-out with the data */
const PAGE_CACHE = 'hamere-hiwot-pages-v1';

let state: EducationState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: EducationState) {
  state = next;
  listeners.forEach((l) => l());
}

function keepSnapshot(data: EducationData) {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ saved_at: new Date().toISOString(), data }));
  } catch {
    // Storage full or blocked: offline use just will not work
  }
}

function snapshot(): EducationData | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as { data: EducationData }).data : null;
  } catch {
    return null;
  }
}

/** Roll calls and grades still waiting in the outbox, shown on top of the server's data. */
function withOutbox(data: EducationData): EducationData {
  let next = data;
  for (const item of outboxItems()) {
    if (item.error) continue;
    next = item.kind === 'attendance' ? { ...next, sessions: withSession(next, item.payload) } : withGrade(next, item.payload) ?? next;
  }
  return next;
}

/** (Re)load from the server, or rebuild the demo data. Offline, use this phone's copy. */
export function refreshEducation(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadEducationData()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') {
        keepSnapshot(res.data);
        emit({ ...withOutbox(res.data), mode: 'live', error: '', offline: false });
        void flushOutbox();
      } else if (res.mode === 'demo') emit({ ...demoEducation(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => {
      // No network (the server could not be reached at all)
      const kept = snapshot();
      if (kept) emit({ ...withOutbox(kept), mode: 'live', error: '', offline: true });
      else emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget cached data (e.g. on sign-out) so the next user starts fresh — also this phone's copy, unsent saves and cached pages. */
export function resetEducation() {
  loadedAt = 0;
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {}
  clearOutbox();
  if (typeof caches !== 'undefined') void caches.delete(PAGE_CACHE).catch(() => {});
  emit(LOADING);
}

// ── Sending the outbox ───────────────────────────────────────────────────────

let flushing: Promise<number> | null = null;

/**
 * Send what waits in the outbox, oldest first. Stops at the first network
 * failure (still offline) or an expired sign-in (kept until they sign in);
 * other refusals stay in the list marked with the reason. Returns how many were sent.
 */
export function flushOutbox(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const item of outboxItems()) {
      if (item.error) continue;
      let res: ActionResult;
      try {
        res =
          item.kind === 'attendance'
            ? await saveAttendanceAction({
                class_id: item.payload.class_id,
                date: item.payload.date,
                topic: item.payload.topic,
                topic_am: item.payload.topic_am,
                records: item.payload.records,
              })
            : await saveGradeAction(item.payload);
      } catch {
        break; // still no network
      }
      if (res.ok) {
        removeItem(item.id);
        sent += 1;
      } else if (/session has expired|sign in again/i.test(res.error)) {
        break;
      } else {
        markFailed(item.id, res.error);
      }
    }
    if (sent) await refreshEducation();
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// Send by themselves: on reconnecting, on coming back to the app, and every 30 s while something waits
if (typeof window !== 'undefined') {
  const trySend = () => {
    if (navigator.onLine && outboxItems().some((i) => !i.error)) void flushOutbox();
  };
  window.addEventListener('online', trySend);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') trySend();
  });
  setInterval(trySend, 30_000);
  setTimeout(trySend, 2_000);
}

function onBrowserStorageChange() {
  if (state.mode !== 'demo') return;
  // Only students and roll calls live in browser storage; keep other demo edits.
  const fresh = demoEducation();
  emit({ ...state, students: fresh.students, sessions: fresh.sessions });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > STALE_AFTER_MS) void refreshEducation();
  const offStudents = subscribeStudents(onBrowserStorageChange);
  const offSessions = subscribeSessions(onBrowserStorageChange);
  return () => {
    listeners.delete(listener);
    offStudents();
    offSessions();
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => LOADING;

export function useEducation(): EducationState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The same data outside React. */
export const educationNow = (): EducationState => state;

/** Demo-mode edits that are not kept in browser storage (lost on reload). */
function patchDemo(patch: Partial<EducationData>) {
  emit({ ...state, ...patch });
}

async function afterLive(res: ActionResult): Promise<ActionResult> {
  if (res.ok) await refreshEducation();
  return res;
}

const STORAGE_ERROR = 'Could not save. Browser storage is unavailable or full.';

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createAcademicYear(input: {
  name: string;
  name_am: string;
  start_date: string;
  end_date: string;
}): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await createYearAction(input));
  patchDemo({
    years: [
      {
        ...input,
        id: `ay-${Date.now()}`,
        name_am: input.name_am || input.name,
        is_current: false,
        status: 'PLANNED',
        students_enrolled: 0,
        scheme: activeScheme(state),
      },
      ...state.years,
    ],
  });
  return { ok: true };
}

export async function setCurrentAcademicYear(yearId: string): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await setCurrentYearAction(yearId));
  patchDemo({
    activeYearId: yearId,
    years: state.years.map((y) =>
      y.id === yearId
        ? { ...y, is_current: true, status: 'ACTIVE' }
        : y.is_current
          ? { ...y, is_current: false, status: 'COMPLETED' }
          : y
    ),
  });
  return { ok: true };
}

export async function createClass(input: {
  name_en: string;
  name_am: string;
  grade_level: number;
  capacity: number;
  room: string;
  teacher_person_id: string;
  teacher_name: string;
}): Promise<ActionResult> {
  if (state.mode === 'live') {
    return afterLive(
      await createClassAction({
        name_en: input.name_en,
        name_am: input.name_am,
        grade_level: input.grade_level,
        capacity: input.capacity,
        room: input.room,
        teacher_person_id: input.teacher_person_id,
      })
    );
  }
  patchDemo({
    classes: [
      ...state.classes,
      {
        id: `cls-${Date.now()}`,
        name_en: input.name_en,
        name_am: input.name_am || input.name_en,
        grade_level: input.grade_level,
        academic_year_id: state.activeYearId ?? '',
        teacher: input.teacher_name || '—',
        teacher_person_id: null,
        capacity: input.capacity,
        enrolled: 0,
        room: input.room,
      },
    ],
  });
  return { ok: true };
}

export async function createSubject(input: {
  code: string;
  name_en: string;
  name_am: string;
  min_grade: number;
  credits: number;
  instructor: string;
  syllabus: string;
}): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await createSubjectAction(input));
  patchDemo({
    subjects: [
      {
        ...input,
        id: `sub-${Date.now()}`,
        code: input.code.toUpperCase(),
        name_am: input.name_am || input.name_en,
        is_active: true,
      },
      ...state.subjects,
    ],
  });
  return { ok: true };
}

/** A student to register; class name / level are looked up from class_id. */
export type NewStudent = Omit<Student, 'id' | 'reg_no'>;

export type EnrollOutcome = { ok: true; regNos: string[] } | { ok: false; error: string };

export async function enrollStudents(drafts: NewStudent[]): Promise<EnrollOutcome> {
  if (state.mode === 'live') {
    const res = await enrollAction(
      drafts.map((d) => ({
        name_en: d.name_en,
        name_am: d.name_am,
        baptismal: d.baptismal,
        gender: d.gender,
        class_id: d.class_id,
        parent: d.parent,
        phone: d.phone,
        enrollment_date: d.enrollment_date,
      }))
    );
    if (res.ok) await refreshEducation();
    return res;
  }
  const regNos = nextRegNos(state.students, drafts.length, new Date().getFullYear());
  const stamp = Date.now();
  const ok = addStudents(drafts.map((d, i) => ({ ...d, id: `stu-${stamp}-${i}`, reg_no: regNos[i] })));
  return ok ? { ok: true, regNos } : { ok: false, error: STORAGE_ERROR };
}

export type StudentPatch = Pick<
  Student,
  'name_en' | 'name_am' | 'baptismal' | 'gender' | 'class_id' | 'parent' | 'phone' | 'status'
>;

export async function updateStudent(studentId: string, patch: StudentPatch): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await updateStudentAction(studentId, patch));

  const current = state.students.find((s) => s.id === studentId);
  if (!current) return { ok: false, error: 'Student not found' };
  const cls = state.classes.find((c) => c.id === patch.class_id);
  const next: Student = {
    ...current,
    ...patch,
    class: cls?.name_en ?? current.class,
    grade_level: cls?.grade_level ?? current.grade_level,
  };
  // Students added in this browser are stored; built-in demo students change until reload.
  if (!replaceSavedStudent(next)) {
    patchDemo({ students: state.students.map((s) => (s.id === studentId ? next : s)) });
  }
  return { ok: true };
}

/** A save: done, or (offline) kept on this phone to send later — `queued`. */
export type SaveOutcome = { ok: true; queued?: boolean } | { ok: false; error: string };

/** The data's roll calls with this one put in (replacing the same class and date). */
function withSession(data: EducationData, input: AttendancePayload) {
  const existing = data.sessions.find((s) => s.class_id === input.class_id && s.date === input.date);
  const others = data.sessions.filter((s) => !(s.class_id === input.class_id && s.date === input.date));
  return [
    {
      id: existing?.id ?? `att-${Date.now()}`,
      class_id: input.class_id,
      class: input.class,
      date: input.date,
      topic: input.topic,
      topic_am: input.topic_am || input.topic,
      teacher: input.teacher,
      records: input.records,
    },
    ...others,
  ];
}

/** The data with this grade put in (replacing the same student, subject and term), or the reason it is not valid. */
function withGrade(data: EducationData, input: GradePayload): EducationData | null;
function withGrade(data: EducationData, input: GradePayload, explain: true): EducationData | string;
function withGrade(data: EducationData, input: GradePayload, explain = false): EducationData | string | null {
  const scheme = activeScheme(data);
  const wrong = scheme.find((p) => !(input.scores[p.key] >= 0 && input.scores[p.key] <= p.weight));
  if (wrong) return explain ? `${wrong.name_en} is out of ${wrong.weight}` : null;
  const scores = scheme.map((p) => ({ key: p.key, max: p.weight, score: input.scores[p.key] }));
  const student = data.students.find((s) => s.id === input.student_id);
  const subject = data.subjects.find((s) => s.id === input.subject_id);
  const total = scoresTotal(scores);
  const row: GradeRow = {
    id: `grd-${Date.now()}`,
    student_id: input.student_id,
    student: student?.name_en ?? '—',
    student_am: student?.name_am ?? '—',
    reg_no: student?.reg_no ?? '',
    class: student?.class ?? '—',
    subject_id: input.subject_id,
    subject: subject?.name_en ?? '—',
    subject_am: subject?.name_am ?? '—',
    term: input.term,
    scores,
    total,
    grade: letterGrade(total),
    status: 'PENDING',
    approved_by: '',
  };
  const others = data.grades.filter((g) => !(g.student_id === input.student_id && g.subject_id === input.subject_id && g.term === input.term));
  return { ...data, grades: [row, ...others] };
}

/**
 * Live mode: send now; with no network keep it in the outbox (shown on screen
 * at once) and send it later. A refusal from the server is returned as usual.
 */
async function sendOrKeep(
  send: () => Promise<ActionResult>,
  keep: () => boolean,
  show: () => void
): Promise<SaveOutcome> {
  if (navigator.onLine) {
    try {
      return await afterLive(await send());
    } catch {
      // The request did not get through: keep it below
    }
  }
  if (!keep()) return { ok: false, error: STORAGE_ERROR };
  show();
  return { ok: true, queued: true };
}

export async function saveAttendance(input: AttendancePayload): Promise<SaveOutcome> {
  if (state.mode === 'live') {
    return sendOrKeep(
      () =>
        saveAttendanceAction({
          class_id: input.class_id,
          date: input.date,
          topic: input.topic,
          topic_am: input.topic_am,
          records: input.records,
        }),
      () => enqueue({ kind: 'attendance', key: `att|${input.class_id}|${input.date}`, label: `${input.class} · ${input.date}`, payload: input }),
      () => emit({ ...state, sessions: withSession(state, input) })
    );
  }
  const existing = state.sessions.find((s) => s.class_id === input.class_id && s.date === input.date);
  const ok = saveSession({ ...withSession(state, input)[0], id: existing?.id ?? `att-${Date.now()}` });
  return ok ? { ok: true } : { ok: false, error: STORAGE_ERROR };
}

export async function saveGrade(input: GradePayload): Promise<SaveOutcome> {
  if (state.mode === 'live') {
    // Check the scores here too, so a wrong one is not kept to fail later
    const checked = withGrade(state, input, true);
    if (typeof checked === 'string') return { ok: false, error: checked };
    const student = state.students.find((s) => s.id === input.student_id);
    const subject = state.subjects.find((s) => s.id === input.subject_id);
    return sendOrKeep(
      () => saveGradeAction(input),
      () =>
        enqueue({
          kind: 'grade',
          key: `grade|${input.student_id}|${input.subject_id}|${input.term}`,
          label: `${student?.name_en ?? ''} · ${subject?.name_en ?? ''} · term ${input.term}`,
          payload: input,
        }),
      () => emit({ ...state, ...checked })
    );
  }
  const next = withGrade(state, input, true);
  if (typeof next === 'string') return { ok: false, error: next };
  patchDemo({ grades: next.grades });
  return { ok: true };
}

/** Set the weights of the active academic year. */
export async function saveAssessmentScheme(scheme: AssessmentPart[]): Promise<ActionResult> {
  const yearId = state.activeYearId;
  if (!yearId) return { ok: false, error: 'Set a current academic year first (Education → Academic Years)' };
  if (state.mode === 'live') return afterLive(await saveSchemeAction(yearId, scheme));
  patchDemo({ years: state.years.map((y) => (y.id === yearId ? { ...y, scheme } : y)) });
  return { ok: true };
}

export async function reviewGrade(gradeId: string, decision: 'APPROVED' | 'REJECTED'): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await reviewGradeAction(gradeId, decision));
  patchDemo({
    grades: state.grades.map((g) => (g.id === gradeId ? { ...g, status: decision, approved_by: 'Demo' } : g)),
  });
  return { ok: true };
}
