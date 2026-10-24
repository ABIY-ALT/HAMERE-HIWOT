'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Reports — aggregates computed from the live data for a chosen period.
// The page needs REPORT_VIEW; each section also needs that area's permission.
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { education, finance, governance, membership } from '@/lib/reports/sections';
import type { ReportData, ReportPeriod, ReportYear } from '@/lib/reports/types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
