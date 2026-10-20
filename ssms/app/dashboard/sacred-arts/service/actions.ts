'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Service roster (ምደባ) and vestments (የክብር ልብስ) — migration 037.
// View: MEMBER_VIEW or CHOIR_MANAGE. Change: CHOIR_MANAGE.
// • A roster is saved as a draft, then published: every active choir member is
//   told in the bot whether they are on it (with the full list, as the paper
//   used to show). Later changes tell only the people they touch.
// • Vestments are the choir's own store (not the property register): issued to
//   a person for a service with a return day, received back with their condition.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import { pushToUsers } from '@/lib/push/send';
import { telegramLater, telegramToPersons } from '@/lib/telegram/bot';
import { addisDate } from '@/lib/checkin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import {
  vestmentLabel,
  windowStart,
  type Assignment,
  type Roster,
  type RosterStatus,
  type ServiceData,
  type ServiceResponse,
  type Vestment,
  type VestmentCondition,
  type VestmentLoan,
  type VestmentStatus,
} from '@/lib/choir/service';
import {
  assignedText,
  notAssignedText,
  removedText,
  roleChangedText,
  sessionTitle,
  vestmentIssuedText,
  vestmentReminderText,
} from '@/lib/choir/service-core';

type Row = Record<string, unknown> & { id: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const today = () => addisDate(new Date().toISOString());
const missing = (msg: string) =>
  /service_roster|vestment|roster_status/.test(msg) ? 'Run database migration 037 (service roster and vestments) first' : msg;

export async function loadService(): Promise<Loaded<ServiceData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('MEMBER_VIEW', 'CHOIR_MANAGE', 'AUDIT_VIEW_ALL');
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [sessions, assignments, vestments, uses, loans] = await Promise.all([
      selectAll<Row>((a, b) =>
        db.from('choir_sessions')
          .select('id, roster_status, roster_published_at, roster_min_rate, roster_weeks')
          .in('kind', ['SERVICE', 'PERFORMANCE'])
          .order('id')
          .range(a, b)
      ),
      selectAll<Row>((a, b) => db.from('service_roster').select('*').order('created_at').order('id').range(a, b)),
      selectAll<Row>((a, b) => db.from('vestments').select('*').order('code').order('id').range(a, b)),
      selectAll<{ vestment_id: string }>((a, b) => db.from('vestment_loans').select('vestment_id').order('id').range(a, b)),
      selectAll<Row>((a, b) =>
        db.from('vestment_loans')
          .select('*, vestment:vestments(code, kind, size), person:persons(full_name_en, full_name_am, phone_primary), session:choir_sessions(title, kind, session_date)')
          .or(`returned_at.is.null,returned_at.gte.${since}`)
          .order('issued_at', { ascending: false })
          .order('id')
          .range(a, b)
      ),
    ]);

    const bySession = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = bySession.get(a.session_id as string) ?? [];
      list.push({
        id: a.id,
        member_id: a.member_id as string,
        role: (a.role as string) ?? '',
        rate: (a.rate as number) ?? null,
        response: a.response as ServiceResponse,
        response_note: (a.response_note as string) ?? '',
        responded_at: (a.responded_at as string) ?? null,
        notified: Boolean(a.notified_at),
      });
      bySession.set(a.session_id as string, list);
    }
    const rosters: Roster[] = sessions.map((s) => ({
      session_id: s.id,
      status: s.roster_status as RosterStatus,
      published_at: (s.roster_published_at as string) ?? null,
      min_rate: (s.roster_min_rate as number) ?? null,
      weeks: (s.roster_weeks as number) ?? null,
      assignments: bySession.get(s.id) ?? [],
    }));
    const useCount = new Map<string, number>();
    for (const u of uses) useCount.set(u.vestment_id, (useCount.get(u.vestment_id) ?? 0) + 1);

    return {
      mode: 'live',
      data: {
        rosters,
        vestments: vestments.map(
          (v): Vestment => ({
            id: v.id,
            code: v.code as string,
            kind: v.kind as string,
            size: (v.size as string) ?? '',
            condition: v.condition as VestmentCondition,
            status: v.status as VestmentStatus,
            notes: (v.notes as string) ?? '',
            uses: useCount.get(v.id) ?? 0,
          })
        ),
        loans: loans.map((l): VestmentLoan => {
          const v = l.vestment as { code: string; kind: string; size: string | null } | null;
          const p = (l.person ?? {}) as Record<string, string | null>;
          const s = l.session as { title: string | null; kind: string; session_date: string } | null;
          return {
            id: l.id,
            vestment_id: l.vestment_id as string,
            vestment: v ? vestmentLabel(v) : '—',
            person_id: l.person_id as string,
            person: p.full_name_am || p.full_name_en || '—',
            phone: p.phone_primary ?? '',
            session_id: (l.session_id as string) ?? null,
            session: s ? `${sessionTitle(s)} · ${s.session_date}` : '',
            issued_at: l.issued_at as string,
            due_on: l.due_on as string,
            returned_at: (l.returned_at as string) ?? null,
            return_condition: (l.return_condition as VestmentLoan['return_condition']) ?? null,
            notes: (l.notes as string) ?? '',
            reminded_at: (l.reminded_at as string) ?? null,
          };
        }),
      },
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

// ── Roster ───────────────────────────────────────────────────────────────────

const RosterSchema = z.object({
  min_rate: z.number().int().min(0).max(100),
  weeks: z.number().int().min(1).max(26),
  entries: z
    .array(z.object({ member_id: z.string().min(1), role: z.string().trim().max(80) }))
    .max(300)
    .refine((list) => new Set(list.map((x) => x.member_id)).size === list.length, 'A member is on the list twice'),
});

export type RosterInput = z.input<typeof RosterSchema>;

type MemberRow = { id: string; person_id: string; status: string; person: { full_name_en: string; full_name_am: string | null } | null };
const nameOf = (m: MemberRow) => m.person?.full_name_am || m.person?.full_name_en || '—';

/** Each active member's rehearsal attendance (%) in the window before the service — the server's own count. */
async function ratesBefore(db: Awaited<ReturnType<typeof authorize>>['db'], date: string, weeks: number): Promise<Map<string, number | null>> {
  const ids = ((await db.from('choir_sessions')
    .select('id')
    .eq('kind', 'REHEARSAL')
    .eq('status', 'HELD')
    .gte('session_date', windowStart(date, weeks))
    .lte('session_date', date)
    .then(check)) as { id: string }[]).map((s) => s.id);
  const marks: { member_id: string; status: string }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    marks.push(...((await db.from('choir_attendance').select('member_id, status').in('session_id', ids.slice(i, i + 150)).then(check)) as typeof marks));
  }
  const tally = new Map<string, { counted: number; came: number }>();
  for (const m of marks) {
    if (m.status === 'EXCUSED') continue;
    const t = tally.get(m.member_id) ?? { counted: 0, came: 0 };
    t.counted += 1;
    if (m.status === 'PRESENT' || m.status === 'LATE') t.came += 1;
    tally.set(m.member_id, t);
  }
  return new Map([...tally].map(([id, t]) => [id, t.counted ? Math.round((t.came / t.counted) * 100) : null]));
}

