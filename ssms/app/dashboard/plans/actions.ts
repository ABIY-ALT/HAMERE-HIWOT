'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Department plans (migration 032). A department writes its plan for the year
// (activities, targets, quarters, budget), sends it for approval, and once it
// is approved reports progress on each activity. Same people as Tasks:
//   TASK_REPORT     their own units (user_unit_assignments): write, send, report
//   TASK_ASSIGN     every unit: write too, approve / return, remind
//   AUDIT_VIEW_ALL  read everything
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import { notifyLater } from '@/lib/push/send';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import {
  ACTIVITY_STATES,
  nowQuarter,
  type ActivityState,
  type PlanActivity,
  type PlanStatus,
  type PlanUnit,
  type PlansData,
  type PlanUpdate,
  type UnitPlan,
} from '@/lib/plans/types';

type Row = Record<string, unknown>;
type Db = Awaited<ReturnType<typeof authorize>>['db'];

const MIGRATION = 'Run database migration 032 (department plans) first';
const missing = (m: string) => (/unit_plans|plan_activities|plan_updates/.test(m) ? MIGRATION : m);
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const seesAll = (me: SessionUser) => me.permissions.includes('TASK_ASSIGN') || me.permissions.includes('AUDIT_VIEW_ALL');
/** May write this unit's plan and report on it */
const canEdit = (me: SessionUser, unitId: string) =>
  me.permissions.includes('TASK_ASSIGN') || (me.permissions.includes('TASK_REPORT') && me.organizationIds.includes(unitId));
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const yearOk = (y: number) => z.number().int().min(1900).max(2200).parse(y);

async function names(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await db.from('system_users').select('id, person:persons!system_users_person_id_fkey(full_name_en, full_name_am)').in('id', ids);
  return new Map(
    ((data ?? []) as Row[]).map((u) => {
      const p = (Array.isArray(u.person) ? u.person[0] : u.person) as { full_name_en?: string; full_name_am?: string | null } | null;
      return [u.id as string, p?.full_name_am || p?.full_name_en || ''];
    })
  );
}

