'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Organization units (departments & coordinations): who leads them, who is
// assigned, budget use and open payment requests. Adding / editing units
// needs GOVERNANCE_MANAGE; codes are fixed once created (they form the path).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { computeBudget, loadYears } from '@/lib/finance/budget';
import { HEAD_ROLE, type StructureView, type UnitKind, type UnitPerson, type UnitSummary } from '@/lib/organization/types';

type Db = Awaited<ReturnType<typeof authorize>>['db'];
type AssignmentRow = {
  organization_unit_id: string;
  role: { code: string; name_en: string; name_am: string } | null;
  user: { is_active: boolean; person: { full_name_en: string; full_name_am: string | null; phone_primary: string | null } | null } | null;
};

async function summarize(db: Db, kind: UnitKind, canFinance: boolean, includeInactive: boolean): Promise<UnitSummary[]> {
  let q = db.from('organization_units')
    .select('id, code, name_en, name_am, description_en, description_am, is_active, sort_order')
    .eq('unit_type', kind)
    .order('sort_order');
  if (!includeInactive) q = q.eq('is_active', true);
  const units = (await q.then(check)) as Omit<UnitSummary, 'heads' | 'people' | 'budget' | 'openRequests'>[];
  if (units.length === 0) return [];
  const ids = units.map((u) => u.id);

  const assignments = (await db.from('user_unit_assignments')
    .select('organization_unit_id, role:roles(code, name_en, name_am), user:system_users!user_unit_assignments_system_user_id_fkey(is_active, person:persons!system_users_person_id_fkey(full_name_en, full_name_am, phone_primary))')
    .eq('is_active', true)
    .in('organization_unit_id', ids)
    .then(check)) as unknown as AssignmentRow[];

  const peopleOf = (unitId: string): UnitPerson[] =>
    assignments
      .filter((a) => a.organization_unit_id === unitId && a.user?.is_active && a.user.person)
      .map((a) => ({
        name: a.user!.person!.full_name_en,
        name_am: a.user!.person!.full_name_am || a.user!.person!.full_name_en,
        phone: a.user!.person!.phone_primary ?? '',
        role: a.role?.name_en ?? '',
        role_am: a.role?.name_am ?? '',
        role_code: a.role?.code ?? '',
      }));

  let budgetOf: (id: string) => UnitSummary['budget'] = () => null;
  let openOf: (id: string) => number | null = () => null;
  if (canFinance) {
    try {
      const year = (await loadYears(db)).find((y) => y.is_current);
      if (year) {
        const lines = await computeBudget(db, year, ids);
        budgetOf = (id) => {
          const l = lines.find((x) => x.unit_id === id);
          return l ? { year: year.name, allocated: l.allocated, used: l.spent + l.committed } : null;
        };
      }
      const open = (await db.from('finance_requests')
        .select('organization_unit_id')
        .in('status', ['PENDING', 'APPROVED'])
        .in('organization_unit_id', ids)
        .then(check)) as { organization_unit_id: string }[];
      openOf = (id) => open.filter((r) => r.organization_unit_id === id).length;
    } catch {
      // finance tables not set up yet
    }
  }

  return units.map((u) => {
    const people = peopleOf(u.id);
    return {
      ...u,
      name_am: u.name_am || u.name_en,
      description_en: u.description_en ?? '',
      description_am: u.description_am ?? '',
      heads: people.filter((p) => p.role_code === HEAD_ROLE[kind]),
      people,
      budget: budgetOf(u.id),
      openRequests: openOf(u.id),
    };
  });
}

