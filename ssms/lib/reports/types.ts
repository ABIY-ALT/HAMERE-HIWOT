// ─────────────────────────────────────────────────────────────────────────────
// Report data shapes. Every section is null when the viewer lacks permission.
// ─────────────────────────────────────────────────────────────────────────────

import type { BudgetLine } from '@/lib/finance/types';

export interface ReportPeriod {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface MembershipReport {
  total: number;
  byStatus: Record<string, number>;
  male: number;
  female: number;
  newInPeriod: number;
  perMonth: { month: string; count: number }[];
}

export interface ClassReportRow {
  class_id: string;
  class: string;
  class_am: string;
  teacher: string;
  students: number;
  male: number;
  female: number;
  sessions: number;
  attendanceRate: number | null;
  withResults: number;
  average: number | null;
  passRate: number | null;
}

export interface EducationReport {
  year: string | null;
  classes: ClassReportRow[];
  totals: Omit<ClassReportRow, 'class_id' | 'class' | 'class_am' | 'teacher'>;
  attendanceByMonth: { month: string; rate: number | null; sessions: number }[];
}

export interface FinanceReport {
  income: number;
  expenses: number;
  byMonth: { month: string; income: number; expense: number }[];
  incomeByCategory: { category: string; amount: number }[];
  expenseByCategory: { category: string; amount: number }[];
  requests: {
    total: number;
    byStatus: Record<string, number>;
    requested: number;
    approvedAmount: number;
    avgDecisionDays: number | null;
  };
  budget: BudgetLine[];
  budgetYear: string | null;
}

export interface GovernanceReport {
  bodies: { name_en: string; name_am: string; active: number; seats: number | null; officers: number }[];
  terms: { person: string; body: string; body_am: string; position: string; position_am: string; term_end: string; overdue: boolean }[];
}

export interface ReportYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface ReportData {
  period: ReportPeriod;
  years: ReportYear[];
  membership: MembershipReport | null;
  education: EducationReport | null;
  finance: FinanceReport | null;
  governance: GovernanceReport | null;
}

/** YYYY-MM months from `from` to `to` (inclusive); for long ranges, the latest 24. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  while (out.length < 600) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.slice(-24);
}
