'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Check-in at programs and choir rehearsals (migration 036).
//   Leaders — PROGRAM_CREATE / PROGRAM_MANAGE (programs, other gatherings),
//             CHOIR_MANAGE (choir rehearsals): open check-in, show the
//             changing code, confirm or remove flagged ones, mark people
//             present, close (writes choir attendance / program participants).
//   Anyone signed in: check themselves in with the code (and location).
// The bot does the same through lib/telegram/checkin-flow.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorizeIn, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type { PermissionCode } from '@/types';
import { checkIn, codeAt, newSecret, openEventsNow, secondsLeft, type EventRow } from '@/lib/checkin/core';
import { checkinOpen, type CheckinEvent, type CheckinFlag, type CheckinRow, type CheckinStatus, type EventKind } from '@/lib/checkin/types';

type Row = Record<string, unknown>;
type Db = Awaited<ReturnType<typeof authorizeIn>>['db'];

const MIGRATION = 'Run database migration 036 (check-in) first';
const missing = (m: string) => (/checkin/.test(m) ? MIGRATION : m);
const RUNNERS: PermissionCode[] = ['PROGRAM_CREATE', 'PROGRAM_MANAGE', 'CHOIR_MANAGE'];
const runsKind = (me: SessionUser, kind: string) =>
  kind === 'CHOIR' ? me.permissions.includes('CHOIR_MANAGE') : me.permissions.includes('PROGRAM_CREATE') || me.permissions.includes('PROGRAM_MANAGE');

function toEvent(e: Row, counts: Map<string, { present: number; flagged: number }>): CheckinEvent {
  return {
    id: e.id as string,
    kind: e.kind as EventKind,
    title: e.title as string,
    program_id: (e.program_id as string) ?? null,
    choir_session_id: (e.choir_session_id as string) ?? null,
    starts_at: e.starts_at as string,
    ends_at: e.ends_at as string,
    has_place: e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined,
    radius_m: Number(e.radius_m ?? 200),
    status: e.status as CheckinEvent['status'],
    present: counts.get(e.id as string)?.present ?? 0,
    flagged: counts.get(e.id as string)?.flagged ?? 0,
  };
}

export interface CheckinEventsData {
  events: CheckinEvent[];
  /** To start check-in for: coming and recent programs and choir rehearsals */
  programs: { id: string; title: string; date: string; time: string | null }[];
  choir: { id: string; title: string; date: string; time: string | null }[];
  can_program: boolean;
  can_choir: boolean;
}