export async function loadUnits(kind: UnitKind): Promise<Loaded<UnitSummary[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('GOVERNANCE_VIEW', 'AUDIT_VIEW_ALL');
    const canFinance = me.permissions.includes('FINANCE_VIEW');
    const canManage = me.permissions.includes('GOVERNANCE_MANAGE');
    return { mode: 'live', data: await summarize(db, kind, canFinance, canManage) };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

export async function loadStructure(): Promise<Loaded<StructureView>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('GOVERNANCE_VIEW', 'AUDIT_VIEW_ALL');
    const [coordinations, departments, bodies, rules, members] = await Promise.all([
      summarize(db, 'COORDINATION', false, false),
      summarize(db, 'DEPARTMENT', false, false),
      db.from('governance_bodies').select('id, unit:organization_units(code)').then(check) as Promise<unknown> as Promise<
        { id: string; unit: { code: string } | null }[]
      >,
      db.from('governance_body_rules').select('body_id, rule_value').eq('rule_code', 'EXACT_MEMBER_COUNT').eq('is_enforced', true).then(check) as Promise<
        { body_id: string; rule_value: string }[]
      >,
      db.from('governance_memberships').select('body_id').eq('status', 'ACTIVE').then(check) as Promise<{ body_id: string }[]>,
    ]);
    const byCode: StructureView['bodies'] = {};
    for (const b of bodies) {
      if (!b.unit?.code) continue;
      const rule = rules.find((r) => r.body_id === b.id);
      byCode[b.unit.code] = {
        active: members.filter((m) => m.body_id === b.id).length,
        seats: rule ? Number(rule.rule_value) : null,
      };
    }
    return { mode: 'live', data: { coordinations, departments, bodies: byCode } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const UnitSchema = z.object({
  name_en: z.string().trim().min(3, 'Enter the name in English'),
  name_am: z.string().trim(),
  description_en: z.string().trim(),
  description_am: z.string().trim(),
});

const CodeSchema = z
  .string()
  .trim()
  .transform((c) => c.toUpperCase().replace(/[\s-]+/g, '_'))
  .refine((c) => /^[A-Z][A-Z0-9_]{2,40}$/.test(c), 'Code must be 3–40 letters, digits or underscores, e.g. DEPT_MEDIA');

export async function createUnit(kind: UnitKind, input: z.input<typeof UnitSchema> & { code: string }): Promise<ActionResult> {
  try {
    const { db } = await authorize('GOVERNANCE_MANAGE');
    if (kind !== 'DEPARTMENT' && kind !== 'COORDINATION') throw new Error('Invalid unit type');
    const u = UnitSchema.parse(input);
    const code = CodeSchema.parse(input.code);

    // Departments and coordinations sit under the Executive Committee.
    const parent = (await db.from('organization_units').select('id, ltree_path').eq('code', 'EXECUTIVE_COMMITTEE').single().then(check)) as {
      id: string; ltree_path: string;
    };
    const last = (await db.from('organization_units')
      .select('sort_order')
      .eq('unit_type', kind)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(check)) as { sort_order: number } | null;

    const { error } = await db.from('organization_units').insert({
      code,
      name_en: u.name_en,
      name_am: u.name_am || u.name_en,
      unit_type: kind,
      parent_id: parent.id,
      ltree_path: `${parent.ltree_path}.${code.toLowerCase()}`,
      description_en: u.description_en || null,
      description_am: u.description_am || null,
      is_active: true,
      sort_order: (last?.sort_order ?? (kind === 'DEPARTMENT' ? 19 : 9)) + 1,
    });
    if (error) throw new Error(error.code === '23505' ? `The code ${code} is already used` : error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateUnit(id: string, input: z.input<typeof UnitSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorize('GOVERNANCE_MANAGE');
    const u = UnitSchema.parse(input);
    await db.from('organization_units')
      .update({
        name_en: u.name_en,
        name_am: u.name_am || u.name_en,
        description_en: u.description_en || null,
        description_am: u.description_am || null,
      })
      .eq('id', id)
      .in('unit_type', ['DEPARTMENT', 'COORDINATION'])
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setUnitActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { db } = await authorize('GOVERNANCE_MANAGE');
    await db.from('organization_units').update({ is_active: active }).eq('id', id).in('unit_type', ['DEPARTMENT', 'COORDINATION']).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
