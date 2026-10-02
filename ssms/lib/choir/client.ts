'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Choir data on the client — one shared store for the choir / hymn pages.
// Supabase mode: loaded from loadChoir() and reloaded after each change.
// Demo mode: sample roster and hymns; changes are not saved.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import { loadChoir } from '@/app/dashboard/sacred-arts/actions';
import { MOCK_CHOIR_MEMBERS, MOCK_HYMN_ASSIGNMENTS } from '@/lib/mock/modules';
import type { ActionResult } from '@/lib/admin/types';
import { EMPTY_CHOIR, type ChoirData, type VoicePart } from './types';

export interface ChoirState extends ChoirData {
  mode: 'loading' | 'demo' | 'live' | 'error';
  error: string;
}

const LOADING: ChoirState = { ...EMPTY_CHOIR, mode: 'loading', error: '' };
let state: ChoirState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: ChoirState) {
  state = next;
  listeners.forEach((l) => l());
}

const INSTRUMENT_CODE: Record<string, string> = { Kebero: 'KEBERO', Tsenatsil: 'TSENATSIL', Mekuamia: 'MEKUAMIA', Begena: 'BEGENA', Masinko: 'MASINKO' };

function demoChoir(): ChoirData {
  return {
    members: MOCK_CHOIR_MEMBERS.map((m) => ({
      id: m.id, person_id: m.id, name: m.name_en, name_am: m.name_am, phone: '',
      voice_part: (m.voice.toUpperCase() as VoicePart) in { SOPRANO: 1, ALTO: 1, TENOR: 1, BASS: 1 } ? (m.voice.toUpperCase() as VoicePart) : 'NOT_SET',
      instruments: INSTRUMENT_CODE[m.instrument] ? [INSTRUMENT_CODE[m.instrument]] : [],
      vestment_id: null, vestment: m.vestment, joined_on: m.joined, status: m.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      notes: '', attended: 0, sessions: 0,
    })),
    hymns: MOCK_HYMN_ASSIGNMENTS.map((h) => ({
      id: h.id, title_am: h.title_am, title_en: h.title_en, category: h.type === 'Kidasie' ? 'KIDASE' : 'MEZMUR',
      feast: '', lyrics: '', notes: '', is_active: true, times_sung: 0, last_sung: null,
    })),
    sessions: MOCK_HYMN_ASSIGNMENTS.map((h) => ({
      id: `s-${h.id}`, date: h.date, start_time: '', kind: 'SERVICE', title: h.title_en, location: '', program_id: null, program: '',
      lead_member_id: null, lead: h.lead, status: 'PLANNED', notes: '', hymn_ids: [h.id], attendance: {},
    })),
    candidates: [],
    vestments: [],
    programs: [],
  };
}

export function refreshChoir(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadChoir()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoChoir(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetChoir() {
  loadedAt = 0;
  emit(LOADING);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > 15_000) void refreshChoir();
  return () => {
    listeners.delete(listener);
  };
}

export function useChoir(): ChoirState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** Run a server action, then reload. Demo mode saves nothing and says so. */
export async function runChoir(action: () => Promise<ActionResult>): Promise<ActionResult> {
  if (state.mode !== 'live') return { ok: false, error: 'Demo mode — connect the database to save changes.' };
  const res = await action();
  if (res.ok) await refreshChoir();
  return res;
}