/** Events of the last 60 days and the coming ones, for leaders. */
export async function loadCheckinEvents(): Promise<Loaded<CheckinEventsData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS, 'PROGRAM_VIEW', 'AUDIT_VIEW_ALL');
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data, error } = await db.from('checkin_events').select('*').gte('ends_at', since).order('starts_at', { ascending: false }).limit(200);
    if (error) throw new Error(missing(error.message));
    const rows = (data ?? []) as Row[];
    const ids = rows.map((r) => r.id as string);
    const marks = ids.length ? await selectAll<Row>((a, b) => db.from('checkins').select('event_id, status').in('event_id', ids).order('id').range(a, b)) : [];
    const counts = new Map<string, { present: number; flagged: number }>();
    for (const m of marks) {
      const c = counts.get(m.event_id as string) ?? { present: 0, flagged: 0 };
      if (m.status === 'PRESENT') c.present += 1;
      if (m.status === 'FLAGGED') c.flagged += 1;
      counts.set(m.event_id as string, c);
    }
    const day = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const [programs, choir] = await Promise.all([
      db.from('programs').select('id, title_en, title_am, start_date, start_time').neq('status', 'CANCELLED').gte('start_date', day).order('start_date').limit(50),
      db.from('choir_sessions').select('id, title, kind, session_date, start_time').neq('status', 'CANCELLED').gte('session_date', day).order('session_date').limit(50),
    ]);
    return {
      mode: 'live',
      data: {
        events: rows.map((r) => toEvent(r, counts)),
        programs: ((programs.data ?? []) as Row[]).map((p) => ({ id: p.id as string, title: (p.title_am as string) || (p.title_en as string), date: p.start_date as string, time: (p.start_time as string) ?? null })),
        choir: ((choir.data ?? []) as Row[]).map((c) => ({ id: c.id as string, title: (c.title as string) || 'የመዝሙር ጥናት · Choir rehearsal', date: c.session_date as string, time: (c.start_time as string) ?? null })),
        can_program: runsKind(me, 'PROGRAM'),
        can_choir: runsKind(me, 'CHOIR'),
      },
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

const EventSchema = z.object({
  kind: z.enum(['PROGRAM', 'CHOIR', 'OTHER']),
  program_id: z.string(),
  choir_session_id: z.string(),
  title: z.string().trim().max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date'),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Choose the start time'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Choose the end time'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  radius_m: z.number().int().min(50).max(5000),
});

/** Open check-in for an event. Times are Addis Ababa time. */
export async function createCheckinEvent(input: z.input<typeof EventSchema>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS);
    const e = EventSchema.parse(input);
    if (!runsKind(me, e.kind)) throw new Error(e.kind === 'CHOIR' ? 'Choir rehearsals need the choir permission' : 'Programs need the programs permission');
    let title = e.title;
    if (e.kind === 'PROGRAM') {
      const p = (await db.from('programs').select('title_en, title_am').eq('id', z.string().min(1, 'Choose the program').parse(e.program_id)).maybeSingle().then(check)) as Row | null;
      if (!p) throw new Error('That program was not found');
      title ||= (p.title_am as string) || (p.title_en as string);
    }
    if (e.kind === 'CHOIR') {
      const c = (await db.from('choir_sessions').select('title').eq('id', z.string().min(1, 'Choose the rehearsal').parse(e.choir_session_id)).maybeSingle().then(check)) as Row | null;
      if (!c) throw new Error('That rehearsal was not found');
      title ||= (c.title as string) || 'የመዝሙር ጥናት · Choir rehearsal';
    }
    if (title.length < 2) throw new Error('Give the gathering a name');
    const starts = new Date(`${e.date}T${e.start}:00+03:00`);
    let ends = new Date(`${e.date}T${e.end}:00+03:00`);
    if (ends <= starts) ends = new Date(ends.getTime() + 86_400_000); // ends after midnight
    if ((e.lat === null) !== (e.lng === null)) throw new Error('The place needs both latitude and longitude');
    const row = (await db.from('checkin_events')
      .insert({
        kind: e.kind,
        program_id: e.kind === 'PROGRAM' ? e.program_id : null,
        choir_session_id: e.kind === 'CHOIR' ? e.choir_session_id : null,
        title,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        secret: newSecret(),
        lat: e.lat,
        lng: e.lng,
        radius_m: e.radius_m,
        created_by: me.systemUser.id,
      })
      .select('id')
      .single()
      .then(check)) as { id: string };
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** The event (for one who may run it) */
async function ownEvent(db: Db, me: SessionUser, id: string): Promise<EventRow & Row> {
  const e = (await db.from('checkin_events').select('*').eq('id', z.string().min(1).parse(id)).maybeSingle().then(check)) as (EventRow & Row) | null;
  if (!e) throw new Error('This event was not found — reload the page');
  if (!runsKind(me, e.kind)) throw new Error('You do not run this kind of event');
  return e;
}

export interface CheckinDetail {
  event: CheckinEvent;
  rows: CheckinRow[];
  can_run: boolean;
}

export async function loadCheckinDetail(eventId: string): Promise<{ ok: true; data: CheckinDetail } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS, 'PROGRAM_VIEW', 'AUDIT_VIEW_ALL');
    const e = (await db.from('checkin_events').select('*').eq('id', eventId).maybeSingle().then(check)) as Row | null;
    if (!e) throw new Error('This event was not found — reload the page');
    const marks = await selectAll<Row>((a, b) => db.from('checkins').select('*').eq('event_id', eventId).order('checked_at').range(a, b));
    const ids = [...new Set(marks.map((m) => m.person_id as string))];
    const [{ data: people }, { data: studs }] = ids.length
      ? await Promise.all([
          db.from('persons').select('id, full_name_en, full_name_am, membership_code').in('id', ids),
          db.from('students').select('person_id, reg_no').in('person_id', ids),
        ])
      : [{ data: [] }, { data: [] }];
    const personOf = new Map(((people ?? []) as Row[]).map((p) => [p.id as string, p]));
    const regOf = new Map(((studs ?? []) as Row[]).map((s) => [s.person_id as string, s.reg_no as string]));
    const rows: CheckinRow[] = marks.map((m) => {
      const p = personOf.get(m.person_id as string);
      const code = (p?.membership_code as string) ?? '';
      return {
        id: m.id as string,
        person_id: m.person_id as string,
        name: (p?.full_name_am as string) || (p?.full_name_en as string) || '—',
        code: code.startsWith('MBR') ? code : regOf.get(m.person_id as string) ?? code,
        method: m.method as CheckinRow['method'],
        status: m.status as CheckinStatus,
        flag: (m.flag as CheckinFlag) ?? null,
        distance_m: m.distance_m === null || m.distance_m === undefined ? null : Number(m.distance_m),
        checked_at: m.checked_at as string,
      };
    });
    const counts = new Map([[eventId, { present: rows.filter((r) => r.status === 'PRESENT').length, flagged: rows.filter((r) => r.status === 'FLAGGED').length }]]);
    return { ok: true, data: { event: toEvent(e, counts), rows, can_run: runsKind(me, e.kind as string) } };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** The code on the leader's screen (asked again every few seconds). */
