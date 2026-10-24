'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Event sign-up for the office (migration 046).
//   See the lists:        PROGRAM_VIEW (or create / manage, audit)
//   Check people in at the door, add walk-ins: PROGRAM_CREATE / PROGRAM_MANAGE
//   Open / close sign-up, set the seats, cancel a registration:
//                         PROGRAM_MANAGE, or the person who created the program
// People sign up themselves from the public website (app/(site)/events) and
// the Telegram bot (lib/telegram/events-flow).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';
import { telegramLater } from '@/lib/telegram/bot';
import { refreshPublicSite } from '@/lib/site/cache';
import { addDays } from '@/lib/hr/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import { createRegistration, isMissingTable, registrationNumbers, sendTicket } from '@/lib/events/registrations';
import { MAX_SEATS_OFFICE, REG_MIGRATION, failureText, type RegEvent, type RegSource, type RegStatus, type Registration } from '@/lib/events/types';

type Row = Record<string, unknown>;
type Db = Awaited<ReturnType<typeof authorize>>['db'];

const id = z.string().regex(/^[0-9a-f-]{36}$/i, 'Not found');
const missing = (m: string) => (isMissingTable(m) ? REG_MIGRATION : m);
/** Programs that ended longer ago than this are not listed */
const RECENT_DAYS = 30;

const canRun = (me: SessionUser) => me.permissions.includes('PROGRAM_CREATE') || me.permissions.includes('PROGRAM_MANAGE');
const canManage = (me: SessionUser, createdBy: string | null) => me.permissions.includes('PROGRAM_MANAGE') || (createdBy !== null && createdBy === me.systemUser.id);

async function programOf(db: Db, programId: string) {
  return (await db.from('programs').select('id, title_en, title_am, start_date, start_time, end_date, location, status, created_by').eq('id', id.parse(programId)).maybeSingle().then(check)) as {
    id: string; title_en: string; title_am: string | null; start_date: string; start_time: string | null; end_date: string | null; location: string | null; status: string; created_by: string | null;
  } | null;
}

/** Coming programs and those of the last 30 days, each with its sign-up numbers. */
export async function loadRegEvents(): Promise<Loaded<{ events: RegEvent[]; can_run: boolean }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('PROGRAM_VIEW', 'PROGRAM_CREATE', 'PROGRAM_MANAGE', 'AUDIT_VIEW_ALL');
    const since = addDays(todayIso(), -RECENT_DAYS);
    const rows = await selectAll<Row>((a, b) =>
      db.from('programs')
        .select('id, title_en, title_am, start_date, start_time, end_date, location, status, is_public, created_by')
        .or(`start_date.gte.${since},end_date.gte.${since}`)
        .order('start_date')
        .order('id')
        .range(a, b)
    );
    const numbers = await registrationNumbers(db, rows.map((r) => r.id as string)).catch((e) => {
      throw new Error(missing(errorMessage(e)));
    });
    if (rows.length && numbers.size === 0) throw new Error(REG_MIGRATION);
    const events: RegEvent[] = rows.map((p) => {
      const n = numbers.get(p.id as string);
      return {
        id: p.id as string,
        title_en: p.title_en as string,
        title_am: (p.title_am as string) || (p.title_en as string),
        start_date: p.start_date as string,
        start_time: ((p.start_time as string) ?? '').slice(0, 5),
        end_date: (p.end_date as string) ?? null,
        location: (p.location as string) ?? '',
        status: p.status as RegEvent['status'],
        is_public: Boolean(p.is_public),
        settings: n?.settings ?? { open: false, capacity: null, closes_on: null },
        people: n?.people ?? 0,
        seats: n?.seats ?? 0,
        arrived: n?.arrived ?? 0,
        can_manage: canManage(me, (p.created_by as string) ?? null),
      };
    });
    return { mode: 'live', data: { events, can_run: canRun(me) } };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

function toRegistration(r: Row): Registration {
  const person = (r.person ?? null) as { membership_code?: string | null } | null;
  return {
    id: r.id as string,
    ticket_code: r.ticket_code as string,
    full_name: r.full_name as string,
    phone: (r.phone as string) ?? '',
    person_id: (r.person_id as string) ?? null,
    member_code: person?.membership_code ?? '',
    seats: Number(r.seats),
    note: (r.note as string) ?? '',
    source: r.source as RegSource,
    status: r.status as RegStatus,
    checked_in_at: (r.checked_in_at as string) ?? null,
    created_at: r.created_at as string,
  };
}