/**
 * Save the roster of a service. `publish` (or a roster that is already out)
 * tells people in the bot: the first time everyone in the choir (on it or
 * not); afterwards only the ones added, taken off or given another part.
 */
export async function saveRoster(sessionId: string, input: RosterInput, publish: boolean): Promise<ActionResult & { told?: number }> {
  try {
    const { me, db } = await authorize('CHOIR_MANAGE');
    const r = RosterSchema.parse(input);
    const s = (await db.from('choir_sessions')
      .select('id, kind, status, session_date, start_time, title, location, roster_status')
      .eq('id', z.string().min(1).parse(sessionId))
      .maybeSingle()
      .then(check)) as { id: string; kind: string; status: string; session_date: string; start_time: string | null; title: string | null; location: string | null; roster_status: RosterStatus } | null;
    if (!s) throw new Error('This service was not found');
    if (s.kind !== 'SERVICE' && s.kind !== 'PERFORMANCE') throw new Error('A roster is made for a service or a performance');
    if (s.status !== 'PLANNED') throw new Error('This service is no longer planned');
    if (s.session_date < today()) throw new Error('This service day has passed');
    const goesOut = publish || s.roster_status === 'PUBLISHED';
    if (goesOut && r.entries.length === 0) throw new Error('Put at least one member on the roster');

    const members = (await db.from('choir_members')
      .select('id, person_id, status, person:persons(full_name_en, full_name_am)')
      .then(check)) as unknown as MemberRow[];
    const byId = new Map(members.map((m) => [m.id, m]));
    const unknown = r.entries.filter((x) => !byId.has(x.member_id));
    if (unknown.length) throw new Error('Someone on the list is not in the choir');

    const rates = await ratesBefore(db, s.session_date, r.weeks);
    const before = (await db.from('service_roster').select('id, member_id, role, notified_at').eq('session_id', s.id).then(check)) as {
      id: string; member_id: string; role: string | null; notified_at: string | null;
    }[];
    const old = new Map(before.map((a) => [a.member_id, a]));
    const keep = new Set(r.entries.map((x) => x.member_id));
    const removed = before.filter((a) => !keep.has(a.member_id));

    if (removed.length) await db.from('service_roster').delete().in('id', removed.map((a) => a.id)).then(check);
    for (const x of r.entries) {
      const was = old.get(x.member_id);
      if (was) {
        if ((was.role ?? '') !== x.role) await db.from('service_roster').update({ role: x.role || null }).eq('id', was.id).then(check);
      } else {
        await db.from('service_roster')
          .insert({ session_id: s.id, member_id: x.member_id, role: x.role || null, rate: rates.get(x.member_id) ?? null, created_by: me.systemUser.id })
          .then(check);
      }
    }
    const nowIso = new Date().toISOString();
    await db.from('choir_sessions')
      .update({
        roster_status: goesOut ? 'PUBLISHED' : r.entries.length ? 'DRAFT' : 'NONE',
        roster_min_rate: r.min_rate,
        roster_weeks: r.weeks,
        ...(goesOut && s.roster_status !== 'PUBLISHED' ? { roster_published_at: nowIso } : {}),
      })
      .eq('id', s.id)
      .then(check);
    if (!goesOut) return { ok: true };

    // ── Tell people ──
    const info = { title: sessionTitle(s), date: s.session_date, time: (s.start_time ?? '').slice(0, 5), location: s.location ?? '' };
    const list = r.entries.map((x) => ({ name: nameOf(byId.get(x.member_id)!), role: x.role }));
    const messages: { personId: string; html: string; assigned?: boolean }[] = [];
    for (const x of r.entries) {
      const m = byId.get(x.member_id)!;
      const was = old.get(x.member_id);
      if (!was?.notified_at) messages.push({ personId: m.person_id, html: assignedText(info, x.role, list), assigned: true });
      else if ((was.role ?? '') !== x.role) messages.push({ personId: m.person_id, html: roleChangedText(info, x.role) });
    }
    for (const a of removed) {
      const m = byId.get(a.member_id);
      if (m && a.notified_at) messages.push({ personId: m.person_id, html: removedText(info) });
    }
    if (s.roster_status !== 'PUBLISHED') {
      for (const m of members) {
        if (m.status !== 'ACTIVE' || keep.has(m.id)) continue;
        messages.push({ personId: m.person_id, html: notAssignedText(info, rates.get(m.id) ?? null, r.min_rate, list) });
      }
    }
    await db.from('service_roster').update({ notified_at: nowIso }).eq('session_id', s.id).is('notified_at', null).then(check);

    const assignedPeople = messages.filter((x) => x.assigned).map((x) => x.personId);
    telegramLater(async (bg) => {
      for (const msg of messages) await telegramToPersons(bg, [msg.personId], msg.html, 'SELF');
    });
    if (assignedPeople.length) {
      const { data: accounts } = await db.from('system_users').select('id').in('person_id', assignedPeople).eq('is_active', true);
      const users = ((accounts ?? []) as { id: string }[]).map((u) => u.id);
      if (users.length) {
        await pushToUsers(db, users, {
          title: `🎵 ${info.title}`,
          body: `${formatEthiopianDate(info.date, 'am')} — ተመድበዋል · You are on the roster. Please confirm.`,
          url: '/dashboard/my-service',
          tag: `roster-${s.id}`,
        }).catch(() => {});
      }
    }
    return { ok: true, told: messages.length };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** The leader records an answer given in person ("she told me she can't come"). */
export async function setAssignmentResponse(assignmentId: string, response: ServiceResponse, note: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('CHOIR_MANAGE');
    const res = z.enum(['PENDING', 'CONFIRMED', 'DECLINED']).parse(response);
    await db.from('service_roster')
      .update({ response: res, response_note: res === 'DECLINED' ? note.trim().slice(0, 500) || null : null, responded_at: res === 'PENDING' ? null : new Date().toISOString() })
      .eq('id', z.string().min(1).parse(assignmentId))
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

// ── Vestment store ───────────────────────────────────────────────────────────

const VestmentSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, 'Give it a number / code').max(40),
  kind: z.string().trim().min(2, 'What kind of vestment is it?').max(80),
  size: z.string().trim().max(20),
  condition: z.enum(['GOOD', 'WORN', 'DAMAGED']),
  status: z.enum(['AVAILABLE', 'REPAIR', 'RETIRED', 'LOST']),
  notes: z.string().trim().max(1000),
});

