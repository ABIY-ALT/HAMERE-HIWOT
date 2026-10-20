// ─────────────────────────────────────────────────────────────────────────────
// Check-in rules — server only (migration 036). Used by the website and the bot.
//   • The code: 4 digits made from the event's secret and the current
//     30-second slot. The current and the previous code are accepted (a slow
//     phone), nothing older — a code sent to someone at home is soon useless.
//   • Only during the event's time (30 min before the start → the end).
//   • Location: when the leader set the place, within the radius = present;
//     no location or too far = FLAGGED for the leader.
//   • Too many wrong codes: blocked for a while (no guessing).
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CODE_SECONDS, checkinOpen, type CheckinFlag, type CheckinStatus } from './types';

export const newSecret = () => randomBytes(16).toString('hex');

/** The code shown at this moment */
export function codeAt(secret: string, ms = Date.now()): string {
  const slot = Math.floor(ms / (CODE_SECONDS * 1000));
  return String(createHmac('sha256', secret).update(String(slot)).digest().readUInt32BE(0) % 10000).padStart(4, '0');
}

/** Seconds until the code changes */
export const secondsLeft = (ms = Date.now()) => CODE_SECONDS - (Math.floor(ms / 1000) % CODE_SECONDS);

/** The current or the previous code */
export function codeOk(secret: string, typed: string, ms = Date.now()): boolean {
  const code = typed.replace(/\D/g, '');
  return code.length === 4 && (code === codeAt(secret, ms) || code === codeAt(secret, ms - CODE_SECONDS * 1000));
}

/** Metres between two points */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

// Wrong codes: at most 5 in 10 minutes per person and event (this server's memory)
const WRONG_LIMIT = 5;
const WRONG_WINDOW_MS = 10 * 60_000;
const wrong = new Map<string, number[]>();
const recent = (key: string) => (wrong.get(key) ?? []).filter((t) => Date.now() - t < WRONG_WINDOW_MS);
export const tooManyTries = (key: string) => recent(key).length >= WRONG_LIMIT;
export const noteWrong = (key: string) => wrong.set(key, [...recent(key), Date.now()]);

export interface EventRow {
  id: string;
  kind: string;
  title: string;
  starts_at: string;
  ends_at: string;
  secret: string;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  status: 'OPEN' | 'CLOSED';
}

/** Events people can check in to right now. */
export async function openEventsNow(db: SupabaseClient, now = Date.now()): Promise<EventRow[]> {
  const { data } = await db.from('checkin_events')
    .select('*')
    .eq('status', 'OPEN')
    .lte('starts_at', new Date(now + 30 * 60_000).toISOString())
    .gte('ends_at', new Date(now).toISOString())
    .order('starts_at');
  return ((data ?? []) as EventRow[]).filter((e) => checkinOpen(e, now));
}

export type CheckinResult =
  | { ok: true; status: Exclude<CheckinStatus, 'REMOVED'>; flag: CheckinFlag | null; distance: number | null; already: boolean }
  | { ok: false; error: 'NOT_OPEN' | 'WRONG_CODE' | 'TOO_MANY' | 'REMOVED' };

/**
 * Check a person in with the code (or `codeVerified` when it was checked a
 * moment ago in the bot) and, optionally, the phone's location.
 */
export async function checkIn(
  db: SupabaseClient,
  event: EventRow,
  p: { personId: string; code?: string; codeVerified?: boolean; location?: { lat: number; lng: number } | null; chatId?: number | null }
): Promise<CheckinResult> {
  if (!checkinOpen(event)) return { ok: false, error: 'NOT_OPEN' };
  const key = `${event.id}:${p.personId}`;
  if (!p.codeVerified) {
    if (tooManyTries(key)) return { ok: false, error: 'TOO_MANY' };
    if (!codeOk(event.secret, p.code ?? '')) {
      noteWrong(key);
      return { ok: false, error: 'WRONG_CODE' };
    }
  }
  const { data: had } = await db.from('checkins').select('status, flag, distance_m').eq('event_id', event.id).eq('person_id', p.personId).maybeSingle();
  const before = had as { status: CheckinStatus; flag: CheckinFlag | null; distance_m: number | null } | null;
  if (before?.status === 'REMOVED') return { ok: false, error: 'REMOVED' };
  if (before?.status === 'PRESENT') return { ok: true, status: 'PRESENT', flag: null, distance: before.distance_m, already: true };

  let status: 'PRESENT' | 'FLAGGED' = 'PRESENT';
  let flag: CheckinFlag | null = null;
  let distance: number | null = null;
  if (event.lat !== null && event.lng !== null) {
    if (!p.location) {
      status = 'FLAGGED';
      flag = 'NO_LOCATION';
    } else {
      distance = distanceM({ lat: event.lat, lng: event.lng }, p.location);
      if (distance > event.radius_m) {
        status = 'FLAGGED';
        flag = 'FAR';
      }
    }
  }
  // A flagged one that comes again with a good location becomes present
  if (before?.status === 'FLAGGED' && status === 'FLAGGED') return { ok: true, status: 'FLAGGED', flag: before.flag, distance: before.distance_m, already: true };
  const { error } = await db.from('checkins').upsert(
    { event_id: event.id, person_id: p.personId, method: 'CODE', status, flag, distance_m: distance, chat_id: p.chatId ?? null, checked_at: new Date().toISOString() },
    { onConflict: 'event_id,person_id' }
  );
  if (error) throw new Error(error.message);
  return { ok: true, status, flag, distance, already: false };
}
