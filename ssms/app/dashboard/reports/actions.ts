'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Reports — aggregates computed from the live data for a chosen period.
// The page needs REPORT_VIEW; each section also needs that area's permission.
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { computeBudget } from '@/lib/finance/budget';
import { PASS_MARK } from '@/lib/education/types';
import {
  monthsBetween,
  type ClassReportRow,
  type EducationReport,
  type FinanceReport,
  type GovernanceReport,
  type MembershipReport,
  type ReportData,
  type ReportPeriod,
  type ReportYear,
} from '@/lib/reports/types';

type Db = Awaited<ReturnType<typeof authorize>>['db'];
type MembershipRow = {
  body_id: string;
  term_end: string | null;
  person: { full_name_en: string } | null;
  position: { code: string; name_en: string; name_am: string } | null;
};
type EnrollmentRow = {
  student_id: string;
  class_id: string;
  status: string;
  student: { status: string; person: { gender: string } | null } | null;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Rate as on the attendance pages: late counts as attending, excused is left out. */
function attendanceRate(statuses: string[]): number | null {
  const counted = statuses.filter((s) => s !== 'EXCUSED');
  return pct(counted.filter((s) => s === 'PRESENT' || s === 'LATE').length, counted.length);
}

async function membership(db: Db, period: ReportPeriod): Promise<MembershipReport> {
  const [persons, students] = await Promise.all([
    selectAll<{ id: string; gender: string; status: string; created_at: string }>((a, b) =>
      db.from('persons').select('id, gender, status, created_at').order('id').range(a, b)
    ),
    selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
  ]);
  const studentPersons = new Set(students.map((s) => s.person_id));
  const members = persons.filter((p) => !studentPersons.has(p.id));
  const inPeriod = members.filter((p) => p.created_at.slice(0, 10) >= period.from && p.created_at.slice(0, 10) <= period.to);
  const byStatus: Record<string, number> = {};
  for (const m of members) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
  return {
    total: members.length,
    byStatus,
    male: members.filter((m) => m.gender === 'MALE').length,
    female: members.filter((m) => m.gender === 'FEMALE').length,
    newInPeriod: inPeriod.length,
    perMonth: monthsBetween(period.from, period.to).map((month) => ({
      month,
      count: inPeriod.filter((p) => p.created_at.startsWith(month)).length,
    })),
  };
}

async function education(db: Db, period: ReportPeriod, year: ReportYear | undefined): Promise<EducationReport> {
  const months = monthsBetween(period.from, period.to);
  const emptyTotals = { students: 0, male: 0, female: 0, sessions: 0, attendanceRate: null, withResults: 0, average: null, passRate: null };
  if (!year) return { year: null, classes: [], totals: emptyTotals, attendanceByMonth: months.map((month) => ({ month, rate: null, sessions: 0 })) };

  const [classRows, enrollments, sessions, grades] = await Promise.all([
    db.from('classes')
      .select('id, name_en, name_am, grade_level, teacher:persons!classes_teacher_person_id_fkey(full_name_en)')
      .eq('academic_year_id', year.id)
      .order('grade_level')
      .order('name_en')
      .then(check) as Promise<{ id: string; name_en: string; name_am: string | null; teacher: { full_name_en: string } | null }[]>,
    selectAll<Record<string, unknown>>((a, b) =>
      db.from('enrollments')
        .select('student_id, class_id, status, student:students(status, person:persons!students_person_id_fkey(gender))')
        .eq('academic_year_id', year.id)
        .order('id')
        .range(a, b)
    ) as Promise<unknown> as Promise<EnrollmentRow[]>,
    selectAll<{ class_id: string; session_date: string; records: { status: string }[] }>((a, b) =>
      db.from('attendance_sessions')
        .select('class_id, session_date, records:attendance_records(status)')
        .gte('session_date', period.from)
        .lte('session_date', period.to)
        .order('id')
        .range(a, b)
    ),
    selectAll<{ student_id: string; total_score: number }>((a, b) =>
      db.from('grades').select('student_id, total_score').eq('academic_year_id', year.id).eq('status', 'APPROVED').order('id').range(a, b)
    ),
  ]);

  const active = enrollments.filter((e) => e.status === 'ACTIVE' && e.student?.status === 'ACTIVE');
  const scores = new Map<string, number[]>();
  for (const g of grades) scores.set(g.student_id, [...(scores.get(g.student_id) ?? []), Number(g.total_score)]);
  const studentAverage = (id: string) => {
    const list = scores.get(id);
    return list?.length ? list.reduce((s, x) => s + x, 0) / list.length : null;
  };

  const summarize = (classIds: Set<string>) => {
    const roster = active.filter((e) => classIds.has(e.class_id));
    const classSessions = sessions.filter((s) => classIds.has(s.class_id));
    const averages = roster.map((e) => studentAverage(e.student_id)).filter((a): a is number => a !== null);
    return {
      students: roster.length,
      male: roster.filter((e) => e.student?.person?.gender === 'MALE').length,
      female: roster.filter((e) => e.student?.person?.gender === 'FEMALE').length,
      sessions: classSessions.length,
      attendanceRate: attendanceRate(classSessions.flatMap((s) => s.records.map((r) => r.status))),
      withResults: averages.length,
      average: averages.length ? round1(averages.reduce((s, x) => s + x, 0) / averages.length) : null,
      passRate: pct(averages.filter((a) => a >= PASS_MARK).length, averages.length),
    };
  };

  const classes: ClassReportRow[] = classRows.map((c) => ({
    class_id: c.id,
    class: c.name_en,
    class_am: c.name_am || c.name_en,
    teacher: c.teacher?.full_name_en ?? '—',
    ...summarize(new Set([c.id])),
  }));

  return {
    year: year.name,
    classes,
    totals: summarize(new Set(classRows.map((c) => c.id))),
    attendanceByMonth: months.map((month) => {
      const inMonth = sessions.filter((s) => s.session_date.startsWith(month));
      return { month, sessions: inMonth.length, rate: attendanceRate(inMonth.flatMap((s) => s.records.map((r) => r.status))) };
    }),
  };
}

async function finance(db: Db, period: ReportPeriod, year: ReportYear | undefined): Promise<FinanceReport> {
  const [txns, requests] = await Promise.all([
    selectAll<{ txn_type: string; category: string; amount: number; txn_date: string }>((a, b) =>
      db.from('finance_transactions')
        .select('txn_type, category, amount, txn_date')
        .gte('txn_date', period.from)
        .lte('txn_date', period.to)
        .order('id')
        .range(a, b)
    ),
    selectAll<{ status: string; amount: number; created_at: string; reviewed_at: string | null }>((a, b) =>
      db.from('finance_requests')
        .select('status, amount, created_at, reviewed_at')
        .gte('created_at', `${period.from}T00:00:00Z`)
        .lte('created_at', `${period.to}T23:59:59.999Z`)
        .order('id')
        .range(a, b)
    ),
  ]);

  const sum = (list: { amount: number }[]) => list.reduce((s, x) => s + Number(x.amount), 0);
  const byCategory = (type: string) => {
    const map = new Map<string, number>();
    for (const t of txns.filter((x) => x.txn_type === type)) map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount));
    return [...map].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  };
  const reviewed = requests.filter((r) => r.reviewed_at);
  const byStatus: Record<string, number> = {};
  for (const r of requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  let budget: FinanceReport['budget'] = [];
  try {
    if (year) budget = await computeBudget(db, year);
  } catch {
    // budget table not created yet
  }

  return {
    income: sum(txns.filter((t) => t.txn_type === 'INCOME')),
    expenses: sum(txns.filter((t) => t.txn_type === 'EXPENSE')),
    byMonth: monthsBetween(period.from, period.to).map((month) => ({
      month,
      income: sum(txns.filter((t) => t.txn_type === 'INCOME' && t.txn_date.startsWith(month))),
      expense: sum(txns.filter((t) => t.txn_type === 'EXPENSE' && t.txn_date.startsWith(month))),
    })),
    incomeByCategory: byCategory('INCOME'),
    expenseByCategory: byCategory('EXPENSE'),
    requests: {
      total: requests.length,
      byStatus,
      requested: sum(requests),
      approvedAmount: sum(requests.filter((r) => r.status === 'APPROVED' || r.status === 'COMPLETED')),
      avgDecisionDays: reviewed.length
        ? round1(
            reviewed.reduce((s, r) => s + (Date.parse(r.reviewed_at as string) - Date.parse(r.created_at)) / 86_400_000, 0) /
              reviewed.length
          )
        : null,
    },
    budget,
    budgetYear: year?.name ?? null,
  };
}