const REG_COLUMNS = 'id, ticket_code, full_name, phone, person_id, seats, note, source, status, checked_in_at, created_at, person:persons!event_registrations_person_fkey(membership_code)';

/** Everyone who signed up for a program (cancelled ones too), first come first. */
export async function loadRegistrations(programId: string): Promise<{ ok: true; registrations: Registration[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('PROGRAM_VIEW', 'PROGRAM_CREATE', 'PROGRAM_MANAGE', 'AUDIT_VIEW_ALL');
    const rows = await selectAll<Row>((a, b) =>
      db.from('event_registrations').select(REG_COLUMNS).eq('program_id', id.parse(programId)).order('created_at').order('id').range(a, b)
    );
    return { ok: true, registrations: rows.map(toRegistration) };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

const SettingsSchema = z
  .object({
    open: z.boolean(),
    capacity: z.union([z.literal(''), z.coerce.number().int().min(1, 'Seats must be at least 1').max(100_000)]),
    closes_on: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
  });

/** Open or close sign-up, and set the seats and the last day. */
export async function saveRegSettings(programId: string, input: z.input<typeof SettingsSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const s = SettingsSchema.parse(input);
    const p = await programOf(db, programId);
    if (!p) throw new Error('Not found — reload the page');
    if (!canManage(me, p.created_by)) throw new Error('Only the person who created this program or a program manager can change its sign-up');
    if (s.open && p.status !== 'PLANNED' && p.status !== 'CONFIRMED') throw new Error('Only a planned or confirmed program can take sign-ups');
    if (s.open && (p.end_date ?? p.start_date) < todayIso()) throw new Error('This program is already over');
    if (s.closes_on && s.closes_on > (p.end_date ?? p.start_date)) throw new Error('The last day to sign up cannot be after the program');
    const res = await db.from('programs')
      .update({ registration_open: s.open, registration_capacity: s.capacity === '' ? null : s.capacity, registration_closes_on: s.closes_on || null })
      .eq('id', p.id);
    if (res.error) throw new Error(missing(res.error.message));
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const AddSchema = z.object({
  name: z.string().trim().min(2, 'Enter the name').max(80),
  phone: z.string().trim().transform((v) => (v ? normalizePhone(v) : '')).refine((v) => v === '' || isValidPhone(v), 'Enter a valid phone number (09… or 07…)'),
  seats: z.coerce.number().int().min(1).max(MAX_SEATS_OFFICE, `At most ${MAX_SEATS_OFFICE} people at once`),
  note: z.string().trim().max(300),
  person_id: z.string(),
});

/** The office adds someone (also after sign-up closed, or beyond the seats: walk-ins). */
export async function addRegistration(
  programId: string,
  input: z.input<typeof AddSchema>,
  checkInNow = false
): Promise<{ ok: true; registration: Registration } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const a = AddSchema.parse(input);
    const p = await programOf(db, programId);
    if (!p) throw new Error('Not found — reload the page');
    if (p.status === 'CANCELLED') throw new Error('This program was cancelled');
    const res = await createRegistration(db, {
      programId: p.id,
      name: a.name,
      phone: a.phone,
      seats: a.seats,
      note: a.note,
      source: 'OFFICE',
      personId: a.person_id ? id.parse(a.person_id) : undefined,
      createdBy: me.systemUser.id,
    });
    if (!res.ok) throw new Error(res.reason === 'FAILED' && res.message ? res.message : failureText(res.reason, res.left).en);
    if (checkInNow) {
      await db.from('event_registrations').update({ checked_in_at: new Date().toISOString(), checked_in_by: me.systemUser.id }).eq('id', res.id).then(check);
    } else if (a.phone) {
      telegramLater((tdb) => sendTicket(tdb, p, { ticket: res.ticket, name: a.name, seats: a.seats, phone: a.phone, chat_id: null }));
    }
    const row = await db.from('event_registrations').select(REG_COLUMNS).eq('id', res.id).single().then(check);
    return { ok: true, registration: toRegistration(row as Row) };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

export type DoorResult =
  | { ok: true; registration: Registration; already: boolean }
  | { ok: false; error: string; /** A member's card was scanned but they did not sign up: offer to add them */ member?: { id: string; name: string; phone: string } };

/**
 * At the door: a ticket code, a member's card code (QR) or a phone number.
 * Checks the registration in (or says it already was).
 */
export async function checkInAtDoor(programId: string, code: string): Promise<DoorResult> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const pid = id.parse(programId);
    const raw = code.trim();
    if (raw.length < 3) throw new Error('Type or scan the ticket code');
    const upper = raw.toUpperCase().replace(/\s+/g, '');
    const phone = normalizePhone(raw);

    let row: Row | null = null;
    const byTicket = await db.from('event_registrations').select(REG_COLUMNS).eq('program_id', pid).eq('ticket_code', upper).maybeSingle();
    if (byTicket.error) throw new Error(byTicket.error.message);
    row = byTicket.data as Row | null;
    if (!row && isValidPhone(phone)) {
      const { data } = await db.from('event_registrations').select(REG_COLUMNS).eq('program_id', pid).eq('phone', phone).eq('status', 'REGISTERED').maybeSingle();
      row = (data as Row | null) ?? null;
    }
    let member: { id: string; name: string; phone: string } | undefined;
    if (!row) {
      const { data: person } = await db.from('persons').select('id, full_name_en, full_name_am, phone_primary').eq('membership_code', raw).maybeSingle();
      if (person) {
        const pr = person as { id: string; full_name_en: string; full_name_am: string | null; phone_primary: string | null };
        const { data } = await db.from('event_registrations').select(REG_COLUMNS).eq('program_id', pid).eq('person_id', pr.id).eq('status', 'REGISTERED').maybeSingle();
        row = (data as Row | null) ?? null;
        member = { id: pr.id, name: pr.full_name_am || pr.full_name_en, phone: normalizePhone(pr.phone_primary ?? '') };
      }
    }
    if (!row) {
      return member
        ? { ok: false, error: `${member.name} has not signed up for this program.`, member }
        : { ok: false, error: 'No registration with this code for this program.' };
    }
    const reg = toRegistration(row);
    if (reg.status === 'CANCELLED') return { ok: false, error: `${reg.full_name}'s registration was cancelled.` };
    if (reg.checked_in_at) return { ok: true, registration: reg, already: true };
    const at = new Date().toISOString();
    await db.from('event_registrations').update({ checked_in_at: at, checked_in_by: me.systemUser.id }).eq('id', reg.id).then(check);
    return { ok: true, registration: { ...reg, checked_in_at: at }, already: false };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Check in from the list, or undo a check-in made by mistake. */
export async function setCheckedIn(registrationId: string, present: boolean): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const { data } = await db.from('event_registrations').select('id, status').eq('id', id.parse(registrationId)).maybeSingle();
    const r = data as { id: string; status: RegStatus } | null;
    if (!r) throw new Error('Not found — reload the page');
    if (r.status !== 'REGISTERED') throw new Error('This registration was cancelled');
    await db.from('event_registrations')
      .update(present ? { checked_in_at: new Date().toISOString(), checked_in_by: me.systemUser.id } : { checked_in_at: null, checked_in_by: null })
      .eq('id', r.id)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Cancel a registration (kept on the list as cancelled; the seats are free again). */
export async function cancelRegistration(registrationId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const { data } = await db.from('event_registrations')
      .select('id, status, checked_in_at, program:programs!event_registrations_program_fkey(created_by)')
      .eq('id', id.parse(registrationId))
      .maybeSingle();
    const r = data as unknown as { id: string; status: RegStatus; checked_in_at: string | null; program: { created_by: string | null } | null } | null;
    if (!r) throw new Error('Not found — reload the page');
    if (!canManage(me, r.program?.created_by ?? null)) throw new Error('Only the person who created this program or a program manager can cancel registrations');
    if (r.status === 'CANCELLED') return { ok: true };
    if (r.checked_in_at) throw new Error('This person was already checked in — undo the check-in first');
    await db.from('event_registrations').update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() }).eq('id', r.id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Members to add by name or code (the "Add" form). */
export async function findMembers(query: string): Promise<{ ok: true; people: { id: string; name: string; code: string; phone: string }[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const q = query.replace(/[,()*%\\]/g, ' ').trim();
    if (q.length < 2) return { ok: true, people: [] };
    const { data } = await db.from('persons')
      .select('id, full_name_en, full_name_am, membership_code, phone_primary')
      .eq('status', 'ACTIVE')
      .or(`full_name_en.ilike.%${q}%,full_name_am.ilike.%${q}%,membership_code.ilike.%${q}%`)
      .order('full_name_en')
      .limit(12);
    return {
      ok: true,
      people: ((data ?? []) as { id: string; full_name_en: string; full_name_am: string | null; membership_code: string | null; phone_primary: string | null }[]).map((p) => ({
        id: p.id,
        name: p.full_name_am ? `${p.full_name_en} · ${p.full_name_am}` : p.full_name_en,
        code: p.membership_code ?? '',
        phone: normalizePhone(p.phone_primary ?? ''),
      })),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
