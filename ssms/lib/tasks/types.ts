// ─────────────────────────────────────────────────────────────────────────────
// Tasks: work the Executive Committee (or anyone with TASK_ASSIGN) gives to
// departments and coordinations, routinely or as meeting decisions, and the
// reports that come back. Built by app/dashboard/tasks/actions.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays } from '@/lib/hr/types';
import { ethiopianToIso, isoToEthiopian } from '@/lib/utils/ethiopian-calendar';

export type TaskStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'RETURNED' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskSource = 'ROUTINE' | 'MEETING';
export type UpdateKind = 'PROGRESS' | 'SUBMITTED' | 'RETURNED' | 'COMPLETED' | 'CANCELLED' | 'REMINDED' | 'HANDED';
export type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface TaskFile {
  id: string;
  /** The report it was attached with; null when attached to the task itself. */
  update_id: string | null;
  name: string;
  mime: string;
  size: number;
  uploaded_by: string;
  uploaded_by_id: string;
  at: string;
}

/** A task that is given again every week / month / 3 months. */
export interface TaskSeries {
  id: string;
  title: string;
  unit_id: string;
  unit: string;
  unit_am: string;
  frequency: Frequency;
  next_due: string;
  is_active: boolean;
  created_by: string;
}

export interface TaskUpdate {
  id: string;
  kind: UpdateKind;
  note: string;
  progress: number | null;
  author: string;
  at: string; // ISO timestamp
}

export interface Task {
  id: string;
  task_no: string;
  title: string;
  details: string;
  from_unit_id: string | null;
  from_unit: string;
  from_unit_am: string;
  unit_id: string;
  unit: string;
  unit_am: string;
  source: TaskSource;
  meeting_title: string;
  meeting_date: string | null;
  decision_ref: string;
  priority: TaskPriority;
  due_date: string | null;
  status: TaskStatus;
  progress: number;
  created_by_id: string;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  /** Oldest first. */
  updates: TaskUpdate[];
  files: TaskFile[];
  series_id: string | null;
  /** How often it repeats, while its series is still running. */
  repeats: Frequency | null;
  /** The person in the department doing it (migration 035) */
  assignee_id: string | null;
  assignee: string;
  /** Given by the department to its own people — the head reviews it */
  internal: boolean;
  /** Part of a bigger task */
  parent_task_id: string | null;
  parent_task_no: string;
  /** The plan activity it carries out */
  plan_activity_id: string | null;
  plan_activity: string;
  /** Its parts given to people: how many, how many done */
  parts: { total: number; done: number };
}

/** Someone in a department who can be given a task. */
export interface TaskPerson {
  id: string;
  name: string;
}

export interface TaskUnit {
  id: string;
  name_en: string;
  name_am: string;
  type: string; // organization unit type
}

export interface TasksData {
  tasks: Task[];
  units: TaskUnit[];
  series: TaskSeries[];
  /** unit id → its people (members, servants, staff accounts), for the units this user works in */
  people: Record<string, TaskPerson[]>;
}

export const EMPTY_TASKS: TasksData = { tasks: [], units: [], series: [], people: {} };

/** Waiting on the department. */
export const WORK_STATUSES: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'RETURNED'];
/** Not finished yet (includes reports waiting for review). */
export const OPEN_STATUSES: TaskStatus[] = [...WORK_STATUSES, 'SUBMITTED'];

export const STATUS: Record<TaskStatus, { cls: string; label: [string, string] }> = {
  ASSIGNED: { cls: 'badge badge-info', label: ['Assigned', 'ተሰጥቷል'] },
  IN_PROGRESS: { cls: 'badge badge-primary', label: ['In progress', 'በሂደት ላይ'] },
  SUBMITTED: { cls: 'badge badge-warning', label: ['Report submitted', 'ሪፖርት ቀርቧል'] },
  RETURNED: { cls: 'badge badge-danger', label: ['Returned', 'ተመልሷል'] },
  COMPLETED: { cls: 'badge badge-success', label: ['Completed', 'ተጠናቋል'] },
  CANCELLED: { cls: 'badge bg-slate-100 text-slate-500', label: ['Cancelled', 'ተሰርዟል'] },
};

export const PRIORITY: Record<TaskPriority, { cls: string; label: [string, string] }> = {
  LOW: { cls: 'text-slate-500', label: ['Low', 'ዝቅተኛ'] },
  NORMAL: { cls: 'text-slate-700', label: ['Normal', 'መደበኛ'] },
  HIGH: { cls: 'text-amber-600 font-semibold', label: ['High', 'ከፍተኛ'] },
  URGENT: { cls: 'text-red-600 font-bold', label: ['Urgent', 'አስቸኳይ'] },
};