async function governance(db: Db): Promise<GovernanceReport> {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const [bodies, rules, memberships] = await Promise.all([
    db.from('governance_bodies').select('id, name_en, name_am').eq('is_active', true).order('name_en').then(check) as Promise<
      { id: string; name_en: string; name_am: string }[]
    >,
    db.from('governance_body_rules').select('body_id, rule_value').eq('rule_code', 'EXACT_MEMBER_COUNT').eq('is_enforced', true).then(check) as Promise<
      { body_id: string; rule_value: string }[]
    >,
    selectAll<Record<string, unknown>>((a, b) =>
      db.from('governance_memberships')
        .select('body_id, term_end, person:persons!governance_memberships_person_id_fkey(full_name_en), position:governance_positions(code, name_en, name_am)')
        .eq('status', 'ACTIVE')
        .order('id')
        .range(a, b)
    ) as Promise<unknown> as Promise<MembershipRow[]>,
  ]);
  const seats = new Map(rules.map((r) => [r.body_id, Number(r.rule_value)]));
  const bodyById = new Map(bodies.map((b) => [b.id, b]));
  const officerCodes = ['CHAIRPERSON', 'VICE_CHAIR', 'SECRETARY', 'TREASURER'];

  return {
    bodies: bodies.map((b) => {
      const mine = memberships.filter((m) => m.body_id === b.id);
      return {
        name_en: b.name_en,
        name_am: b.name_am,
        active: mine.length,
        seats: seats.get(b.id) ?? null,
        officers: mine.filter((m) => officerCodes.includes(m.position?.code ?? '')).length,
      };
    }),
    terms: memberships
      .filter((m) => m.term_end && m.term_end <= soon)
      .map((m) => ({
        person: m.person?.full_name_en ?? '—',
        body: bodyById.get(m.body_id)?.name_en ?? '—',
        body_am: bodyById.get(m.body_id)?.name_am ?? '—',
        position: m.position?.name_en ?? '—',
        position_am: m.position?.name_am ?? '—',
        term_end: m.term_end as string,
        overdue: (m.term_end as string) < today,
      }))
      .sort((a, b) => a.term_end.localeCompare(b.term_end)),
  };
}

