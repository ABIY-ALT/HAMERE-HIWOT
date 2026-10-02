'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Governance server actions — appointments to statutory bodies.
// Rules (also enforced by a database trigger, migration 010):
//   • a body with an EXACT_MEMBER_COUNT rule has that many seats;
//   • Chairperson / Vice Chair / Secretary / Treasurer: one holder per body;
//   • a person holds at most one active seat per body.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import {
  SINGLE_HOLDER_POSITIONS,
  type GovBodyView,
  type GovCandidate,
  type GovMembership,
  type GovPosition,
  type MembershipStatus,
} from '@/lib/governance/types';

type Row = Record<string, unknown> & { id: string };
type Db = Awaited<ReturnType<typeof authorize>>['db'];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

/** Turn database rule violations into readable messages. */
function friendly(e: unknown): string {
  const msg = errorMessage(e);
  if (msg.includes('GOVERNANCE_SEAT_LIMIT')) return 'All seats of this body are filled. End a member’s term before appointing someone new.';
  if (msg.includes('GOVERNANCE_POSITION_TAKEN')) return 'Someone already holds this position in this body. End their term first.';
  if (msg.includes('uq_active_gov_membership')) return 'This person is already an active member of this body.';
  return msg;
}

async function bodyRule(db: Db, bodyId: string) {
  const rule = (await db.from('governance_body_rules')
    .select('rule_value, description_en, description_am, is_enforced')
    .eq('body_id', bodyId)
    .eq('rule_code', 'EXACT_MEMBER_COUNT')
    .maybeSingle()
    .then(check)) as { rule_value: string; description_en: string; description_am: string; is_enforced: boolean } | null;
  return rule;
}

