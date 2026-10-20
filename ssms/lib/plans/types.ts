// ─────────────────────────────────────────────────────────────────────────────
// Department plans (migration 032) — shared types and the rules for progress.
// Quarters follow the Sunday school year (Meskerem first):
//   Q1 Meskerem–Hidar · Q2 Tahsas–Yekatit · Q3 Megabit–Genbot · Q4 Sene–Pagume
// ─────────────────────────────────────────────────────────────────────────────

import { isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';

export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';
export type ActivityState = 'NOT_STARTED' | 'ON_TRACK' | 'DELAYED' | 'DONE' | 'DROPPED';

export const ACTIVITY_STATES: ActivityState[] = ['NOT_STARTED', 'ON_TRACK', 'DELAYED', 'DONE', 'DROPPED'];
export const QUARTERS = [1, 2, 3, 4] as const;

export const STATUS_LABEL: Record<PlanStatus, [string, string]> = {
  DRAFT: ['Draft', 'ረቂቅ'],
  SUBMITTED: ['Waiting for approval', 'ማጽደቅ ይጠብቃል'],
  APPROVED: ['Approved', 'ጸድቋል'],
  RETURNED: ['Returned for changes', 'ለማስተካከያ ተመልሷል'],
};

export const STATE_LABEL: Record<ActivityState, [string, string]> = {
  NOT_STARTED: ['Not started', 'አልተጀመረም'],
  ON_TRACK: ['On track', 'በሂደት ላይ'],
  DELAYED: ['Delayed', 'ዘግይቷል'],
  DONE: ['Done', 'ተጠናቋል'],
  DROPPED: ['Dropped', 'ተሰርዟል'],
};

export const QUARTER_LABEL: Record<number, [string, string]> = {
  1: ['Q1 · Meskerem–Hidar', '፩ኛ ሩብ · መስከረም–ኅዳር'],
  2: ['Q2 · Tahsas–Yekatit', '፪ኛ ሩብ · ታኅሣሥ–የካቲት'],
  3: ['Q3 · Megabit–Genbot', '፫ኛ ሩብ · መጋቢት–ግንቦት'],
  4: ['Q4 · Sene–Nehase', '፬ኛ ሩብ · ሰኔ–ነሐሴ'],
};

export interface PlanUpdate {
  id: string;
  quarter: number;
  progress: number;
  achieved: number | null;
  state: ActivityState;
  note: string;
  author: string;
  created_at: string;
}

export interface PlanActivity {
  id: string;
  position: number;
  title: string;
  measure: string;
  target: number | null;
  quarters: number[];
  budget: number | null;
  responsible: string;
  achieved: number | null;
  progress: number;
  state: ActivityState;
  /** Newest first */
  updates: PlanUpdate[];
  /** Tasks made to carry it out (migration 035) */
  tasks: PlanTask[];
}

/** A task that carries out a plan activity. */
export interface PlanTask {
  id: string;
  task_no: string;
  title: string;
  status: string;
  assignee: string;
  progress: number;
}

export interface UnitPlan {
  id: string;
  unit_id: string;
  year: number;
  goal: string;
  status: PlanStatus;
  review_note: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer: string;
  activities: PlanActivity[];
}

export interface PlanUnit {
  id: string;
  name_en: string;
  name_am: string;
}

export interface PlansData {
  year: number;
  current_year: number;
  current_quarter: number;
  /** Units this user sees */
  units: PlanUnit[];
  plans: UnitPlan[];
  /** Units whose plan this user may write and report on */
  editable_units: string[];
  /** May approve / return plans and send reminders (TASK_ASSIGN) */
  can_review: boolean;
  /** unit id → its people, for making tasks from activities (editable units) */
  people: Record<string, { id: string; name: string }[]>;
}

/** The quarter of an Ethiopian month (Pagume counts with Q4). */
export const quarterOf = (month: number) => Math.min(4, Math.max(1, Math.ceil(month / 3)));

/** Today's Ethiopian year and quarter. */
export function nowQuarter(today = todayIso()): { year: number; quarter: number } {
  const e = isoToEthiopian(today);
  return e ? { year: e.year, quarter: quarterOf(e.month) } : { year: new Date().getFullYear() - 8, quarter: 1 };
}

/** Its last quarter is over (or the year is) and it is neither done nor dropped. */
export function isOverdue(a: Pick<PlanActivity, 'quarters' | 'state'>, planYear: number, now = nowQuarter()): boolean {
  if (a.state === 'DONE' || a.state === 'DROPPED') return false;
  if (planYear < now.year) return true;
  if (planYear > now.year || a.quarters.length === 0) return false;
  return Math.max(...a.quarters) < now.quarter;
}

export interface PlanSummary {
  activities: number;
  done: number;
  delayed: number;
  overdue: number;
  /** Average % done of the activities still in the plan (dropped ones left out) */
  progress: number;
  budget: number;
}

export function planSummary(plan: Pick<UnitPlan, 'activities' | 'year'>, now = nowQuarter()): PlanSummary {
  const live = plan.activities.filter((a) => a.state !== 'DROPPED');
  return {
    activities: plan.activities.length,
    done: plan.activities.filter((a) => a.state === 'DONE').length,
    delayed: plan.activities.filter((a) => a.state === 'DELAYED').length,
    overdue: plan.activities.filter((a) => isOverdue(a, plan.year, now)).length,
    progress: live.length ? Math.round(live.reduce((s, a) => s + a.progress, 0) / live.length) : 0,
    budget: plan.activities.reduce((s, a) => s + (a.budget ?? 0), 0),
  };
}