export type VestmentInput = z.input<typeof VestmentSchema>;

export async function saveVestment(id: string | null, input: VestmentInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('CHOIR_MANAGE');
    const v = VestmentSchema.parse(input);
    const fields = { code: v.code, kind: v.kind, size: v.size || null, condition: v.condition, notes: v.notes || null, updated_at: new Date().toISOString() };
    if (id) {
      const cur = (await db.from('vestments').select('status').eq('id', id).maybeSingle().then(check)) as { status: VestmentStatus } | null;
      if (!cur) throw new Error('This vestment was not found');
      // While it is out, its status follows the loan
      const { error } = await db.from('vestments').update(cur.status === 'OUT' ? fields : { ...fields, status: v.status }).eq('id', id);
      if (error) throw new Error(error.code === '23505' ? `The code ${v.code} is already used` : error.message);
    } else {
      const { error } = await db.from('vestments').insert({ ...fields, status: v.status, created_by: me.systemUser.id });
      if (error) throw new Error(error.code === '23505' ? `The code ${v.code} is already used` : error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

const BatchSchema = z.object({
  prefix: z.string().trim().toUpperCase().max(20),
  from: z.number().int().min(0).max(99_999),
  count: z.number().int().min(1, 'Add at least one').max(300, 'Add at most 300 at a time'),
  kind: z.string().trim().min(2, 'What kind of vestment is it?').max(80),
  size: z.string().trim().max(20),
});

export type VestmentBatchInput = z.input<typeof BatchSchema>;

/** Register several of the same kind at once: KB-001 … KB-020. */
export async function addVestments(input: VestmentBatchInput): Promise<ActionResult & { added?: number }> {
  try {
    const { me, db } = await authorize('CHOIR_MANAGE');
    const b = BatchSchema.parse(input);
    const width = Math.max(3, String(b.from + b.count - 1).length);
    const codes = Array.from({ length: b.count }, (_, i) => `${b.prefix}${String(b.from + i).padStart(width, '0')}`);
    const taken = (await db.from('vestments').select('code').in('code', codes).then(check)) as { code: string }[];
    if (taken.length) throw new Error(`Already used: ${taken.map((t) => t.code).slice(0, 10).join(', ')}${taken.length > 10 ? '…' : ''}`);
    await db.from('vestments')
      .insert(codes.map((code) => ({ code, kind: b.kind, size: b.size || null, condition: 'GOOD', status: 'AVAILABLE', created_by: me.systemUser.id })))
      .then(check);
    return { ok: true, added: codes.length };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

const IssueSchema = z
  .array(z.object({ vestment_id: z.string().min(1), person_id: z.string().min(1), session_id: z.string(), due_on: isoDate }))
  .min(1, 'Choose a vestment for at least one person')
  .max(200)
  .refine((list) => new Set(list.map((x) => x.vestment_id)).size === list.length, 'The same vestment is chosen twice');

export type IssueInput = z.input<typeof IssueSchema>;

/** Give vestments out: each must be in the store; the person is told in the bot. */
export async function issueVestments(input: IssueInput): Promise<ActionResult & { issued?: number }> {
  try {
    const { me, db } = await authorize('CHOIR_MANAGE');
    const list = IssueSchema.parse(input);
    const now = today();
    if (list.some((x) => x.due_on < now)) throw new Error('The return day cannot be in the past');
    const vestments = (await db.from('vestments').select('id, code, kind, size, status').in('id', list.map((x) => x.vestment_id)).then(check)) as {
      id: string; code: string; kind: string; size: string | null; status: VestmentStatus;
    }[];
    const byId = new Map(vestments.map((v) => [v.id, v]));
    const busy = list.map((x) => byId.get(x.vestment_id)).filter((v) => !v || v.status !== 'AVAILABLE');
    if (busy.length) throw new Error(`Not in the store: ${busy.map((v) => v?.code ?? '?').join(', ')}`);
    const sessionIds = [...new Set(list.map((x) => x.session_id).filter(Boolean))];
    const sessions = sessionIds.length
      ? ((await db.from('choir_sessions').select('id, title, kind').in('id', sessionIds).then(check)) as { id: string; title: string | null; kind: string }[])
      : [];
    const titleOf = new Map(sessions.map((s) => [s.id, sessionTitle(s)]));

    const told: { personId: string; html: string }[] = [];
    for (const x of list) {
      const { error } = await db.from('vestment_loans').insert({
        vestment_id: x.vestment_id,
        person_id: x.person_id,
        session_id: x.session_id || null,
        due_on: x.due_on,
        issued_by: me.systemUser.id,
      });
      // The open-loan index stops two people getting the same vestment at once
      if (error) throw new Error(error.code === '23505' ? `${byId.get(x.vestment_id)!.code} was just given to someone else` : error.message);
      await db.from('vestments').update({ status: 'OUT', updated_at: new Date().toISOString() }).eq('id', x.vestment_id).then(check);
      told.push({ personId: x.person_id, html: vestmentIssuedText(vestmentLabel(byId.get(x.vestment_id)!), x.due_on, titleOf.get(x.session_id) ?? '') });
    }
    telegramLater(async (bg) => {
      for (const t of told) await telegramToPersons(bg, [t.personId], t.html, 'SELF');
    });
    return { ok: true, issued: list.length };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Received back. Damaged → it goes for repair; lost → marked lost. */
export async function returnVestment(loanId: string, condition: VestmentCondition | 'LOST', note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('CHOIR_MANAGE');
    const c = z.enum(['GOOD', 'WORN', 'DAMAGED', 'LOST']).parse(condition);
    const loan = (await db.from('vestment_loans').select('id, vestment_id, returned_at').eq('id', z.string().min(1).parse(loanId)).maybeSingle().then(check)) as {
      id: string; vestment_id: string; returned_at: string | null;
    } | null;
    if (!loan) throw new Error('This record was not found');
    if (loan.returned_at) throw new Error('Already received back');
    await db.from('vestment_loans')
      .update({ returned_at: new Date().toISOString(), received_by: me.systemUser.id, return_condition: c, notes: note.trim().slice(0, 500) || null })
      .eq('id', loan.id)
      .is('returned_at', null)
      .then(check);
    await db.from('vestments')
      .update({
        status: c === 'LOST' ? 'LOST' : c === 'DAMAGED' ? 'REPAIR' : 'AVAILABLE',
        ...(c === 'LOST' ? {} : { condition: c }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', loan.vestment_id)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Remind everyone holding a vestment past its return day (one message each). */
export async function remindOverdue(): Promise<ActionResult & { people?: number }> {
  try {
    const { db } = await authorize('CHOIR_MANAGE');
    const rows = (await db.from('vestment_loans')
      .select('id, person_id, due_on, vestment:vestments(code, kind, size)')
      .is('returned_at', null)
      .lt('due_on', today())
      .then(check)) as unknown as { id: string; person_id: string; due_on: string; vestment: { code: string; kind: string; size: string | null } | null }[];
    if (rows.length === 0) throw new Error('Nothing is overdue');
    const byPerson = new Map<string, { vestment: string; due_on: string }[]>();
    for (const r of rows) byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), { vestment: r.vestment ? vestmentLabel(r.vestment) : '—', due_on: r.due_on }]);
    await db.from('vestment_loans').update({ reminded_at: new Date().toISOString() }).in('id', rows.map((r) => r.id)).then(check);
    telegramLater(async (bg) => {
      for (const [personId, items] of byPerson) await telegramToPersons(bg, [personId], vestmentReminderText(items), 'SELF');
    });
    return { ok: true, people: byPerson.size };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

