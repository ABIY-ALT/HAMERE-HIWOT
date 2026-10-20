'use client';

// ─────────────────────────────────────────────────────────────────────────────
// An exam in progress, kept on the student's phone (localStorage), so a lost
// network does not lose anything: the answers and when they last changed
// (server time), and — only after the exam has started — the questions and
// the deadline, so the page can go on even when it is reloaded offline.
// Removed as soon as the exam is handed in. The server decides what counts
// (app/exam/actions acceptOffline): answers written in time, arriving at most
// 10 minutes after the end.
// ─────────────────────────────────────────────────────────────────────────────

import type { OfflineAnswers, StudentQuestion } from './types';
import type { TicketInfo } from '@/app/exam/actions';

export interface LocalExam {
  answers: Record<string, string>;
  /** Server time of the last change */
  written_at: string;
  /** The server has exactly these answers */
  synced: boolean;
  /** Handed in (or the time ran out) with no network: hand in when it is back */
  hand_in: boolean;
  questions?: StudentQuestion[];
  /** Server-time milliseconds */
  deadline?: number;
  /** Server clock − phone clock, ms */
  offset?: number;
  info?: TicketInfo;
}

const key = (ticket: string) => `ssms-exam-local:${ticket}`;

export function loadLocal(ticket: string): LocalExam | null {
  try {
    const raw = window.localStorage.getItem(key(ticket));
    return raw ? (JSON.parse(raw) as LocalExam) : null;
  } catch {
    return null;
  }
}

export function saveLocal(ticket: string, patch: Partial<LocalExam>) {
  try {
    const now = loadLocal(ticket) ?? { answers: {}, written_at: new Date().toISOString(), synced: true, hand_in: false };
    window.localStorage.setItem(key(ticket), JSON.stringify({ ...now, ...patch }));
  } catch {
    // Storage full or blocked: the exam still works while online
  }
}

export function dropLocal(ticket: string) {
  try {
    window.localStorage.removeItem(key(ticket));
  } catch {}
}

/** Answers the server does not have yet, to send with the next request. */
export function pendingAnswers(ticket: string): OfflineAnswers | null {
  const rec = loadLocal(ticket);
  return rec && !rec.synced ? { answers: rec.answers, written_at: rec.written_at } : null;
}

/** The server now has these answers (only if nothing changed since they were sent). */
export function markSynced(ticket: string, sent: Record<string, string>) {
  const rec = loadLocal(ticket);
  if (rec && JSON.stringify(rec.answers) === JSON.stringify(sent)) saveLocal(ticket, { synced: true });
}