export async function loadPlans(year?: number): Promise<Loaded<PlansData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('TASK_ASSIGN', 'TASK_REPORT', 'AUDIT_VIEW_ALL');
    const now = nowQuarter();
    const y = year && year > 1900 && year < 2200 ? Math.trunc(year) : now.year;
    const unitRows = (await db.from('organization_units')
      .select('id, name_en, name_am, unit_type')
      .eq('is_active', true)
      .in('unit_type', ['DEPARTMENT', 'COORDINATION', 'SUB_COMMITTEE', 'EXECUTIVE_SECRETARIAT', 'MANAGEMENT_SECRETARIAT'])
      .order('sort_order')
      .then(check)) as Row[];
    const mine = me.organizationIds.filter(isUuid);
    const units: PlanUnit[] = unitRows
      .filter((u) => seesAll(me) || mine.includes(u.id as string))
      .map((u) => ({ id: u.id as string, name_en: u.name_en as string, name_am: (u.name_am as string) || (u.name_en as string) }));
    const unitIds = units.map((u) => u.id);

    const planRows = unitIds.length
      ? await selectAll<Row>((a, b) => db.from('unit_plans').select('*').eq('year', y).in('unit_id', unitIds).order('id').range(a, b))
      : [];
    const planIds = planRows.map((p) => p.id as string);
    const activityRows = planIds.length
      ? await selectAll<Row>((a, b) => db.from('plan_activities').select('*').in('plan_id', planIds).order('position').order('created_at').range(a, b))
      : [];
    const activityIds = activityRows.map((a) => a.id as string);
    const updateRows = activityIds.length
      ? await selectAll<Row>((a, b) => db.from('plan_updates').select('*').in('activity_id', activityIds).order('created_at', { ascending: false }).range(a, b))
      : [];
    const who = await names(db, [...planRows.map((p) => p.reviewed_by as string), ...updateRows.map((u) => u.author_id as string)]);

    const updatesOf = new Map<string, PlanUpdate[]>();
    for (const u of updateRows) {
      const list = updatesOf.get(u.activity_id as string) ?? [];
      list.push({
        id: u.id as string,
        quarter: Number(u.quarter),
        progress: Number(u.progress),
        achieved: num(u.achieved),
        state: u.state as ActivityState,
        note: (u.note as string) ?? '',
        author: who.get(u.author_id as string) ?? '',
        created_at: u.created_at as string,
      });
      updatesOf.set(u.activity_id as string, list);
    }
    const activitiesOf = new Map<string, PlanActivity[]>();
    for (const a of activityRows) {
      const list = activitiesOf.get(a.plan_id as string) ?? [];
      list.push({
        id: a.id as string,
        position: Number(a.position),
        title: a.title as string,
        measure: (a.measure as string) ?? '',
        target: num(a.target),
        quarters: ((a.quarters as number[]) ?? []).map(Number).sort(),
        budget: num(a.budget),
        responsible: (a.responsible as string) ?? '',
        achieved: num(a.achieved),
        progress: Number(a.progress ?? 0),
        state: (a.state as ActivityState) ?? 'NOT_STARTED',
        updates: (updatesOf.get(a.id as string) ?? []).sort((x, y) => y.created_at.localeCompare(x.created_at)),
      });
      activitiesOf.set(a.plan_id as string, list);
    }
    const plans: UnitPlan[] = planRows.map((p) => ({
      id: p.id as string,
      unit_id: p.unit_id as string,
      year: Number(p.year),
      goal: (p.goal as string) ?? '',
      status: p.status as PlanStatus,
      review_note: (p.review_note as string) ?? '',
      submitted_at: (p.submitted_at as string) ?? null,
      reviewed_at: (p.reviewed_at as string) ?? null,
      reviewer: who.get(p.reviewed_by as string) ?? '',
      activities: activitiesOf.get(p.id as string) ?? [],
    }));

    return {
      mode: 'live',
      data: {
        year: y,
        current_year: now.year,
        current_quarter: now.quarter,
        units,
        plans,
        editable_units: unitIds.filter((id) => canEdit(me, id)),
        can_review: me.permissions.includes('TASK_ASSIGN'),
      },
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

/** The plan and its unit, checked: this user may write it, and it is still open for changes when `open` is set. */
async function plan(db: Db, me: SessionUser, planId: string, open: boolean) {
  const p = (await db.from('unit_plans').select('id, unit_id, year, status').eq('id', z.string().min(1).parse(planId)).maybeSingle().then(check)) as
    | { id: string; unit_id: string; year: number; status: PlanStatus }
    | null;
  if (!p) throw new Error('This plan was not found — reload the page');
  if (!canEdit(me, p.unit_id)) throw new Error('You can only work on your own department’s plan');
  if (open && p.status !== 'DRAFT' && p.status !== 'RETURNED') {
    throw new Error(p.status === 'SUBMITTED' ? 'The plan is waiting for approval — it cannot be changed now' : 'The plan is approved — ask the Executive Committee to return it for changes');
  }
  return p;
}

/** Start (or change the main goal of) a unit's plan for a year. */
export async function savePlanGoal(unitId: string, year: number, goal: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('TASK_ASSIGN', 'TASK_REPORT');
    const unit = z.string().min(1).parse(unitId);
    if (!canEdit(me, unit)) throw new Error('You can only work on your own department’s plan');
    const y = yearOk(year);
    const text = z.string().trim().max(2000).parse(goal);
    const { data: found, error } = await db.from('unit_plans').select('id, status').eq('unit_id', unit).eq('year', y).maybeSingle();
    if (error) throw new Error(missing(error.message));
    if (found) {
      const p = await plan(db, me, (found as { id: string }).id, true);
      await db.from('unit_plans').update({ goal: text || null, updated_at: new Date().toISOString() }).eq('id', p.id).then(check);
      return { ok: true, id: p.id };
    }
    const row = (await db.from('unit_plans')
      .insert({ unit_id: unit, year: y, goal: text || null, status: 'DRAFT', created_by: me.systemUser.id })
      .select('id')
      .single()
      .then(check)) as { id: string };
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

const ActivitySchema = z.object({
  title: z.string().trim().min(2, 'Write what will be done').max(300),
  measure: z.string().trim().max(200),
  target: z.union([z.literal(''), z.coerce.number().min(0).max(1e9)]),
  quarters: z.array(z.number().int().min(1).max(4)).min(1, 'Choose at least one quarter').max(4),
  budget: z.union([z.literal(''), z.coerce.number().min(0, 'The budget cannot be negative').max(1e10)]),
  responsible: z.string().trim().max(200),
});

/** Add an activity, or change one (`activityId`), while the plan is a draft or returned. */
export async function saveActivity(planId: string, input: z.input<typeof ActivitySchema>, activityId?: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('TASK_ASSIGN', 'TASK_REPORT');
    const p = await plan(db, me, planId, true);
    const a = ActivitySchema.parse(input);
    const row = {
      title: a.title,
      measure: a.measure || null,
      target: a.target === '' ? null : a.target,
      quarters: [...new Set(a.quarters)].sort(),
      budget: a.budget === '' ? null : a.budget,
      responsible: a.responsible || null,
      updated_at: new Date().toISOString(),
    };
    if (activityId) {
      const { data } = await db.from('plan_activities').update(row).eq('id', activityId).eq('plan_id', p.id).select('id');
      if (!(data ?? []).length) throw new Error('This activity was not found — reload the page');
    } else {
      const { data: last } = await db.from('plan_activities').select('position').eq('plan_id', p.id).order('position', { ascending: false }).limit(1).maybeSingle();
      await db.from('plan_activities').insert({ ...row, plan_id: p.id, position: Number((last as { position?: number } | null)?.position ?? 0) + 1 }).then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

export async function deleteActivity(planId: string, activityId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('TASK_ASSIGN', 'TASK_REPORT');
    const p = await plan(db, me, planId, true);
    await db.from('plan_activities').delete().eq('id', activityId).eq('plan_id', p.id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/** Send the plan to the Executive Committee for approval. */
export async function submitPlan(planId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('TASK_ASSIGN', 'TASK_REPORT');
    const p = await plan(db, me, planId, true);
    const { data: acts } = await db.from('plan_activities').select('id').eq('plan_id', p.id);
    if (!(acts ?? []).length) throw new Error('Add at least one activity first');
    await db.from('unit_plans')
      .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .then(check);
    notifyLater(
      { permissions: ['TASK_ASSIGN'], except: me.systemUser.id },
      { title: 'ዓመታዊ እቅድ ቀርቧል · Plan sent for approval', body: `A department sent its ${p.year} plan for approval.`, url: '/dashboard/plans', tag: `plan-${p.id}` }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/**
 * Approve a sent plan, or return it with a note (also an approved plan, to let
 * the department change it). TASK_ASSIGN only.
 */
export async function reviewPlan(planId: string, decision: 'APPROVED' | 'RETURNED', note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('TASK_ASSIGN');
    const id = z.string().min(1).parse(planId);
    const why = z.string().trim().max(1000).parse(note ?? '');
    const p = (await db.from('unit_plans').select('id, unit_id, year, status').eq('id', id).maybeSingle().then(check)) as
      | { id: string; unit_id: string; year: number; status: PlanStatus }
      | null;
    if (!p) throw new Error('This plan was not found — reload the page');
    if (decision === 'APPROVED' && p.status !== 'SUBMITTED') throw new Error('Only a plan sent for approval can be approved');
    if (decision === 'RETURNED') {
      if (p.status !== 'SUBMITTED' && p.status !== 'APPROVED') throw new Error('This plan has not been sent yet');
      if (why.length < 3) throw new Error('Write what should be changed');
    }
    await db.from('unit_plans')
      .update({ status: decision, review_note: why || null, reviewed_by: me.systemUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .then(check);
    notifyLater(
      { units: { ids: [p.unit_id], holding: 'TASK_REPORT' } },
      decision === 'APPROVED'
        ? { title: 'እቅዳችሁ ጸድቋል · Your plan is approved', body: `The ${p.year} plan is approved. Report progress on each activity every quarter.`, url: '/dashboard/plans', tag: `plan-${p.id}` }
        : { title: 'እቅዳችሁ ለማስተካከያ ተመልሷል · Plan returned for changes', body: why, url: '/dashboard/plans', tag: `plan-${p.id}` }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

const ReportSchema = z.object({
  quarter: z.number().int().min(1).max(4),
  progress: z.coerce.number().int().min(0).max(100),
  achieved: z.union([z.literal(''), z.coerce.number().min(0).max(1e9)]),
  state: z.enum(ACTIVITY_STATES as [ActivityState, ...ActivityState[]]),
  note: z.string().trim().max(2000),
});

/** Progress on one activity of an approved plan. "Done" means 100 %. */
export async function reportActivity(activityId: string, input: z.input<typeof ReportSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('TASK_ASSIGN', 'TASK_REPORT');
    const r = ReportSchema.parse(input);
    const act = (await db.from('plan_activities').select('id, plan_id').eq('id', z.string().min(1).parse(activityId)).maybeSingle().then(check)) as
      | { id: string; plan_id: string }
      | null;
    if (!act) throw new Error('This activity was not found — reload the page');
    const p = await plan(db, me, act.plan_id, false);
    if (p.status !== 'APPROVED') throw new Error('Progress is reported once the plan is approved');
    const progress = r.state === 'DONE' ? 100 : r.progress;
    const achieved = r.achieved === '' ? null : r.achieved;
    await db.from('plan_updates')
      .insert({ activity_id: act.id, quarter: r.quarter, progress, achieved, state: r.state, note: r.note || null, author_id: me.systemUser.id })
      .then(check);
    await db.from('plan_activities')
      .update({ progress, state: r.state, ...(achieved !== null ? { achieved } : {}), updated_at: new Date().toISOString() })
      .eq('id', act.id)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

/**
 * Remind departments (push + Telegram): those with no plan sent yet for the
 * year, and those with activities this quarter but no progress reported in it.
 */
export async function remindPlans(year: number): Promise<{ ok: true; no_plan: number; no_report: number } | { ok: false; error: string }> {
  try {
    await authorize('TASK_ASSIGN');
    const y = yearOk(year);
    const res = await loadPlans(y);
    if (res.mode !== 'live') throw new Error(res.mode === 'error' ? res.error : 'Plans need the database');
    const { units, plans, current_quarter: q, current_year } = res.data;
    const planOf = new Map(plans.map((p) => [p.unit_id, p]));
    const noPlan = units.filter((u) => {
      const p = planOf.get(u.id);
      return !p || p.status === 'DRAFT' || p.status === 'RETURNED';
    });
    const noReport =
      y === current_year
        ? plans.filter(
            (p) =>
              p.status === 'APPROVED' &&
              p.activities.some((a) => a.quarters.includes(q) && a.state !== 'DONE' && a.state !== 'DROPPED' && !a.updates.some((u) => u.quarter === q))
          )
        : [];
    if (noPlan.length) {
      notifyLater(
        { units: { ids: noPlan.map((u) => u.id), holding: 'TASK_REPORT' } },
        { title: 'ዓመታዊ እቅድ · Yearly plan', body: `Please write your ${y} plan and send it for approval.`, url: '/dashboard/plans', tag: `plans-${y}` }
      );
    }
    if (noReport.length) {
      notifyLater(
        { units: { ids: noReport.map((p) => p.unit_id), holding: 'TASK_REPORT' } },
        { title: 'የሩብ ዓመት ሪፖርት · Quarterly progress', body: `Please report progress on this quarter’s activities (Q${q}).`, url: '/dashboard/plans', tag: `plans-${y}-q${q}` }
      );
    }
    return { ok: true, no_plan: noPlan.length, no_report: noReport.length };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}
