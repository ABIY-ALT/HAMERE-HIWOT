'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Tasks data on the client — one shared store for the Tasks page.
// Supabase mode: loaded from loadTasks() and reloaded after each change.
// Demo mode: sample tasks; changes are not saved.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import { loadTasks } from '@/app/dashboard/tasks/actions';
import { MOCK_ORG_UNITS } from '@/lib/mock/data';
import type { ActionResult } from '@/lib/admin/types';
import { addDays } from '@/lib/hr/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import { EMPTY_TASKS, type Task, type TaskSeries, type TasksData } from './types';
import { uploadFiles } from './upload';

export interface TasksState extends TasksData {
  mode: 'loading' | 'demo' | 'live' | 'error';
  error: string;
}

const LOADING: TasksState = { ...EMPTY_TASKS, mode: 'loading', error: '' };
let state: TasksState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: TasksState) {
  state = next;
  listeners.forEach((l) => l());
}

function demoTasks(): TasksData {
  const units = MOCK_ORG_UNITS.filter((u) => u.is_active).map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am, type: u.unit_type }));
  const unit = (code: string) => MOCK_ORG_UNITS.find((u) => u.code === code) ?? MOCK_ORG_UNITS[0];
  const exec = unit('EXECUTIVE_COMMITTEE');
  const today = todayIso();
  const meetingDate = addDays(today, -12);
  const at = (days: number) => `${addDays(today, days)}T09:00:00Z`;
  const base = (no: number, code: string, partial: Partial<Task>): Task => {
    const u = unit(code);
    return {
      id: `task-${no}`, task_no: `TSK-2026-${String(no).padStart(4, '0')}`, title: '', details: '',
      from_unit_id: exec.id, from_unit: exec.name_en, from_unit_am: exec.name_am,
      unit_id: u.id, unit: u.name_en, unit_am: u.name_am,
      source: 'MEETING', meeting_title: 'Executive Committee regular meeting', meeting_date: meetingDate, decision_ref: '',
      priority: 'NORMAL', due_date: null, status: 'ASSIGNED', progress: 0,
      created_by_id: 'sysuser-002', created_by: 'Executive Secretary', completed_at: null, created_at: at(-12), updates: [],
      files: [], series_id: null, repeats: null,
      assignee_id: null, assignee: '', internal: false, parent_task_id: null, parent_task_no: '', plan_activity_id: null, plan_activity: '', parts: { total: 0, done: 0 },
      ...partial,
    };
  };
  const tasks: Task[] = [
    base(1, 'DEPT_EDUCATION', {
      title: 'Prepare the first-term exam timetable and submit it', decision_ref: 'Decision 1', due_date: addDays(today, 5),
      status: 'IN_PROGRESS', progress: 60,
      updates: [{ id: 'u1', kind: 'PROGRESS', note: 'Draft timetable shared with class teachers; waiting for two classes.', progress: 60, author: 'Education Department Head', at: at(-3) }],
    }),
    base(2, 'DEPT_SACRED_ARTS', {
      title: 'Prepare the choir for the Meskel celebration', decision_ref: 'Decision 2', priority: 'HIGH', due_date: addDays(today, -2),
      status: 'ASSIGNED',
    }),
    base(3, 'DEPT_PROGRAMS', {
      title: 'Organize the parents’ day programme', decision_ref: 'Decision 3', due_date: addDays(today, -1),
      status: 'SUBMITTED', progress: 100,
      updates: [{ id: 'u3', kind: 'SUBMITTED', note: 'Programme held; 140 parents attended. Photos and the attendance list are attached.', progress: 100, author: 'Programs Department Head', at: at(-1) }],
      files: [
        { id: 'f1', update_id: 'u3', name: 'parents-day-hall.jpg', mime: 'image/jpeg', size: 412_000, uploaded_by: 'Programs Department Head', uploaded_by_id: 'demo', at: at(-1) },
        { id: 'f2', update_id: 'u3', name: 'attendance-list.pdf', mime: 'application/pdf', size: 96_000, uploaded_by: 'Programs Department Head', uploaded_by_id: 'demo', at: at(-1) },
      ],
    }),
    base(4, 'DEPT_HR', {
      title: 'Submit the monthly servant attendance summary', source: 'ROUTINE', meeting_title: '', meeting_date: null,
      due_date: addDays(today, -20), status: 'COMPLETED', progress: 100, completed_at: at(-21), created_at: at(-30),
      series_id: 'ser-1', repeats: 'MONTHLY',
      updates: [
        { id: 'u4a', kind: 'SUBMITTED', note: 'Summary submitted.', progress: 100, author: 'HR Department Head', at: at(-22) },
        { id: 'u4b', kind: 'COMPLETED', note: '', progress: null, author: 'Executive Secretary', at: at(-21) },
      ],
    }),
  ];
  const hr = unit('DEPT_HR');
  const series: TaskSeries[] = [
    { id: 'ser-1', title: 'Submit the monthly servant attendance summary', unit_id: hr.id, unit: hr.name_en, unit_am: hr.name_am, frequency: 'MONTHLY', next_due: addDays(today, 10), is_active: true, created_by: 'Executive Secretary' },
  ];
  return { tasks, units, series, people: {} };
}

export function refreshTasks(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadTasks()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoTasks(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetTasks() {
  loadedAt = 0;
  emit(LOADING);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > 15_000) void refreshTasks();
  return () => {
    listeners.delete(listener);
  };
}

export function useTasks(): TasksState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

const DEMO: ActionResult = { ok: false, error: 'Demo mode — connect the database to save changes.' };

/** Run a server action, then reload. Demo mode saves nothing and says so. */
export async function runTasks<R extends { ok: boolean }>(action: () => Promise<R>): Promise<R | ActionResult> {
  if (state.mode !== 'live') return DEMO;
  const res = await action();
  if (res.ok) await refreshTasks();
  return res;
}

/** Upload files to a task (or to one of its reports), then reload; reports the ones that failed. */
export async function attachFiles(taskId: string, updateId: string | null, files: File[]): Promise<ActionResult> {
  if (files.length === 0) return { ok: true };
  if (state.mode !== 'live') return DEMO;
  const failed = await uploadFiles(taskId, updateId, files);
  await refreshTasks();
  return failed.length ? { ok: false, error: failed.join(' · ') } : { ok: true };
}
