// ─────────────────────────────────────────────────────────────────────────────
// Annual report for the General Assembly — data shapes. One printable
// document for a year: the figures of every area the viewer may see, the
// financial statements, and the written parts (message, highlights,
// challenges, next year's plans) kept per period in system_settings.
// Every section is null when the viewer lacks that area's permission.
// ─────────────────────────────────────────────────────────────────────────────

import type { BalanceSheet, IncomeStatement } from '@/lib/finance/gl';
import type { EducationReport, FinanceReport, GovernanceReport, MembershipReport, ReportPeriod, ReportYear } from './types';

/** system_settings key; value: { "<from>_<to>": AnnualNotes } */
export const ANNUAL_NOTES_KEY = 'annual_report_notes';

export interface AnnualNotes {
  message: string;
  highlights: string;
  challenges: string;
  next_year: string;
}

export const EMPTY_NOTES: AnnualNotes = { message: '', highlights: '', challenges: '', next_year: '' };

export const notesKey = (p: ReportPeriod) => `${p.from}_${p.to}`;

export interface ServiceSection {
  /** People serving now (active assignments) */
  servants: number;
  /** Assignments that started in the period */
  newInPeriod: number;
  byUnit: { unit: string; unit_am: string; count: number }[];
}

export interface PlanUnitRow {
  unit: string;
  unit_am: string;
  status: string;
  activities: number;
  done: number;
  dropped: number;
  /** Average progress of the activities not dropped (0–100) */
  progress: number | null;
  budget: number;
}

export interface PlansSection {
  /** Ethiopian year of the plans */
  year: number;
  units: PlanUnitRow[];
  activities: number;
  done: number;
  progress: number | null;
}

export interface ProgramsSection {
  total: number;
  completed: number;
  cancelled: number;
  participants: number;
  checkins: number;
  byType: { type: string; count: number }[];
  list: { title: string; title_am: string; date: string; type: string; status: string; participants: number | null }[];
}

export interface LibrarySection {
  titles: number;
  copies: number;
  loans: number;
  readers: number;
}

export interface GivingSection {
  duesCollected: number;
  duesPayers: number;
  donations: number;
  donationCount: number;
  inKindValue: number;
  openPledges: number;
}

export interface PropertySection {
  assets: number;
  value: number;
  byStatus: Record<string, number>;
}

export interface AnnualReport {
  school: [en: string, am: string];
  period: ReportPeriod;
  years: ReportYear[];
  /** The academic year chosen, '' for a period typed in */
  yearId: string;
  /** Ethiopian year the period ends in (department plans are kept per Ethiopian year) */
  ecYear: number;
  notes: AnnualNotes;
  canEditNotes: boolean;
  membership: MembershipReport | null;
  education: EducationReport | null;
  service: ServiceSection | null;
  plans: PlansSection | null;
  programs: ProgramsSection | null;
  library: LibrarySection | null;
  giving: GivingSection | null;
  /** Single-entry figures and the budget per department */
  finance: FinanceReport | null;
  /** From the general ledger (null before migration 044) */
  statements: { income: IncomeStatement; balance: BalanceSheet } | null;
  property: PropertySection | null;
  governance: GovernanceReport | null;
}
