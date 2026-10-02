// ─────────────────────────────────────────────────────────────────────────────
// Human resources (servants) — data shapes, fixed lists and derived figures
// ─────────────────────────────────────────────────────────────────────────────

import type { AttendanceStatus } from '@/lib/attendance/store';

export type RoleKind = 'HEAD' | 'DEPUTY' | 'SECRETARY' | 'TEACHER' | 'SERVANT';
export type EndReason = 'COMPLETED' | 'TRANSFERRED' | 'RESIGNED' | 'SUSPENDED' | 'OTHER';
export type CaseKind = 'WARNING' | 'COUNSELING' | 'SUSPENSION' | 'RECONCILIATION' | 'OTHER';
export type CaseStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface ServiceAssignment {
  id: string;
  person_id: string;
  unit_id: string;
  unit: string;
  unit_am: string;
  role_kind: RoleKind;
  title: string;
  class_id: string | null;
  class_name: string;
  start_date: string;
  end_date: string | null;
  end_reason: EndReason | null;
  status: 'ACTIVE' | 'ENDED';
  notes: string;
}

export interface ServantPerson {
  id: string;
  name: string;
  name_am: string;
  phone: string;
  baptismal_name: string;
  status: string; // member status
}

export interface AttendanceMark {
  date: string;
  person_id: string;
  status: AttendanceStatus;
  check_in: string;
  note: string;
}

export interface DisciplineCase {
  id: string;
  person_id: string;
  opened_on: string;
  kind: CaseKind;
  reason: string;
  handled_by: string;
  suspended_until: string | null;
  status: CaseStatus;
  resolution: string;
  closed_on: string | null;
}

export interface HrData {
  /** Everyone who has ever held an assignment, plus anyone with a case or mark. */
  people: ServantPerson[];
  assignments: ServiceAssignment[];
  attendance: AttendanceMark[]; // the last ~13 months
  /** Empty unless the user may see discipline records (HR_MANAGE). */
  cases: DisciplineCase[];
  canSeeCases: boolean;
  /** Homeroom teachers set on classes this academic year. */
  homeroom: { class_id: string; class_name: string; person_id: string | null }[];
  candidates: { id: string; name: string }[]; // active members, not students
  units: { id: string; code: string; name: string; name_am: string; type: string }[];
  classes: { id: string; name: string }[]; // this academic year
}

export const EMPTY_HR: HrData = {
  people: [], assignments: [], attendance: [], cases: [], canSeeCases: false, homeroom: [], candidates: [], units: [], classes: [],
};

export const ROLE_KINDS: Record<RoleKind, [string, string]> = {
  HEAD: ['Head', 'ኃላፊ'],
  DEPUTY: ['Deputy head', 'ምክትል ኃላፊ'],
  SECRETARY: ['Secretary', 'ጸሐፊ'],
  TEACHER: ['Teacher', 'መምህር'],
  SERVANT: ['Servant', 'አገልጋይ'],
};

export const END_REASONS: Record<EndReason, [string, string]> = {
  COMPLETED: ['Term completed', 'የአገልግሎት ጊዜ ተጠናቋል'],
  TRANSFERRED: ['Moved to another unit', 'ወደ ሌላ ክፍል ተዛውሯል'],
  RESIGNED: ['Stepped down', 'በፈቃዱ ለቋል'],
  SUSPENDED: ['Suspended', 'ታግዷል'],
  OTHER: ['Other', 'ሌላ'],
};

export const CASE_KINDS: Record<CaseKind, [string, string]> = {
  WARNING: ['Warning', 'ማስጠንቀቂያ'],
  COUNSELING: ['Spiritual counselling', 'መንፈሳዊ ምክር'],
  SUSPENSION: ['Suspension from service', 'ከአገልግሎት ማገድ'],
  RECONCILIATION: ['Reconciliation', 'ዕርቅ'],
  OTHER: ['Other', 'ሌላ'],
};

export const CASE_STATUS: Record<CaseStatus, { cls: string; label: [string, string] }> = {
  OPEN: { cls: 'badge badge-warning', label: ['Open', 'በሂደት ላይ'] },
  RESOLVED: { cls: 'badge badge-success', label: ['Resolved', 'ተፈትቷል'] },
  DISMISSED: { cls: 'badge badge-info', label: ['Dismissed', 'ውድቅ ሆኗል'] },
};

// ── Derived figures ─────────────────────────────────────────────────────────

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface Tally {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Present or late over all marks except excused; null when nothing counts. */
  rate: number | null;
}

export function tally(marks: AttendanceMark[]): Tally {
  const n = (s: AttendanceStatus) => marks.filter((m) => m.status === s).length;
  const present = n('PRESENT');
  const late = n('LATE');
  const absent = n('ABSENT');
  const excused = n('EXCUSED');
  const counted = present + late + absent;
  return { present, late, absent, excused, rate: counted ? Math.round(((present + late) / counted) * 100) : null };
}

/** The suspension in force on a day, if any. */
export function activeSuspension(cases: DisciplineCase[], personId: string, today: string): DisciplineCase | undefined {
  return cases.find(
    (c) => c.person_id === personId && c.kind === 'SUSPENSION' && c.status === 'OPEN' && c.opened_on <= today && (!c.suspended_until || c.suspended_until >= today)
  );
}

export function roleLabel(a: Pick<ServiceAssignment, 'role_kind' | 'title'>, t: (en: string, am: string) => string): string {
  return a.title || t(...ROLE_KINDS[a.role_kind]);
}