export async function liveCode(eventId: string): Promise<{ ok: true; code: string; seconds: number; open: boolean } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS);
    const e = await ownEvent(db, me, eventId);
    return { ok: true, code: codeAt(e.secret), seconds: secondsLeft(), open: checkinOpen(e) };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Find people to mark present by hand. */
export async function findPeople(query: string): Promise<{ ok: true; people: { id: string; name: string; code: string }[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorizeIn('check_in', ...RUNNERS);
    const q = z.string().trim().min(2, 'Type at least 2 letters').max(60).parse(query).replace(/[%,()]/g, ' ');
    const { data } = await db.from('persons')
      .select('id, full_name_en, full_name_am, membership_code, phone_primary')
      .eq('status', 'ACTIVE')
      .or(`full_name_en.ilike.%${q}%,full_name_am.ilike.%${q}%,membership_code.ilike.%${q}%,phone_primary.ilike.%${q}%`)
      .limit(20);
    return {
      ok: true,
      people: ((data ?? []) as Row[]).map((p) => ({ id: p.id as string, name: (p.full_name_am as string) || (p.full_name_en as string), code: (p.membership_code as string) ?? '' })),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Mark someone present (no phone, or put back after removing). */
export async function markPresent(eventId: string, personId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS);
    const e = await ownEvent(db, me, eventId);
    if (e.status !== 'OPEN') throw new Error('This event is closed');
    await db.from('checkins')
      .upsert(
        { event_id: e.id, person_id: z.string().min(1).parse(personId), method: 'LEADER', status: 'PRESENT', flag: null, reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString() },
        { onConflict: 'event_id,person_id' }
      )
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

export type ScanResult =
  | {
      ok: true;
      person: { id: string; name: string; code: string; photo: boolean };
      /** Was already present */
      already: boolean;
      /** A choir rehearsal, and this person is not an active choir member */
      not_in_choir: boolean;
    }
  | { ok: false; error: string };

/**
 * The leader scans someone's QR (member card, or "My QR" from the bot or the
 * website — both hold the member code) or types the code / registration
 * number: they are marked present at once.
 */
export async function scanPresent(eventId: string, scanned: string): Promise<ScanResult> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS);
    const e = await ownEvent(db, me, eventId);
    if (e.status !== 'OPEN') throw new Error('This event is closed');
    const code = z.string().trim().min(3, 'Scan or type a code').max(60).parse(scanned);

    type P = { id: string; full_name_en: string; full_name_am: string | null; membership_code: string; profile_photo_url: string | null; status: string };
    const COLS = 'id, full_name_en, full_name_am, membership_code, profile_photo_url, status';
    let { data: person } = (await db.from('persons').select(COLS).ilike('membership_code', code.replace(/[%_\\]/g, '')).maybeSingle()) as { data: P | null };
    if (!person) {
      const { data: student } = await db.from('students').select(`person:persons!students_person_id_fkey(${COLS})`).ilike('reg_no', code.replace(/[%_\\]/g, '')).maybeSingle();
      person = ((student as unknown as { person: P | null } | null)?.person) ?? null;
    }
    if (!person) throw new Error(`No member or student has the code ${code}`);
    if (person.status !== 'ACTIVE') throw new Error(`${person.full_name_am || person.full_name_en} is not an active member`);

    const [{ data: before }, choir] = await Promise.all([
      db.from('checkins').select('status').eq('event_id', e.id).eq('person_id', person.id).maybeSingle(),
      e.kind === 'CHOIR'
        ? db.from('choir_members').select('id').eq('person_id', person.id).eq('status', 'ACTIVE').maybeSingle()
        : Promise.resolve({ data: { id: '' } }),
    ]);
    const already = (before as { status: string } | null)?.status === 'PRESENT';
    if (!already) {
      await db.from('checkins')
        .upsert(
          { event_id: e.id, person_id: person.id, method: 'LEADER', status: 'PRESENT', flag: null, reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString() },
          { onConflict: 'event_id,person_id' }
        )
        .then(check);
    }
    return {
      ok: true,
      person: { id: person.id, name: person.full_name_am || person.full_name_en, code: person.membership_code, photo: Boolean(person.profile_photo_url) },
      already,
      not_in_choir: !choir.data,
    };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Confirm a flagged check-in (PRESENT) or remove one (REMOVED: they cannot check in again for this event). */
export async function reviewCheckin(checkinId: string, decision: 'PRESENT' | 'REMOVED'): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS);
    const c = (await db.from('checkins').select('id, event_id').eq('id', z.string().min(1).parse(checkinId)).maybeSingle().then(check)) as Row | null;
    if (!c) throw new Error('This check-in was not found — reload the page');
    const e = await ownEvent(db, me, c.event_id as string);
    if (e.status !== 'OPEN') throw new Error('This event is closed');
    await db.from('checkins')
      .update({ status: z.enum(['PRESENT', 'REMOVED']).parse(decision), reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString() })
      .eq('id', c.id as string)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/**
 * Close: no more check-ins. Flagged ones not confirmed do not count. A choir
 * rehearsal's attendance is written (checked in = present, the choir's other
 * active members = absent; marks the leader already made stay); a program gets
 * its number of participants.
 */
export async function closeCheckinEvent(eventId: string): Promise<{ ok: true; present: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('check_in', ...RUNNERS);
    const e = await ownEvent(db, me, eventId);
    const marks = await selectAll<Row>((a, b) => db.from('checkins').select('person_id, status').eq('event_id', e.id).order('id').range(a, b));
    const present = new Set(marks.filter((m) => m.status === 'PRESENT').map((m) => m.person_id as string));
    await db.from('checkin_events').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('id', e.id).then(check);

    if (e.kind === 'CHOIR' && e.choir_session_id) {
      const members = (await db.from('choir_members').select('id, person_id').eq('status', 'ACTIVE').then(check)) as { id: string; person_id: string }[];
      const { data: already } = await db.from('choir_attendance').select('member_id').eq('session_id', e.choir_session_id as string);
      const marked = new Set(((already ?? []) as { member_id: string }[]).map((a) => a.member_id));
      const rows = members
        .filter((m) => !marked.has(m.id))
        .map((m) => ({ session_id: e.choir_session_id, member_id: m.id, status: present.has(m.person_id) ? 'PRESENT' : 'ABSENT' }));
      if (rows.length) await db.from('choir_attendance').insert(rows).then(check);
      await db.from('choir_sessions').update({ status: 'HELD' }).eq('id', e.choir_session_id as string);
    }
    if (e.kind === 'PROGRAM' && e.program_id) {
      await db.from('programs').update({ actual_participants: present.size }).eq('id', e.program_id as string);
    }
    return { ok: true, present: present.size };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

// ── Checking oneself in on the website ───────────────────────────────────────

export interface MyCheckin {
  events: { id: string; title: string; kind: EventKind; starts_at: string; ends_at: string; has_place: boolean; mine: CheckinStatus | null }[];
  /** The QR the leader scans (it holds the member code) */
  qr: { name: string; code: string } | null;
}

export async function loadMyCheckin(): Promise<Loaded<MyCheckin>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorizeIn('check_in');
    const [events, { data: self }] = await Promise.all([
      openEventsNow(db),
      db.from('persons').select('full_name_en, full_name_am, membership_code').eq('id', me.person.id).maybeSingle(),
    ]);
    const person = self as { full_name_en: string; full_name_am: string | null; membership_code: string } | null;
    const { data } = events.length
      ? await db.from('checkins').select('event_id, status').eq('person_id', me.person.id).in('event_id', events.map((e) => e.id))
      : { data: [] };
    const mine = new Map(((data ?? []) as Row[]).map((m) => [m.event_id as string, m.status as CheckinStatus]));
    return {
      mode: 'live',
      data: {
        events: events.map((e) => ({ id: e.id, title: e.title, kind: e.kind as EventKind, starts_at: e.starts_at, ends_at: e.ends_at, has_place: e.lat !== null && e.lng !== null, mine: mine.get(e.id) ?? null })),
        qr: person ? { name: person.full_name_am || person.full_name_en, code: person.membership_code } : null,
      },
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

/** "✅ I'm here" on the website: the code on the screen, and the phone's location if given. */
export async function checkInMe(
  eventId: string,
  code: string,
  location: { lat: number; lng: number } | null
): Promise<{ ok: true; status: 'PRESENT' | 'FLAGGED'; flag: CheckinFlag | null } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('check_in');
    const e = (await db.from('checkin_events').select('*').eq('id', z.string().min(1).parse(eventId)).maybeSingle().then(check)) as EventRow | null;
    if (!e) throw new Error('This event was not found');
    const loc = location ? z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(location) : null;
    const res = await checkIn(db, e, { personId: me.person.id, code, location: loc });
    if (!res.ok) {
      throw new Error(
        {
          NOT_OPEN: 'Check-in for this event is not open now',
          WRONG_CODE: 'That code is not right — type the code on the screen now',
          TOO_MANY: 'Too many wrong codes — ask the leader to mark you',
          REMOVED: 'The leader removed your check-in for this event — ask them',
        }[res.error]
      );
    }
    return { ok: true, status: res.status, flag: res.flag };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

// ── Export (Excel / CSV) ─────────────────────────────────────────────────────

export interface CheckinExportRow {
  date: string;
  event: string;
  kind: EventKind;
  starts_at: string;
  name: string;
  code: string;
  status: CheckinStatus;
  method: 'CODE' | 'LEADER';
  flag: CheckinFlag | null;
  distance_m: number | null;
  checked_at: string;
}

/** Every check-in of the events since `from` (YYYY-MM-DD), one row each — for Excel / CSV. */
export async function loadCheckinExport(from: string): Promise<{ ok: true; rows: CheckinExportRow[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorizeIn('check_in', ...RUNNERS, 'PROGRAM_VIEW', 'AUDIT_VIEW_ALL');
    const since = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(from);
    const events = await selectAll<Row>((a, b) => db.from('checkin_events').select('id, title, kind, starts_at').gte('starts_at', `${since}T00:00:00+03:00`).order('starts_at').range(a, b));
    if (!events.length) return { ok: true, rows: [] };
    const eventOf = new Map(events.map((e) => [e.id as string, e]));
    const marks: Row[] = [];
    for (let i = 0; i < events.length; i += 100) {
      const ids = events.slice(i, i + 100).map((e) => e.id as string);
      marks.push(...(await selectAll<Row>((a, b) => db.from('checkins').select('*').in('event_id', ids).order('checked_at').range(a, b))));
    }
    const personIds = [...new Set(marks.map((m) => m.person_id as string))];
    const people = new Map<string, Row>();
    const regs = new Map<string, string>();
    for (let i = 0; i < personIds.length; i += 150) {
      const part = personIds.slice(i, i + 150);
      const [{ data: ps }, { data: ss }] = await Promise.all([
        db.from('persons').select('id, full_name_en, full_name_am, membership_code').in('id', part),
        db.from('students').select('person_id, reg_no').in('person_id', part),
      ]);
      for (const p of (ps ?? []) as Row[]) people.set(p.id as string, p);
      for (const s of (ss ?? []) as Row[]) regs.set(s.person_id as string, s.reg_no as string);
    }
    const rows: CheckinExportRow[] = marks.map((m) => {
      const e = eventOf.get(m.event_id as string)!;
      const p = people.get(m.person_id as string);
      const memberCode = (p?.membership_code as string) ?? '';
      return {
        date: new Date(new Date(e.starts_at as string).getTime() + 3 * 3600_000).toISOString().slice(0, 10),
        event: e.title as string,
        kind: e.kind as EventKind,
        starts_at: e.starts_at as string,
        name: (p?.full_name_am as string) || (p?.full_name_en as string) || '—',
        code: memberCode.startsWith('MBR') ? memberCode : regs.get(m.person_id as string) ?? memberCode,
        status: m.status as CheckinStatus,
        method: m.method as CheckinExportRow['method'],
        flag: (m.flag as CheckinFlag) ?? null,
        distance_m: m.distance_m === null || m.distance_m === undefined ? null : Number(m.distance_m),
        checked_at: m.checked_at as string,
      };
    });
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}