export const SOURCE: Record<TaskSource, [string, string]> = {
  ROUTINE: ['Routine work', 'መደበኛ ሥራ'],
  MEETING: ['Meeting decision', 'የስብሰባ ውሳኔ'],
};

export const UPDATE_KIND: Record<UpdateKind, [string, string]> = {
  PROGRESS: ['Progress report', 'የሂደት ሪፖርት'],
  SUBMITTED: ['Final report submitted', 'የማጠቃለያ ሪፖርት ቀረበ'],
  RETURNED: ['Returned for more work', 'ለተጨማሪ ሥራ ተመለሰ'],
  COMPLETED: ['Accepted as completed', 'ተጠናቋል ተብሎ ተቀባይነት አገኘ'],
  CANCELLED: ['Cancelled', 'ተሰርዟል'],
  REMINDED: ['Reminder sent', 'ማስታወሻ ተልኳል'],
  HANDED: ['Given to', 'ለ… ተሰጠ'],
};

/** Units that can be given tasks, in the order the form lists them. */
export const ASSIGNEE_TYPES = ['DEPARTMENT', 'COORDINATION', 'SUB_COMMITTEE', 'EXECUTIVE_SECRETARIAT', 'MANAGEMENT_SECRETARIAT'];
/** Bodies that give tasks. */
export const GIVER_TYPES = ['EXECUTIVE_COMMITTEE', 'MANAGEMENT_BOARD', 'GENERAL_ASSEMBLY', 'EXECUTIVE_SECRETARIAT', 'MANAGEMENT_SECRETARIAT', 'COORDINATION'];

export function isOverdue(task: Pick<Task, 'status' | 'due_date'>, today: string): boolean {
  return Boolean(task.due_date && task.due_date < today && WORK_STATUSES.includes(task.status));
}

/** Groups the decisions of one meeting together. */
export const meetingKey = (task: Pick<Task, 'meeting_date' | 'meeting_title'>) => `${task.meeting_date ?? ''}|${task.meeting_title}`;

/** Completed on or before the due date (or no due date). */
export function onTime(task: Pick<Task, 'status' | 'due_date' | 'completed_at'>): boolean {
  return task.status === 'COMPLETED' && (!task.due_date || (task.completed_at ?? '').slice(0, 10) <= task.due_date);
}

// ── Repeating tasks ──────────────────────────────────────────────────────────

export const FREQUENCY: Record<Frequency, [string, string]> = {
  WEEKLY: ['Every week', 'በየሳምንቱ'],
  MONTHLY: ['Every month', 'በየወሩ'],
  QUARTERLY: ['Every 3 months', 'በየ3 ወሩ'],
};

/** How many days before its due date each repeat is given to the unit. */
export const ISSUE_BEFORE: Record<Frequency, number> = { WEEKLY: 3, MONTHLY: 7, QUARTERLY: 14 };

/** The next due date: a week later, or the same day of the next (or third) Ethiopian month, Pagume skipped. */
export function nextDue(iso: string, frequency: Frequency): string {
  if (frequency === 'WEEKLY') return addDays(iso, 7);
  const e = isoToEthiopian(iso);
  if (!e) return addDays(iso, frequency === 'MONTHLY' ? 30 : 90);
  let month = Math.min(e.month, 12) + (frequency === 'MONTHLY' ? 1 : 3);
  let year = e.year;
  if (month > 12) {
    month -= 12;
    year += 1;
  }
  return ethiopianToIso({ year, month, day: Math.min(e.day, 30) }) ?? addDays(iso, 30);
}

// ── Files ────────────────────────────────────────────────────────────────────

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_AT_ONCE = 5;

/** What can be attached: photos, PDFs, Word and Excel files. */
export const FILE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
export const FILE_ACCEPT = Object.entries(FILE_TYPES).flatMap(([mime, ext]) => [mime, ext]).join(',');

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── My tasks (migration 035) ─────────────────────────────────────────────────

/** A task given to the signed-in person, for "My tasks". */
export interface MyTask {
  id: string;
  task_no: string;
  title: string;
  details: string;
  unit: string;
  unit_am: string;
  /** Who gave it: the department head (own task) or the giving body */
  given_by: string;
  internal: boolean;
  plan_activity: string;
  priority: TaskPriority;
  due_date: string | null;
  status: TaskStatus;
  progress: number;
  /** Latest first */
  updates: TaskUpdate[];
}
