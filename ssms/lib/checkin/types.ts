// ─────────────────────────────────────────────────────────────────────────────
// Check-in at programs and choir rehearsals (migration 036) — shared types and
// labels, safe for the browser. The rules that need the secret code live in
// lib/checkin/core.ts (server only).
// ─────────────────────────────────────────────────────────────────────────────

export type EventKind = 'PROGRAM' | 'CHOIR' | 'OTHER';
export type CheckinStatus = 'PRESENT' | 'FLAGGED' | 'REMOVED';
export type CheckinFlag = 'NO_LOCATION' | 'FAR';

/** The code changes every this many seconds */
export const CODE_SECONDS = 30;
/** Check-in opens this long before the start (and closes at the end) */
export const OPENS_BEFORE_MIN = 30;

export interface CheckinEvent {
  id: string;
  kind: EventKind;
  title: string;
  program_id: string | null;
  choir_session_id: string | null;
  starts_at: string;
  ends_at: string;
  /** The leader set the place: location is checked */
  has_place: boolean;
  radius_m: number;
  status: 'OPEN' | 'CLOSED';
  present: number;
  flagged: number;
}

export interface CheckinRow {
  id: string;
  person_id: string;
  name: string;
  /** Member ID or registration number */
  code: string;
  method: 'CODE' | 'LEADER';
  status: CheckinStatus;
  flag: CheckinFlag | null;
  distance_m: number | null;
  checked_at: string;
}

export const KIND_LABEL: Record<EventKind, [string, string]> = {
  PROGRAM: ['Program', 'መርሐ ግብር'],
  CHOIR: ['Choir rehearsal', 'የመዝሙር ጥናት'],
  OTHER: ['Other gathering', 'ሌላ ስብሰባ'],
};

export const FLAG_LABEL: Record<CheckinFlag, [string, string]> = {
  NO_LOCATION: ['No location shared', 'ቦታ አላጋራም'],
  FAR: ['Far from the place', 'ከቦታው ርቋል'],
};

/** Can people check in right now? (30 minutes before the start until the end, while open) */
export function checkinOpen(e: Pick<CheckinEvent, 'starts_at' | 'ends_at' | 'status'>, now = Date.now()): boolean {
  return e.status === 'OPEN' && now >= new Date(e.starts_at).getTime() - OPENS_BEFORE_MIN * 60_000 && now <= new Date(e.ends_at).getTime();
}

/** "14:30" in Addis Ababa time */
export function addisTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' });
}

/** Addis Ababa date (YYYY-MM-DD) of a moment */
export function addisDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
