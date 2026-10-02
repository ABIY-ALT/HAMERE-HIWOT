// ─────────────────────────────────────────────────────────────────────────────
// Attendance store (mock persistence)
//
// Mirrors the database shape from migration 005: one session per class per
// date, and one status per student per session. Until Supabase is connected
// it persists to the browser's localStorage. When the database is ready, only
// the four functions below need to change — the pages call nothing else.
// ─────────────────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export interface AttendanceSession {
  id: string;
  class_id: string;
  class: string;
  date: string; // Gregorian ISO "YYYY-MM-DD"
  topic: string;
  topic_am: string;
  teacher: string;
  /** studentId → status. Empty for legacy sessions that only kept totals. */
  records: Record<string, AttendanceStatus>;
  /** Totals, stored only for legacy sessions that have no per-student records. */
  totals?: { present: number; absent: number; late: number; excused: number };
}

export interface AttendanceTotals {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

const STORAGE_KEY = 'ssms_attendance_sessions_v1';
const CHANGE_EVENT = 'ssms-attendance-changed';

/** Raw stored JSON (a stable string, so it works as a useSyncExternalStore snapshot). */
export function readRawSessions(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function parseSessions(raw: string): AttendanceSession[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AttendanceSession[]) : [];
  } catch {
    return [];
  }
}

/** Subscribe to changes made in this tab or in another tab. */
export function subscribeSessions(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function readStorage(): AttendanceSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AttendanceSession[]) : [];
  } catch {
    return [];
  }
}

/** Sessions saved by teachers in this browser. Safe to call during SSR (returns []). */
export function loadSavedSessions(): AttendanceSession[] {
  if (typeof window === 'undefined') return [];
  return readStorage();
}

/** Insert or replace the session for the same class and date. Returns false if storage failed. */
export function saveSession(session: AttendanceSession): boolean {
  try {
    const others = readStorage().filter(
      (s) => !(s.class_id === session.class_id && s.date === session.date)
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([session, ...others]));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function findSavedSession(classId: string, date: string): AttendanceSession | undefined {
  return loadSavedSessions().find((s) => s.class_id === classId && s.date === date);
}

export function totalsOf(session: Pick<AttendanceSession, 'records' | 'totals'>): AttendanceTotals {
  const ids = Object.keys(session.records);
  if (ids.length === 0 && session.totals) return session.totals;
  const totals: AttendanceTotals = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const id of ids) {
    const key = session.records[id].toLowerCase() as keyof AttendanceTotals;
    totals[key] += 1;
  }
  return totals;
}

/** Share of students counted as attending. Late counts as attending; excused is left out. */
export function attendanceRate({ present, absent, late }: AttendanceTotals): number {
  const considered = present + absent + late;
  return considered === 0 ? 0 : Math.round(((present + late) / considered) * 100);
}
