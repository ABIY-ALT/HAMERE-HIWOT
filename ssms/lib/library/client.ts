'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Library data on the client — one shared store for the library pages.
// Supabase mode: loaded from loadLibrary() and reloaded after each change.
// Demo mode: a small sample catalogue with loans; changes are not saved.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import { loadLibrary } from '@/app/dashboard/library/actions';
import type { ActionResult } from '@/lib/admin/types';
import { DEFAULT_LIBRARY_SETTINGS, EMPTY_LIBRARY, type LibraryBook, type LibraryCopy, type LibraryData, type LibraryLoan } from './types';

export interface LibraryState extends LibraryData {
  mode: 'loading' | 'demo' | 'live' | 'error';
  error: string;
}

const LOADING: LibraryState = { ...EMPTY_LIBRARY, mode: 'loading', error: '' };
let state: LibraryState = LOADING;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: LibraryState) {
  state = next;
  listeners.forEach((l) => l());
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function demoLibrary(): LibraryData {
  const book = (id: string, title: string, author: string, category: string, shelf: string, language: LibraryBook['language'] = 'AM'): LibraryBook => ({
    id, title, subtitle: '', author, category, language, audience: 'ALL', isbn: '', publisher: '', published_year: null, shelf, description: '', is_active: true, created_at: '2026-09-15T08:00:00Z',
  });
  const books = [
    book('b1', 'ትምህርተ ሃይማኖት', 'ማኅበረ ቅዱሳን', 'DOGMA', 'A-1'),
    book('b2', 'መጽሐፍ ቅዱስ', '', 'BIBLE', 'A-2'),
    book('b3', 'ውዳሴ ማርያም', '', 'LITURGY', 'B-1', 'GEEZ'),
    book('b4', 'የቤተ ክርስቲያን ታሪክ', 'ሊቀ ሥልጣናት ሀብተ ማርያም', 'HISTORY', 'C-2'),
    book('b5', 'ገድለ ተክለ ሃይማኖት', '', 'SAINTS', 'C-4'),
    book('b6', 'የሕፃናት መዝሙራት', '', 'CHILDREN', 'D-1'),
  ];
  let n = 0;
  const copies: LibraryCopy[] = books.flatMap((b, i) =>
    Array.from({ length: i % 3 === 0 ? 3 : 2 }, () => ({
      id: `c${++n}`, book_id: b.id, copy_no: `LIB-2026-${String(n).padStart(4, '0')}`, status: 'AVAILABLE' as const,
      condition: 'GOOD' as const, source: (n % 4 === 0 ? 'DONATION' : 'PURCHASE') as LibraryCopy['source'], donor: '', acquired_on: '2026-09-15', notes: '',
    }))
  );
  const people = [
    ['p1', 'Mekdes Alemu', 'መቅደስ ዓለሙ', 'STUDENT'], ['p2', 'Dawit Tesfaye', 'ዳዊት ተስፋዬ', 'STUDENT'], ['p3', 'Hanna Girma', 'ሐና ግርማ', 'TEACHER'],
    ['p4', 'Yonas Bekele', 'ዮናስ በቀለ', 'MEMBER'], ['p5', 'Selam Kebede', 'ሰላም ከበደ', 'STUDENT'],
  ] as const;
  const loans: LibraryLoan[] = [];
  const add = (copy: LibraryCopy, p: (typeof people)[number], kind: LibraryLoan['kind'], issued: number, due: number | null, returned: number | null) => {
    loans.push({
      id: `l${loans.length + 1}`, copy_id: copy.id, copy_no: copy.copy_no, book_id: copy.book_id, person_id: p[0], person: p[1], person_am: p[2], phone: '0911000000',
      borrower_kind: p[3], kind, issued_at: `${day(issued)}T09:00:00Z`, due_date: due == null ? null : day(due), returned_at: returned == null ? null : `${day(returned)}T11:00:00Z`,
      status: returned == null ? 'OUT' : 'RETURNED', renewals: 0, condition_in: returned == null ? null : 'GOOD', issued_by: 'Demo', notes: '',
    });
    if (returned == null) copy.status = kind === 'HOME' ? 'ON_LOAN' : 'IN_LIBRARY';
  };
  add(copies[0], people[0], 'HOME', -20, -6, null);
  add(copies[3], people[1], 'HOME', -5, 9, null);
  add(copies[5], people[2], 'HOME', -3, 11, null);
  add(copies[7], people[4], 'READING', 0, null, null);
  add(copies[1], people[3], 'HOME', -60, -46, -48);
  add(copies[0], people[4], 'HOME', -90, -76, -80);
  add(copies[4], people[0], 'READING', -14, null, -14);
  add(copies[8], people[1], 'READING', -21, null, -21);
  add(copies[2], people[0], 'HOME', -40, -26, -30);
  copies[copies.length - 1].status = 'DAMAGED';
  const requests = [
    { id: 'r1', book_id: 'b1', person_id: 'p4', person: 'Yonas Bekele', person_am: 'ዮናስ በቀለ', phone: '0911000000', status: 'WAITING' as const, via: 'TELEGRAM' as const, note: '', requested_at: `${day(0)}T07:30:00Z`, handled_at: null },
    { id: 'r2', book_id: 'b4', person_id: 'p5', person: 'Selam Kebede', person_am: 'ሰላም ከበደ', phone: '0911000000', status: 'READY' as const, via: 'TELEGRAM' as const, note: '', requested_at: `${day(-2)}T07:30:00Z`, handled_at: `${day(-1)}T09:00:00Z` },
  ];
  return { books, copies, loans: loans.sort((a, b) => b.issued_at.localeCompare(a.issued_at)), requests, settings: DEFAULT_LIBRARY_SETTINGS };
}

export function refreshLibrary(): Promise<void> {
  if (inflight) return inflight;
  inflight = loadLibrary()
    .then((res) => {
      loadedAt = Date.now();
      if (res.mode === 'live') emit({ ...res.data, mode: 'live', error: '' });
      else if (res.mode === 'demo') emit({ ...demoLibrary(), mode: 'demo', error: '' });
      else emit({ ...state, mode: 'error', error: res.error });
    })
    .catch(() => emit({ ...state, mode: 'error', error: 'Could not reach the server. Check your connection.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && Date.now() - loadedAt > 15_000) void refreshLibrary();
  return () => {
    listeners.delete(listener);
  };
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** Run a server action, then reload. Demo mode saves nothing and says so. */
export async function runLibrary<R extends ActionResult | { ok: false; error: string } | { ok: true }>(action: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  if (state.mode !== 'live') return { ok: false, error: 'Demo mode — connect the database to save changes.' };
  const res = await action();
  if (res.ok) await refreshLibrary();
  return res;
}
