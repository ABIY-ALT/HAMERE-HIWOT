'use client';

// ─────────────────────────────────────────────────────────────────────────────
// HR data on the client — one shared store for the HR, teachers and servants
// pages. Supabase mode: loaded from loadHr() and reloaded after each change.
// Demo mode: sample servants; changes are not saved.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import { loadHr } from '@/app/dashboard/hr/actions';
import { MOCK_PERSONNEL } from '@/lib/mock/modules';
import type { ActionResult } from '@/lib/admin/types';
import type { AttendanceStatus } from '@/lib/attendance/store';
import { todayIso, weekdayOfIso } from '@/lib/utils/ethiopian-calendar';
import { addDays, EMPTY_HR, type HrData, type RoleKind } from './types';

export interface HrState extends HrData {
  mode: 'loading' | 'demo' | 'live' | 'error';
  error: string;
}

const LOADING: HrState = { ...EMPTY_HR, mode: 'loading', error: '' };
let state: HrState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: HrState) {
  state = next;
  listeners.forEach((l) => l());
}

/** The most recent Sunday on or before a day. */
export function lastSunday(iso: string): string {
  return addDays(iso, -(weekdayOfIso(iso) ?? 0));
}

function demoHr(): HrData {
  const unitNames = [...new Set(MOCK_PERSONNEL.map((p) => p.dept))];
  const units = unitNames.map((name, i) => ({ id: `unit-${i}`, code: name.startsWith('Education') ? 'DEPT_EDUCATION' : `UNIT_${i}`, name, name_am: MOCK_PERSONNEL.find((p) => p.dept === name)?.dept_am ?? name, type: 'DEPARTMENT' }));
  const unitId = (name: string) => units.find((u) => u.name === name)?.id ?? 'unit-0';
  const kind = (role: string): RoleKind => (role === 'Teacher' ? 'TEACHER' : role.includes('Head') || role.includes('Chair') ? 'HEAD' : 'SERVANT');
  const sunday = lastSunday(todayIso());
  const marks: AttendanceStatus[] = ['PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'ABSENT', 'PRESENT', 'EXCUSED'];
  return {
    people: MOCK_PERSONNEL.map((p) => ({ id: p.id, name: p.name_en, name_am: p.name_am, phone: p.phone, baptismal_name: '', status: 'ACTIVE' })),
    assignments: MOCK_PERSONNEL.map((p) => ({
      id: `asg-${p.id}`, person_id: p.id, unit_id: unitId(p.dept), unit: p.dept, unit_am: p.dept_am,
      role_kind: kind(p.role), title: kind(p.role) === 'SERVANT' ? p.role : '', class_id: null, class_name: kind(p.role) === 'TEACHER' ? p.classes[0] ?? '' : '',
      start_date: p.joined, end_date: null, end_reason: null, status: 'ACTIVE', notes: '',
    })),
    attendance: Array.from({ length: 8 }, (_, w) => addDays(sunday, -7 * w)).flatMap((date, w) =>
      MOCK_PERSONNEL.map((p, i) => ({ date, person_id: p.id, status: marks[(w + i * 3) % marks.length], check_in: '', note: '' }))
    ),
    cases: [
      { id: 'dis-001', person_id: 'per-002', opened_on: '2026-08-15', kind: 'WARNING', reason: 'Repeated lateness to Sunday service', handled_by: 'HR Department', suspended_until: null, status: 'RESOLVED', resolution: 'Counselled; punctual since.', closed_on: '2026-08-30' },
      { id: 'dis-002', person_id: 'per-001', opened_on: '2026-09-20', kind: 'COUNSELING', reason: 'Conflict within the class team', handled_by: 'Father of confession', suspended_until: null, status: 'OPEN', resolution: '', closed_on: null },
    ],
    canSeeCases: true,
    homeroom: [],
    candidates: [],
    units,
    classes: [],
  };
}

export function refreshHr(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadHr()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoHr(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetHr() {
  loadedAt = 0;
  emit(LOADING);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > 15_000) void refreshHr();
  return () => {
    listeners.delete(listener);
  };
}

export function useHr(): HrState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** Run a server action, then reload. Demo mode saves nothing and says so. */
export async function runHr(action: () => Promise<ActionResult>): Promise<ActionResult> {
  if (state.mode !== 'live') return { ok: false, error: 'Demo mode — connect the database to save changes.' };
  const res = await action();
  if (res.ok) await refreshHr();
  return res;
}