export async function loadReports(requested?: Partial<ReportPeriod>): Promise<Loaded<ReportData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('REPORT_VIEW');
    const can = (p: string) => me.permissions.includes(p as never);

    const years = (await db.from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .order('start_date', { ascending: false })
      .then(check)) as ReportYear[];
    const current = years.find((y) => y.is_current);

    // Default period: the current academic year, else this calendar year.
    const today = new Date().toISOString().slice(0, 10);
    let from = requested?.from && DATE.test(requested.from) ? requested.from : current?.start_date ?? `${today.slice(0, 4)}-01-01`;
    let to = requested?.to && DATE.test(requested.to) ? requested.to : current?.end_date ?? today;
    if (to < from) [from, to] = [to, from];
    const period = { from, to };

    // Education uses the academic year that contains the period start (or the current one).
    const year = years.find((y) => y.start_date <= from && from <= y.end_date) ?? current;

    const [m, e, f, g] = await Promise.all([
      can('MEMBER_VIEW') || can('AUDIT_VIEW_ALL') ? membership(db, period) : null,
      can('STUDENT_VIEW') ? education(db, period, year) : null,
      can('FINANCE_VIEW') ? finance(db, period, year).catch(() => null) : null,
      can('GOVERNANCE_VIEW') || can('AUDIT_VIEW_ALL') ? governance(db) : null,
    ]);

    return { mode: 'live', data: { period, years, membership: m, education: e, finance: f, governance: g } };
  } catch (err) {
    return { mode: 'error', error: errorMessage(err) };
  }
}
