// ─────────────────────────────────────────────────────────────────────────────
// A report on a task — server only. One set of rules for the website (the
// department head, or the person the task was given to) and the Telegram bot
// (the person, who may have no website account):
//   head    "submit" sends the final report to whoever gave the task
//   person  on the department's own task, "done" sends it to the head for
//           review; on an Executive Committee task it marks their part done
//           (100 %) and tells the head, who sends the final report
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { check } from '@/lib/auth/authorize';
import { notifyLater } from '@/lib/push/send';
import { WORK_STATUSES, type TaskStatus } from './types';

const TASKS_PAGE = '/dashboard/tasks';

export interface TaskRow {
  id: string;
  task_no: string;
  title: string;
  unit_id: string;
  status: TaskStatus;
  due_date: string | null;
  created_by: string;
  internal: boolean;
  assignee_person_id: string | null;
  parent_task_id: string | null;
}

export async function loadTaskRow(db: SupabaseClient, id: string): Promise<TaskRow> {
  const r = (await db.from('tasks').select('*').eq('id', id).single().then(check)) as Record<string, unknown>;
  return {
    id: r.id as string,
    task_no: r.task_no as string,
    title: r.title as string,
    unit_id: r.unit_id as string,
    status: r.status as TaskStatus,
    due_date: (r.due_date as string) ?? null,
    created_by: r.created_by as string,
    internal: Boolean(r.internal),
    assignee_person_id: (r.assignee_person_id as string) ?? null,
    parent_task_id: (r.parent_task_id as string) ?? null,
  };
}

export interface ReportInput {
  note: string;
  progress: number;
  done: boolean;
  /** The department head (or someone who gives tasks) — otherwise the person the task was given to */
  byHead: boolean;
  authorUserId: string | null;
  authorPersonId: string | null;
  authorName: string;
}

export async function applyReport(db: SupabaseClient, task: TaskRow, r: ReportInput): Promise<{ updateId: string; submitted: boolean }> {
  if (!WORK_STATUSES.includes(task.status)) throw new Error('This task is not waiting for a report');
  const submitted = r.done && (r.byHead || task.internal);
  const progress = r.done ? 100 : Math.max(0, Math.min(100, Math.round(r.progress)));

  const moved = (await db.from('tasks')
    .update({ status: submitted ? 'SUBMITTED' : 'IN_PROGRESS', progress })
    .eq('id', task.id)
    .in('status', WORK_STATUSES)
    .select('id')
    .then(check)) as { id: string }[];
  if (!moved.length) throw new Error('This task was changed by someone else — reload and try again');

  // Someone without a website account (a report from the bot): their name goes with the note, so the history shows who
  const note = !r.authorUserId && r.authorName ? `👤 ${r.authorName}${r.note ? `: ${r.note}` : ''}` : r.note;
  const row = { task_id: task.id, author_id: r.authorUserId, kind: submitted ? 'SUBMITTED' : 'PROGRESS', note: note || null, progress };
  let res = await db.from('task_updates').insert({ ...row, author_person_id: r.authorPersonId }).select('id').single();
  // Before migration 035 there is no author_person_id
  if (res.error && /author_person_id/.test(res.error.message)) res = await db.from('task_updates').insert(row).select('id').single();
  const updateId = (check(res) as { id: string }).id;

  if (submitted) {
    notifyLater(
      { users: [task.created_by], ...(r.authorUserId ? { except: r.authorUserId } : {}) },
      {
        title: task.internal ? `${task.task_no} ተጠናቋል · Done — please review` : `${task.task_no} ሪፖርት ቀርቧል · Report submitted`,
        body: `${r.authorName ? `${r.authorName}: ` : ''}${task.title}${r.note ? ` — ${r.note.slice(0, 120)}` : ''}`,
        url: TASKS_PAGE,
        tag: `task-${task.id}`,
      }
    );
  } else if (!r.byHead) {
    // The person reported: their department's head hears about it
    notifyLater(
      { units: { ids: [task.unit_id], holding: 'TASK_REPORT' }, ...(r.authorUserId ? { except: r.authorUserId } : {}) },
      {
        title: r.done ? `${task.task_no} — ${r.authorName} ድርሻቸውን ጨርሰዋል · finished their part` : `${task.task_no} — ${progress}%`,
        body: `${r.authorName}: ${task.title}${r.note ? ` — ${r.note.slice(0, 120)}` : ''}`,
        url: TASKS_PAGE,
        tag: `task-${task.id}`,
      }
    );
  }
  return { updateId, submitted };
}
