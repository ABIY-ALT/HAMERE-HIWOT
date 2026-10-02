'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Choir & sacred arts: roster, hymn library, rehearsals / services with their
// hymns and attendance. View: MEMBER_VIEW or CHOIR_MANAGE. Change: CHOIR_MANAGE.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type { AttendanceStatus } from '@/lib/attendance/store';
import {
  INSTRUMENTS,
  type ChoirData,
  type ChoirMember,
  type ChoirSession,
  type Hymn,
  type HymnCategory,
  type SessionKind,
  type SessionStatus,
  type VoicePart,
} from '@/lib/choir/types';

type Row = Record<string, unknown> & { id: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const optionalDate = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date');

export async function loadChoir(): Promise<Loaded<ChoirData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('MEMBER_VIEW', 'CHOIR_MANAGE', 'AUDIT_VIEW_ALL');
    const [memberRows, hymnRows, sessionRows, persons, students, vestments, programs] = await Promise.all([
      selectAll<Row>((a, b) =>
        db.from('choir_members')
          .select('*, person:persons(full_name_en, full_name_am, phone_primary), vestment:assets(tag, name_en)')
          .order('id')
          .range(a, b)
      ),
      selectAll<Row>((a, b) => db.from('hymns').select('*').order('title_am').order('id').range(a, b)),
      selectAll<Row>((a, b) =>
        db.from('choir_sessions')
          .select('*, program:programs(title_en), hymns:choir_session_hymns(hymn_id, position), marks:choir_attendance(member_id, status)')
          .order('session_date', { ascending: false })
          .order('id')
          .range(a, b)
      ),
      selectAll<{ id: string; full_name_en: string }>((a, b) =>
        db.from('persons').select('id, full_name_en').eq('status', 'ACTIVE').order('full_name_en').order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
      db.from('assets')
        .select('id, tag, name_en')
        .eq('category', 'Liturgical items & vestments')
        .not('status', 'in', '(DISPOSED,LOST)')
        .order('tag')
        .then(check) as Promise<{ id: string; tag: string; name_en: string }[]>,
      db.from('programs')
        .select('id, title_en, start_date')
        .neq('status', 'CANCELLED')
        .gte('start_date', new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
        .order('start_date')
        .then(check) as Promise<{ id: string; title_en: string; start_date: string }[]>,
    ]);

    const sessions: ChoirSession[] = sessionRows.map((s) => ({
      id: s.id,
      date: s.session_date as string,
      start_time: ((s.start_time as string) ?? '').slice(0, 5),
      kind: s.kind as SessionKind,
      title: (s.title as string) ?? '',
      location: (s.location as string) ?? '',
      program_id: (s.program_id as string) ?? null,
      program: ((s.program as { title_en?: string } | null)?.title_en) ?? '',
      lead_member_id: (s.lead_member_id as string) ?? null,
      lead: '',
      status: s.status as SessionStatus,
      notes: (s.notes as string) ?? '',
      hymn_ids: ((s.hymns ?? []) as { hymn_id: string; position: number }[]).sort((a, b) => a.position - b.position).map((h) => h.hymn_id),
      attendance: Object.fromEntries(((s.marks ?? []) as { member_id: string; status: AttendanceStatus }[]).map((m) => [m.member_id, m.status])),
    }));
    const held = sessions.filter((s) => s.status === 'HELD');

    const members: ChoirMember[] = memberRows.map((m) => {
      const p = (m.person ?? {}) as Record<string, string | null>;
      const v = m.vestment as { tag?: string; name_en?: string } | null;
      const mine = held.filter((s) => s.attendance[m.id]);
      return {
        id: m.id,
        person_id: m.person_id as string,
        name: p.full_name_en ?? '—',
        name_am: p.full_name_am || p.full_name_en || '—',
        phone: p.phone_primary ?? '',
        voice_part: m.voice_part as VoicePart,
        instruments: (m.instruments as string[]) ?? [],
        vestment_id: (m.vestment_asset_id as string) ?? null,
        vestment: v ? `${v.tag} · ${v.name_en}` : '',
        joined_on: (m.joined_on as string) ?? null,
        status: m.status as 'ACTIVE' | 'INACTIVE',
        notes: (m.notes as string) ?? '',
        attended: mine.filter((s) => s.attendance[m.id] === 'PRESENT' || s.attendance[m.id] === 'LATE').length,
        sessions: mine.filter((s) => s.attendance[m.id] !== 'EXCUSED').length,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    for (const s of sessions) s.lead = s.lead_member_id ? nameOf.get(s.lead_member_id) ?? '' : '';

    const hymns: Hymn[] = hymnRows.map((h) => {
      const sung = held.filter((s) => s.hymn_ids.includes(h.id)).map((s) => s.date).sort();
      return {
        id: h.id,
        title_am: h.title_am as string,
        title_en: (h.title_en as string) ?? '',
        category: h.category as HymnCategory,
        feast: (h.feast as string) ?? '',
        lyrics: (h.lyrics as string) ?? '',
        notes: (h.notes as string) ?? '',
        is_active: Boolean(h.is_active),
        times_sung: sung.length,
        last_sung: sung.at(-1) ?? null,
      };
    });

    const inChoir = new Set(members.map((m) => m.person_id));
    const studentPersons = new Set(students.map((s) => s.person_id));
    return {
      mode: 'live',
      data: {
        members,
        hymns,
        sessions,
        candidates: persons.filter((p) => !inChoir.has(p.id) && !studentPersons.has(p.id)).map((p) => ({ id: p.id, name: p.full_name_en })),
        vestments: vestments.map((v) => ({ id: v.id, label: `${v.tag} · ${v.name_en}` })),
        programs: programs.map((p) => ({ id: p.id, label: `${p.start_date} · ${p.title_en}` })),
      },
    };
  } catch (e) {
    const msg = errorMessage(e);
    return { mode: 'error', error: msg.includes('choir') || msg.includes('hymns') ? 'Run database migration 015 (choir) first' : msg };
  }
}

// ── Roster ───────────────────────────────────────────────────────────────────

const MemberSchema = z.object({
  person_id: z.string(),
  voice_part: z.enum(['SOPRANO', 'ALTO', 'TENOR', 'BASS', 'NOT_SET']),
  instruments: z.array(z.string()).refine((list) => list.every((i) => i in INSTRUMENTS), 'Unknown instrument'),
  vestment_id: z.string(),
  joined_on: optionalDate,
  status: z.enum(['ACTIVE', 'INACTIVE']),
  notes: z.string().trim(),
});

export type ChoirMemberInput = z.input<typeof MemberSchema>;

export async function saveChoirMember(id: string | null, input: ChoirMemberInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('CHOIR_MANAGE');
    const m = MemberSchema.parse(input);
    const fields = {
      voice_part: m.voice_part,
      instruments: m.instruments,
      vestment_asset_id: m.vestment_id || null,
      joined_on: m.joined_on || null,
      status: m.status,
      notes: m.notes || null,
    };
    if (id) {
      await db.from('choir_members').update(fields).eq('id', id).then(check);
    } else {
      if (!m.person_id) throw new Error('Choose the member who joins the choir');
      const { error } = await db.from('choir_members').insert({ ...fields, person_id: m.person_id });
      if (error) throw new Error(error.code === '23505' ? 'This person is already in the choir' : error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Hymn library ─────────────────────────────────────────────────────────────

const HymnSchema = z.object({
  title_am: z.string().trim().min(2, 'Enter the hymn title in Amharic'),
  title_en: z.string().trim(),
  category: z.enum(['KIDASE', 'MEZMUR', 'WEDASE', 'KINE', 'ZEMA', 'OTHER']),
  feast: z.string().trim(),
  lyrics: z.string().trim(),
  notes: z.string().trim(),
  is_active: z.boolean(),
});

export type HymnInput = z.input<typeof HymnSchema>;

export async function saveHymn(id: string | null, input: HymnInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('CHOIR_MANAGE');
    const h = HymnSchema.parse(input);
    const fields = {
      title_am: h.title_am,
      title_en: h.title_en || null,
      category: h.category,
      feast: h.feast || null,
      lyrics: h.lyrics || null,
      notes: h.notes || null,
      is_active: h.is_active,
    };
    if (id) await db.from('hymns').update(fields).eq('id', id).then(check);
    else await db.from('hymns').insert(fields).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Sessions & attendance ────────────────────────────────────────────────────

const SessionSchema = z.object({
  date: isoDate,
  start_time: z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Use a valid time'),
  kind: z.enum(['REHEARSAL', 'SERVICE', 'PERFORMANCE']),
  title: z.string().trim(),
  location: z.string().trim(),
  program_id: z.string(),
  lead_member_id: z.string(),
  notes: z.string().trim(),
  hymn_ids: z.array(z.string()).max(40),
});

export type ChoirSessionInput = z.input<typeof SessionSchema>;

export async function saveChoirSession(id: string | null, input: ChoirSessionInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('CHOIR_MANAGE');
    const s = SessionSchema.parse(input);
    const fields = {
      session_date: s.date,
      start_time: s.start_time || null,
      kind: s.kind,
      title: s.title || null,
      location: s.location || null,
      program_id: s.program_id || null,
      lead_member_id: s.lead_member_id || null,
      notes: s.notes || null,
    };
    let sessionId = id;
    if (id) {
      await db.from('choir_sessions').update(fields).eq('id', id).then(check);
    } else {
      const row = (await db.from('choir_sessions')
        .insert({ ...fields, status: 'PLANNED', created_by: me.systemUser.id })
        .select('id')
        .single()
        .then(check)) as { id: string };
      sessionId = row.id;
    }
    // Replace the planned hymn list
    await db.from('choir_session_hymns').delete().eq('session_id', sessionId).then(check);
    const unique = [...new Set(s.hymn_ids)];
    if (unique.length) {
      await db.from('choir_session_hymns')
        .insert(unique.map((hymn_id, i) => ({ session_id: sessionId, hymn_id, position: i + 1 })))
        .then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const MarksSchema = z.record(z.string(), z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']));

/** Save choir attendance; the session counts as held. */
export async function saveChoirAttendance(sessionId: string, marks: Record<string, AttendanceStatus>): Promise<ActionResult> {
  try {
    const { db } = await authorize('CHOIR_MANAGE');
    const m = MarksSchema.parse(marks);
    const ids = Object.keys(m);
    if (ids.length === 0) throw new Error('Mark at least one member');
    await db.from('choir_attendance')
      .upsert(ids.map((member_id) => ({ session_id: sessionId, member_id, status: m[member_id] })), { onConflict: 'session_id,member_id' })
      .then(check);
    await db.from('choir_attendance').delete().eq('session_id', sessionId).not('member_id', 'in', `(${ids.join(',')})`).then(check);
    await db.from('choir_sessions').update({ status: 'HELD' }).eq('id', sessionId).neq('status', 'HELD').then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function cancelChoirSession(sessionId: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('CHOIR_MANAGE');
    await db.from('choir_sessions').update({ status: 'CANCELLED' }).eq('id', sessionId).eq('status', 'PLANNED').then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
