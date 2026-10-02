'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Education data on the client
//
// One shared store for all Education pages. In Supabase mode it is loaded from
// the server (loadEducationData) and reloaded after every change. In demo mode
// it is built from mock data plus students / roll calls kept in this browser.
// Pages read it with useEducation() and change it only through the functions
// exported here, which work the same way in both modes.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import {
  createAcademicYear as createYearAction,
  createClass as createClassAction,
  createSubject as createSubjectAction,
  enrollStudents as enrollAction,
  loadEducationData,
  reviewGrade as reviewGradeAction,
  saveAttendance as saveAttendanceAction,
  saveGrade as saveGradeAction,
  setCurrentAcademicYear as setCurrentYearAction,
} from '@/app/dashboard/education/actions';
import { addStudents, nextRegNos, subscribeStudents } from '@/lib/students/store';
import { saveSession, subscribeSessions } from '@/lib/attendance/store';
import type { ActionResult } from '@/lib/admin/types';
import { demoEducation } from './demo';
import {
  EMPTY_EDUCATION,
  letterGrade,
  type AttendanceStatus,
  type EducationData,
  type GradeRow,
  type Student,
} from './types';

export type EducationMode = 'loading' | 'demo' | 'live' | 'error';

export interface EducationState extends EducationData {
  mode: EducationMode;
  error: string;
}

const LOADING: EducationState = { ...EMPTY_EDUCATION, mode: 'loading', error: '' };
const STALE_AFTER_MS = 15_000;

let state: EducationState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: EducationState) {
  state = next;
  listeners.forEach((l) => l());
}

/** (Re)load from the server, or rebuild the demo data. */
export function refreshEducation(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadEducationData()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoEducation(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => {
      emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget cached data (e.g. on sign-out) so the next user starts fresh. */
export function resetEducation() {
  loadedAt = 0;
  emit(LOADING);
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

export async function saveAttendance(input: {
  class_id: string;
  class: string;
  teacher: string;
  date: string;
  topic: string;
  topic_am: string;
  records: Record<string, AttendanceStatus>;
}): Promise<ActionResult> {
  if (state.mode === 'live') {
    return afterLive(
      await saveAttendanceAction({
        class_id: input.class_id,
        date: input.date,
        topic: input.topic,
        topic_am: input.topic_am,
        records: input.records,
      })
    );
  }
  const existing = state.sessions.find((s) => s.class_id === input.class_id && s.date === input.date);
  const ok = saveSession({
    id: existing?.id ?? `att-${Date.now()}`,
    class_id: input.class_id,
    class: input.class,
    date: input.date,
    topic: input.topic,
    topic_am: input.topic_am || input.topic,
    teacher: input.teacher,
    records: input.records,
  });
  return ok ? { ok: true } : { ok: false, error: STORAGE_ERROR };
}

export async function saveGrade(input: {
  student_id: string;
  subject_id: string;
  term: number;
  continuous: number;
  final: number;
}): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await saveGradeAction(input));

  const student = state.students.find((s) => s.id === input.student_id);
  const subject = state.subjects.find((s) => s.id === input.subject_id);
  const total = input.continuous + input.final;
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
    continuous: input.continuous,
    final: input.final,
    total,
    grade: letterGrade(total),
    status: 'PENDING',
    approved_by: '',
  };
  const others = state.grades.filter(
    (g) => !(g.student_id === input.student_id && g.subject_id === input.subject_id && g.term === input.term)
  );
  patchDemo({ grades: [row, ...others] });
  return { ok: true };
}

export async function reviewGrade(gradeId: string, decision: 'APPROVED' | 'REJECTED'): Promise<ActionResult> {
  if (state.mode === 'live') return afterLive(await reviewGradeAction(gradeId, decision));
  patchDemo({
    grades: state.grades.map((g) => (g.id === gradeId ? { ...g, status: decision, approved_by: 'Demo' } : g)),
  });
  return { ok: true };
}
