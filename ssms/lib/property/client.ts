'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Property data on the client — one shared store for the Property pages.
// Supabase mode: loaded from loadProperty() and reloaded after each change.
// Demo mode: sample assets; changes are not saved.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import { loadProperty } from '@/app/dashboard/property/actions';
import { MOCK_ASSET_TRANSFERS, MOCK_ASSETS, MOCK_MAINTENANCE } from '@/lib/mock/modules';
import type { ActionResult } from '@/lib/admin/types';
import { EMPTY_PROPERTY, type AssetCondition, type AssetStatus, type PropertyData } from './types';

export interface PropertyState extends PropertyData {
  mode: 'loading' | 'demo' | 'live' | 'error';
  error: string;
}

const LOADING: PropertyState = { ...EMPTY_PROPERTY, mode: 'loading', error: '' };
let state: PropertyState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: PropertyState) {
  state = next;
  listeners.forEach((l) => l());
}

function demoProperty(): PropertyData {
  const tagToId = new Map(MOCK_ASSETS.map((a) => [a.tag, a.id]));
  return {
    assets: MOCK_ASSETS.map((a) => ({
      id: a.id, tag: a.tag, name_en: a.name_en, name_am: a.name_am, category: 'IT equipment', serial_no: a.serial,
      condition: a.condition as AssetCondition, status: (a.status === 'IN_USE' ? 'IN_USE' : 'IN_STORE') as AssetStatus,
      unit_id: null, unit: a.dept, unit_am: a.dept, custodian_id: null, custodian: a.custodian, location: '',
      acquired_on: a.purchase_date, acquisition_type: 'PURCHASE', value: a.value, notes: '', last_verified_on: null,
    })),
    movements: MOCK_ASSET_TRANSFERS.map((m) => ({
      id: m.id, asset_id: tagToId.get(m.asset_tag) ?? '', from_unit: m.from_dept, to_unit: m.to_dept, from_person: m.from_custodian,
      to_person: m.to_custodian, moved_on: m.date, reason: m.reason, recorded_by: m.requested_by,
    })),
    maintenance: MOCK_MAINTENANCE.map((m) => ({
      id: m.id, asset_id: tagToId.get(m.asset_tag) ?? '', kind: m.type === 'Repair' ? 'REPAIR' : 'SERVICE', description: m.description,
      reported_on: m.date, completed_on: m.status === 'COMPLETED' ? m.date : null, cost: m.cost, handled_by: m.assigned_to,
      status: m.status === 'COMPLETED' ? 'DONE' : 'OPEN', expense_booked: false,
    })),
    units: [],
    people: [],
  };
}

export function refreshProperty(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadProperty()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoProperty(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetProperty() {
  loadedAt = 0;
  emit(LOADING);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > 15_000) void refreshProperty();
  return () => {
    listeners.delete(listener);
  };
}

export function useProperty(): PropertyState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/**
 * Run a server action, then reload. In demo mode nothing is saved, so the
 * page shows a message instead of pretending.
 */
export async function runProperty(action: () => Promise<ActionResult>): Promise<ActionResult> {
  if (state.mode !== 'live') return { ok: false, error: 'Demo mode — connect the database to save changes.' };
  const res = await action();
  if (res.ok) await refreshProperty();
  return res;
}
