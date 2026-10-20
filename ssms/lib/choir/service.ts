// ─────────────────────────────────────────────────────────────────────────────
// Service roster (ምደባ) and vestments (የክብር ልብስ) — shapes, labels and the
// rehearsal-attendance rule. Client-safe (no server imports). Migration 037.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChoirMember, ChoirSession } from './types';

export type RosterStatus = 'NONE' | 'DRAFT' | 'PUBLISHED';
export type ServiceResponse = 'PENDING' | 'CONFIRMED' | 'DECLINED';
export type VestmentCondition = 'GOOD' | 'WORN' | 'DAMAGED';
export type VestmentStatus = 'AVAILABLE' | 'OUT' | 'REPAIR' | 'RETIRED' | 'LOST';

export interface Assignment {
  id: string;
  member_id: string;
  role: string;
  rate: number | null;
  response: ServiceResponse;
  response_note: string;
  responded_at: string | null;
  notified: boolean;
}

export interface Roster {
  session_id: string;
  status: RosterStatus;
  published_at: string | null;
  min_rate: number | null;
  weeks: number | null;
  assignments: Assignment[];
}

export interface Vestment {
  id: string;
  code: string;
  kind: string;
  size: string;
  condition: VestmentCondition;
  status: VestmentStatus;
  notes: string;
  /** Times it was issued */
  uses: number;
}

export interface VestmentLoan {
  id: string;
  vestment_id: string;
  vestment: string; // code · kind · size
  person_id: string;
  person: string;
  phone: string;
  session_id: string | null;
  session: string;
  issued_at: string;
  due_on: string;
  returned_at: string | null;
  return_condition: VestmentCondition | 'LOST' | null;
  notes: string;
  reminded_at: string | null;
}

export interface ServiceData {
  rosters: Roster[];
  vestments: Vestment[];
  /** Open loans, and the ones returned in the last 90 days */
  loans: VestmentLoan[];
}

export interface MyServiceItem {
  assignment_id: string | null;
  session_id: string;
  date: string;
  time: string;
  title: string;
  location: string;
  role: string;
  response: ServiceResponse | null;
  response_note: string;
}

export interface MyService {
  /** Not in the choir (or not active): nothing to show */
  in_choir: boolean;
  name: string;
  /** Upcoming services with a published roster: assigned (assignment_id) or not */
  upcoming: MyServiceItem[];
  /** Rehearsals in the last WEEKS weeks */
  rehearsals: { held: number; counted: number; came: number; rate: number | null };
  /** Vestments this person holds now */
  holding: { id: string; vestment: string; due_on: string; overdue: boolean; session: string }[];
}

export const MIN_RATE = 75;
export const WEEKS = 4;
export const WEEK_CHOICES = [2, 4, 6, 8, 12];
export const RATE_CHOICES = [50, 60, 70, 75, 80, 90, 100];

export const ROLE_SUGGESTIONS: [string, string][] = [
  ['Lead singer', 'መሪ ዘማሪ'],
  ['Kebero', 'ከበሮ'],
  ['Tsenatsil', 'ጸናጽል'],
  ['Mekuamia', 'መቋሚያ'],
  ['Begena', 'በገና'],
  ['Reader', 'አንባቢ'],
  ['Singer', 'ዘማሪ'],
];

export const KIND_SUGGESTIONS: [string, string][] = [
  ['Kaba (cape)', 'ካባ'],
  ['Robe', 'ቀሚስ'],
  ['Netela', 'ነጠላ'],
  ['Sash', 'መቀነት'],
  ['Crown / cap', 'ቆብ'],
];

export const RESPONSE_LABEL: Record<ServiceResponse, [string, string]> = {
  PENDING: ['Not answered', 'ገና አልመለሱም'],
  CONFIRMED: ['Will serve', 'ይመጣሉ'],
  DECLINED: ['Can’t come', 'አይችሉም'],
};

export const CONDITION_LABEL: Record<VestmentCondition | 'LOST', [string, string]> = {
  GOOD: ['Good', 'ጥሩ'],
  WORN: ['Worn', 'ያረጀ'],
  DAMAGED: ['Damaged', 'የተጎዳ'],
  LOST: ['Lost', 'የጠፋ'],
};

export const VESTMENT_STATUS_LABEL: Record<VestmentStatus, [string, string]> = {
  AVAILABLE: ['In store', 'መጋዘን ውስጥ'],
  OUT: ['Given out', 'ተሰጥቷል'],
  REPAIR: ['Being repaired', 'በጥገና ላይ'],
  RETIRED: ['Retired', 'ከአገልግሎት ውጪ'],
  LOST: ['Lost', 'የጠፋ'],
};

/** Services and performances get a roster; rehearsals are what it is measured on. */
export const takesRoster = (s: Pick<ChoirSession, 'kind'>) => s.kind === 'SERVICE' || s.kind === 'PERFORMANCE';

export interface RehearsalRate {
  /** Rehearsals held in the window */
  held: number;
  /** Rehearsals the member was marked for, excused ones left out */
  counted: number;
  /** Present or late */
  came: number;
  /** came / counted in %, null when they were never marked */
  rate: number | null;
}

/** The first day of the window: `weeks` weeks before the service day. */
export function windowStart(serviceDate: string, weeks: number): string {
  const d = new Date(`${serviceDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * A member's attendance at the rehearsals held in the `weeks` weeks before the
 * service (the service day itself included, for a rehearsal that morning).
 * Excused rehearsals and ones they were not marked for are not counted.
 */
export function rehearsalRate(sessions: ChoirSession[], memberId: string, serviceDate: string, weeks: number): RehearsalRate {
  const from = windowStart(serviceDate, weeks);
  const rehearsals = sessions.filter((s) => s.kind === 'REHEARSAL' && s.status === 'HELD' && s.date >= from && s.date <= serviceDate);
  let counted = 0;
  let came = 0;
  for (const s of rehearsals) {
    const mark = s.attendance[memberId];
    if (!mark || mark === 'EXCUSED') continue;
    counted += 1;
    if (mark === 'PRESENT' || mark === 'LATE') came += 1;
  }
  return { held: rehearsals.length, counted, came, rate: counted ? Math.round((came / counted) * 100) : null };
}

/** Active members who meet the rule, best attendance first. */
export function suggestRoster(members: ChoirMember[], sessions: ChoirSession[], serviceDate: string, weeks: number, minRate: number): string[] {
  return members
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({ id: m.id, r: rehearsalRate(sessions, m.id, serviceDate, weeks) }))
    .filter((x) => x.r.rate !== null && x.r.rate >= minRate)
    .sort((a, b) => (b.r.rate ?? 0) - (a.r.rate ?? 0) || b.r.came - a.r.came)
    .map((x) => x.id);
}

/** Day after the service: when a vestment is due back by default. */
export function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const isOverdue = (loan: Pick<VestmentLoan, 'returned_at' | 'due_on'>, today: string) => !loan.returned_at && loan.due_on < today;

/** "KB-007 · Kaba · L" */
export const vestmentLabel = (v: { code: string; kind: string; size?: string | null }) => [v.code, v.kind, v.size].filter(Boolean).join(' · ');
