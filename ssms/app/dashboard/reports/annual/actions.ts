'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Annual report for the General Assembly (lib/reports/annual).
//   read        REPORT_VIEW, and each section that area's permission
//   write the message / highlights / challenges / next year
//               REPORT_VIEW and GOVERNANCE_MANAGE, SYSTEM_CONFIGURE or REPORT_EXPORT
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { education, finance, governance, membership, type Db } from '@/lib/reports/sections';
import type { ReportPeriod, ReportYear } from '@/lib/reports/types';
import { isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';
import { addDays, balanceSheet, fiscalYearStart, incomeStatement } from '@/lib/finance/gl';
import { DEFAULT_GL_SETTINGS, loadAccounts, postedLines, readGlSettings } from '@/lib/finance/gl-data';
import {
  ANNUAL_NOTES_KEY,
  EMPTY_NOTES,
  notesKey,
  type AnnualNotes,
  type AnnualReport,
  type GivingSection,
  type LibrarySection,
  type PlansSection,
  type ProgramsSection,
  type PropertySection,
  type ServiceSection,
} from '@/lib/reports/annual';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sum = (list: { amount: number | string | null }[]) => list.reduce((s, x) => s + Number(x.amount ?? 0), 0);
type UnitName = { name_en: string; name_am: string | null } | null;

const NOTE_EDITORS = ['GOVERNANCE_MANAGE', 'SYSTEM_CONFIGURE', 'REPORT_EXPORT'] as const;
const canEdit = (me: SessionUser) => NOTE_EDITORS.some((p) => me.permissions.includes(p));

// ── Sections ─────────────────────────────────────────────────────────────────

async function service(db: Db, period: ReportPeriod): Promise<ServiceSection> {
  const rows = (await selectAll<Record<string, unknown>>((a, b) =>
    db.from('service_assignments').select('person_id, status, start_date, unit:organization_units(name_en, name_am)').order('id').range(a, b)
  )) as unknown as { person_id: string; status: string; start_date: string; unit: UnitName }[];
  const active = rows.filter((r) => r.status === 'ACTIVE');
  const byUnit = new Map<string, { unit: string; unit_am: string; people: Set<string> }>();
  for (const r of active) {
    const key = r.unit?.name_en ?? '—';
    const row = byUnit.get(key) ?? { unit: key, unit_am: r.unit?.name_am || key, people: new Set<string>() };
    row.people.add(r.person_id);
    byUnit.set(key, row);
  }
  return {
    servants: new Set(active.map((r) => r.person_id)).size,
    newInPeriod: rows.filter((r) => r.start_date >= period.from && r.start_date <= period.to).length,
    byUnit: [...byUnit.values()].map((u) => ({ unit: u.unit, unit_am: u.unit_am, count: u.people.size })).sort((a, b) => b.count - a.count),
  };
}

async function plans(db: Db, ecYear: number): Promise<PlansSection> {
  const rows = (await db
    .from('unit_plans')
    .select('status, unit:organization_units(name_en, name_am), activities:plan_activities(state, progress, budget)')
    .eq('year', ecYear)
    .then(check)) as unknown as { status: string; unit: UnitName; activities: { state: string; progress: number; budget: number | null }[] }[];
  const avg = (list: { state: string; progress: number }[]) => {
    const live = list.filter((a) => a.state !== 'DROPPED');
    return live.length ? Math.round(live.reduce((s, a) => s + Number(a.progress), 0) / live.length) : null;
  };
  const units = rows
    .map((p) => ({
      unit: p.unit?.name_en ?? '—',
      unit_am: p.unit?.name_am || p.unit?.name_en || '—',
      status: p.status,
      activities: p.activities.length,
      done: p.activities.filter((a) => a.state === 'DONE').length,
      dropped: p.activities.filter((a) => a.state === 'DROPPED').length,
      progress: avg(p.activities),
      budget: p.activities.reduce((s, a) => s + Number(a.budget ?? 0), 0),
    }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
  const all = rows.flatMap((p) => p.activities);
  return { year: ecYear, units, activities: all.length, done: all.filter((a) => a.state === 'DONE').length, progress: avg(all) };
}

async function programs(db: Db, period: ReportPeriod): Promise<ProgramsSection> {
  const [rows, checkins] = await Promise.all([
    selectAll<{ title_en: string; title_am: string | null; program_type: string; start_date: string; status: string; actual_participants: number | null }>((a, b) =>
      db.from('programs')
        .select('title_en, title_am, program_type, start_date, status, actual_participants')
        .gte('start_date', period.from)
        .lte('start_date', period.to)
        .order('start_date')
        .order('id')
        .range(a, b)
    ),
    db.from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PRESENT')
      .gte('checked_at', `${period.from}T00:00:00Z`)
      .lte('checked_at', `${period.to}T23:59:59.999Z`)
      .then((r) => r.count ?? 0, () => 0),
  ]);
  const types = new Map<string, number>();
  for (const p of rows) types.set(p.program_type, (types.get(p.program_type) ?? 0) + 1);
  return {
    total: rows.length,
    completed: rows.filter((p) => p.status === 'COMPLETED').length,
    cancelled: rows.filter((p) => p.status === 'CANCELLED').length,
    participants: rows.reduce((s, p) => s + Number(p.actual_participants ?? 0), 0),
    checkins,
    byType: [...types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    list: rows
      .filter((p) => p.status !== 'CANCELLED')
      .map((p) => ({
        title: p.title_en,
        title_am: p.title_am || p.title_en,
        date: p.start_date,
        type: p.program_type,
        status: p.status,
        participants: p.actual_participants,
      })),
  };
}

async function library(db: Db, period: ReportPeriod): Promise<LibrarySection> {
  const [titles, copies, loans] = await Promise.all([
    db.from('library_books').select('id', { count: 'exact', head: true }).eq('is_active', true).then((r) => r.count ?? 0),
    db.from('library_copies').select('id', { count: 'exact', head: true }).then((r) => r.count ?? 0),
    selectAll<{ borrower_person_id: string }>((a, b) =>
      db.from('library_loans')
        .select('borrower_person_id')
        .gte('issued_at', `${period.from}T00:00:00Z`)
        .lte('issued_at', `${period.to}T23:59:59.999Z`)
        .order('id')
        .range(a, b)
    ),
  ]);
  return { titles, copies, loans: loans.length, readers: new Set(loans.map((l) => l.borrower_person_id)).size };
}

async function giving(db: Db, period: ReportPeriod): Promise<GivingSection> {
  const [dues, gifts, pledges] = await Promise.all([
    selectAll<{ person_id: string; amount: number }>((a, b) =>
      db.from('member_dues').select('person_id, amount').gte('paid_on', period.from).lte('paid_on', period.to).order('id').range(a, b)
    ).catch(() => []),
    selectAll<{ donation_type: string; amount: number }>((a, b) =>
      db.from('donations').select('donation_type, amount').eq('status', 'RECEIVED').gte('received_on', period.from).lte('received_on', period.to).order('id').range(a, b)
    ),
    selectAll<{ amount: number }>((a, b) => db.from('donations').select('amount').eq('status', 'PLEDGED').order('id').range(a, b)),
  ]);
  const money = gifts.filter((g) => g.donation_type !== 'IN_KIND');
  return {
    duesCollected: sum(dues),
    duesPayers: new Set(dues.map((d) => d.person_id)).size,
    donations: sum(money),
    donationCount: gifts.length,
    inKindValue: sum(gifts.filter((g) => g.donation_type === 'IN_KIND')),
    openPledges: sum(pledges),
  };
}

async function property(db: Db): Promise<PropertySection> {
  const rows = await selectAll<{ status: string; value: number | null }>((a, b) => db.from('assets').select('status, value').order('id').range(a, b));
  const held = rows.filter((r) => r.status !== 'DISPOSED' && r.status !== 'LOST');
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { assets: held.length, value: held.reduce((s, r) => s + Number(r.value ?? 0), 0), byStatus };
}

/** Income statement for the period and balance sheet at its end (or today); null before migration 044. */
async function statements(db: Db, period: ReportPeriod): Promise<AnnualReport['statements']> {
  try {
    const settings = (await readGlSettings(db)) ?? DEFAULT_GL_SETTINGS;
    const asOf = period.to < todayIso() ? period.to : todayIso();
    const [accounts, lines] = await Promise.all([loadAccounts(db), postedLines(db, period.to)]);
    if (!accounts.length) return null;
    const fyOf = (d: string) => fiscalYearStart(d, settings.fiscal_year_start);
    return {
      income: incomeStatement(accounts, lines, period.from, period.to, null),
      // Compared with the day before the period: where the year started
      balance: balanceSheet(accounts, lines, asOf, addDays(period.from, -1), fyOf),
    };
  } catch {
    return null; // the ledger is not set up yet
  }
}

async function readNotes(db: Db, key: string): Promise<AnnualNotes> {
  const { data } = await db.from('system_settings').select('value').eq('key', ANNUAL_NOTES_KEY).maybeSingle();
  const all = ((data as { value: Record<string, AnnualNotes> } | null)?.value ?? {}) as Record<string, AnnualNotes>;
  return { ...EMPTY_NOTES, ...(all[key] ?? {}) };
}

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadAnnualReport(requested: { yearId?: string; from?: string; to?: string } = {}): Promise<Loaded<AnnualReport>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('REPORT_VIEW');
    const can = (p: string) => me.permissions.includes(p as never);

    const years = (await db.from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .order('start_date', { ascending: false })
      .then(check)) as ReportYear[];

    // A period typed in, else the chosen academic year, else the current one
    let yearId = '';
    let from: string;
    let to: string;
    if (requested.from && requested.to && DATE.test(requested.from) && DATE.test(requested.to)) {
      [from, to] = requested.from <= requested.to ? [requested.from, requested.to] : [requested.to, requested.from];
    } else {
      const year = years.find((y) => y.id === requested.yearId) ?? years.find((y) => y.is_current) ?? years[0];
      const today = todayIso();
      yearId = year?.id ?? '';
      from = year?.start_date ?? `${today.slice(0, 4)}-01-01`;
      to = year?.end_date ?? today;
    }
    const period = { from, to };
    const ecYear = isoToEthiopian(to)?.year ?? Number(to.slice(0, 4)) - 8;
    const academicYear = years.find((y) => y.start_date <= from && from <= y.end_date) ?? years.find((y) => y.is_current);

    const optional = <T,>(allowed: boolean, work: () => Promise<T>): Promise<T | null> => (allowed ? work().catch(() => null) : Promise.resolve(null));
    const [m, e, sv, pl, pr, lib, gv, f, st, prop, g, notes] = await Promise.all([
      optional(can('MEMBER_VIEW') || can('AUDIT_VIEW_ALL'), () => membership(db, period)),
      optional(can('STUDENT_VIEW'), () => education(db, period, academicYear)),
      optional(can('HR_VIEW'), () => service(db, period)),
      optional(can('TASK_ASSIGN') || can('TASK_REPORT') || can('AUDIT_VIEW_ALL'), () => plans(db, ecYear)),
      optional(can('PROGRAM_VIEW'), () => programs(db, period)),
      optional(can('LIBRARY_VIEW') || can('LIBRARY_MANAGE'), () => library(db, period)),
      optional(can('FINANCE_VIEW'), () => giving(db, period)),
      optional(can('FINANCE_VIEW'), () => finance(db, period, academicYear)),
      optional(can('FINANCE_VIEW'), () => statements(db, period)),
      optional(can('ASSET_VIEW'), () => property(db)),
      optional(can('GOVERNANCE_VIEW') || can('AUDIT_VIEW_ALL'), () => governance(db)),
      readNotes(db, notesKey(period)),
    ]);

    return {
      mode: 'live',
      data: {
        school: me.tenant.is_default
          ? ['Hamere Hiwot Sunday School · Sallo Debre Tsehay St. George Church', 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት · ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን']
          : [me.tenant.name_en, me.tenant.name_am || me.tenant.name_en],
        period,
        years,
        yearId,
        ecYear,
        notes,
        canEditNotes: canEdit(me),
        membership: m,
        education: e,
        service: sv,
        plans: pl,
        programs: pr,
        library: lib,
        giving: gv,
        finance: f,
        statements: st ?? null,
        property: prop,
        governance: g,
      },
    };
  } catch (err) {
    return { mode: 'error', error: errorMessage(err) };
  }
}

// ── The written parts ────────────────────────────────────────────────────────

const NotesSchema = z.object({
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
  message: z.string().max(6000),
  highlights: z.string().max(6000),
  challenges: z.string().max(6000),
  next_year: z.string().max(6000),
});

export async function saveAnnualNotes(input: z.input<typeof NotesSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('REPORT_VIEW');
    if (!canEdit(me)) throw new Error('You do not have permission to do this');
    const n = NotesSchema.parse(input);
    const { data } = await db.from('system_settings').select('value').eq('key', ANNUAL_NOTES_KEY).maybeSingle();
    const all = ((data as { value: Record<string, AnnualNotes> } | null)?.value ?? {}) as Record<string, AnnualNotes>;
    all[notesKey(n)] = { message: n.message.trim(), highlights: n.highlights.trim(), challenges: n.challenges.trim(), next_year: n.next_year.trim() };
    await db
      .from('system_settings')
      .upsert({ key: ANNUAL_NOTES_KEY, value: all, updated_by: me.systemUser.id }, { onConflict: 'key' })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