export async function loadGovernanceBody(unitCode: string): Promise<Loaded<GovBodyView>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('GOVERNANCE_VIEW', 'AUDIT_VIEW_ALL');

    const unit = (await db.from('organization_units').select('id').eq('code', unitCode).maybeSingle().then(check)) as {
      id: string;
    } | null;
    const body = unit
      ? ((await db.from('governance_bodies')
          .select('id, name_en, name_am, description_en, description_am')
          .eq('organization_unit_id', unit.id)
          .maybeSingle()
          .then(check)) as GovBodyView['body'])
      : null;

    const positions = (await db.from('governance_positions')
      .select('id, code, name_en, name_am, authority_level')
      .eq('is_active', true)
      .order('authority_level')
      .order('code')
      .then(check)) as GovPosition[];

    if (!body) {
      return {
        mode: 'live',
        data: { body: null, seatLimit: null, ruleText_en: '', ruleText_am: '', positions, memberships: [], candidates: [] },
      };
    }

    const [rule, rows, persons, students] = await Promise.all([
      bodyRule(db, body.id),
      selectAll<Row>((a, b) =>
        db.from('governance_memberships')
          .select('*, person:persons!governance_memberships_person_id_fkey(full_name_en, full_name_am, membership_code, phone_primary), position:governance_positions(code, name_en, name_am, authority_level), appointer:persons!governance_memberships_appointed_by_fkey(full_name_en)')
          .eq('body_id', body.id)
          .order('term_start', { ascending: false })
          .order('id')
          .range(a, b)
      ),
      selectAll<{ id: string; full_name_en: string; full_name_am: string | null; membership_code: string }>((a, b) =>
        db.from('persons').select('id, full_name_en, full_name_am, membership_code').eq('status', 'ACTIVE').order('full_name_en').order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
    ]);

    const memberships: GovMembership[] = rows.map((m) => {
      const p = (m.person ?? {}) as Record<string, string | null>;
      const pos = (m.position ?? {}) as Record<string, string | number | null>;
      return {
        id: m.id,
        person_id: m.person_id as string,
        person: p.full_name_en ?? '—',
        person_am: p.full_name_am || p.full_name_en || '—',
        member_code: p.membership_code ?? '',
        phone: p.phone_primary ?? '',
        position_id: m.position_id as string,
        position: (pos.name_en as string) ?? '—',
        position_am: (pos.name_am as string) ?? '—',
        position_code: (pos.code as string) ?? '',
        authority_level: Number(pos.authority_level ?? 9),
        appointment_date: m.appointment_date as string,
        term_start: m.term_start as string,
        term_end: (m.term_end as string) ?? null,
        status: m.status as MembershipStatus,
        appointed_by: ((m.appointer as { full_name_en?: string } | null)?.full_name_en) ?? '',
        remarks: (m.remarks as string) ?? '',
      };
    });

    const studentPersons = new Set(students.map((s) => s.person_id));
    const candidates: GovCandidate[] = persons
      .filter((p) => !studentPersons.has(p.id))
      .map((p) => ({ id: p.id, name_en: p.full_name_en, name_am: p.full_name_am || p.full_name_en, code: p.membership_code }));

    return {
      mode: 'live',
      data: {
        body,
        seatLimit: rule?.is_enforced ? Number(rule.rule_value) || null : null,
        ruleText_en: rule?.description_en ?? '',
        ruleText_am: rule?.description_am ?? '',
        positions,
        memberships,
        candidates,
      },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

const AppointSchema = z
  .object({
    person_id: z.string().min(1, 'Choose a person'),
    position_id: z.string().min(1, 'Choose a position'),
    term_start: isoDate,
    term_end: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid end date'),
    remarks: z.string().trim(),
  })
  .refine((a) => !a.term_end || a.term_end > a.term_start, 'The term must end after it starts');

export async function appointMember(bodyId: string, input: z.input<typeof AppointSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('GOVERNANCE_MANAGE');
    const a = AppointSchema.parse(input);

    // Friendly pre-checks (the database enforces the same rules)
    const active = (await db.from('governance_memberships')
      .select('person_id, position_id')
      .eq('body_id', bodyId)
      .eq('status', 'ACTIVE')
      .then(check)) as { person_id: string; position_id: string }[];
    if (active.some((m) => m.person_id === a.person_id)) throw new Error('This person is already an active member of this body.');

    const rule = await bodyRule(db, bodyId);
    const limit = rule?.is_enforced ? Number(rule.rule_value) : NaN;
    if (Number.isFinite(limit) && active.length >= limit) {
      throw new Error(`All ${limit} seats of this body are filled. End a member’s term before appointing someone new.`);
    }

    const position = (await db.from('governance_positions').select('code, name_en').eq('id', a.position_id).single().then(check)) as {
      code: string; name_en: string;
    };
    if (SINGLE_HOLDER_POSITIONS.includes(position.code) && active.some((m) => m.position_id === a.position_id)) {
      throw new Error(`This body already has an active ${position.name_en}. End their term first.`);
    }

    await db.from('governance_memberships')
      .insert({
        body_id: bodyId,
        person_id: a.person_id,
        position_id: a.position_id,
        appointment_date: new Date().toISOString().slice(0, 10),
        term_start: a.term_start,
        term_end: a.term_end || null,
        status: 'ACTIVE',
        appointed_by: me.person.id,
        remarks: a.remarks || null,
      })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

const EndSchema = z.object({
  status: z.enum(['INACTIVE', 'EXPIRED', 'RESIGNED', 'REMOVED']),
  end_date: isoDate,
  remarks: z.string().trim(),
});

/** End an active appointment (term over, resigned, removed…). History is kept. */
export async function endMembership(membershipId: string, input: z.input<typeof EndSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorize('GOVERNANCE_MANAGE');
    const e = EndSchema.parse(input);
    const row = (await db.from('governance_memberships').select('status, remarks, term_start').eq('id', membershipId).single().then(check)) as {
      status: MembershipStatus; remarks: string | null; term_start: string;
    };
    if (row.status !== 'ACTIVE') throw new Error('This appointment has already ended.');
    if (e.end_date < row.term_start) throw new Error('The end date cannot be before the term started.');
    const remarks = [row.remarks, e.remarks].filter(Boolean).join(' — ') || null;
    await db.from('governance_memberships')
      .update({ status: e.status, term_end: e.end_date, remarks })
      .eq('id', membershipId)
      .eq('status', 'ACTIVE')
      .then(check);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
