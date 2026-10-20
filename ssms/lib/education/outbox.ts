'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Offline outbox — roll calls and grades saved on this phone while there is no
// network, sent by lib/education/client when the connection comes back.
// Kept in localStorage (one list per browser; cleared on sign-out). The same
// roll call (class + date) or grade (student + subject + term) saved twice
// keeps only the newest, and the server accepts a save sent again, so a
// shaky connection never makes duplicates.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useSyncExternalStore } from 'react';
import type { AttendanceStatus } from './types';

export interface AttendancePayload {
  class_id: string;
  class: string;
  teacher: string;
  date: string;
  topic: string;
  topic_am: string;
  records: Record<string, AttendanceStatus>;
}

export interface GradePayload {
  student_id: string;
  subject_id: string;
  term: number;
  scores: Record<string, number>;
}

export type OutboxItem = {
  id: string;
  /** Same key = same roll call / grade: a newer save replaces an older one */
  key: string;
  created_at: string;
  /** Who / what, for the list on screen */
  label: string;
  /** The server refused it (e.g. no permission): kept for the teacher to see, not sent again */
  error?: string;
} & ({ kind: 'attendance'; payload: AttendancePayload } | { kind: 'grade'; payload: GradePayload });

const KEY = 'ssms_outbox_v1';
const EVENT = 'ssms-outbox-changed';

function read(): OutboxItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]): boolean {
  try {
    if (items.length) window.localStorage.setItem(KEY, JSON.stringify(items));
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function outboxItems(): OutboxItem[] {
  return typeof window === 'undefined' ? [] : read();
}

/** Keep a save to send later. Returns false when the phone's storage is unavailable or full. */
export function enqueue(item: Omit<OutboxItem, 'id' | 'created_at'>): boolean {
  const next = {
    ...item,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ob-${Date.now()}-${Math.random()}`,
    created_at: new Date().toISOString(),
  } as OutboxItem;
  return write([...read().filter((i) => i.key !== item.key), next]);
}

export function removeItem(id: string) {
  write(read().filter((i) => i.id !== id));
}

export function markFailed(id: string, error: string) {
  write(read().map((i) => (i.id === id ? { ...i, error } : i)));
}

/** Everything (on sign-out: the next person must not see or send it). */
export function clearOutbox() {
  write([]);
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const snapshot = () => {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/** The outbox as a stable string snapshot → items (re-renders only when it changes). */
export function useOutbox(): OutboxItem[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

const onlineSubscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** navigator.onLine, kept up to date (true while server-rendering). */
export function useOnline(): boolean {
  return useSyncExternalStore(onlineSubscribe, () => navigator.onLine, () => true);
}
