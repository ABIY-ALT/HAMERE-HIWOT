// ─────────────────────────────────────────────────────────────────────────────
// "🗂️ My tasks" in the Telegram bot — server only (migration 035). A member
// sees the tasks their department gave them and reports progress, even with
// no website account. Same rules as the website (lib/tasks/report). Steps,
// kept in telegram_sessions:
//   TASK_PICK      which task (one button each)
//   TASK_PROGRESS  how far: 25 / 50 / 75 %, or done
//   TASK_NOTE      a short note (or skip)
// Every step checks again that the task is still given to one of this chat's
// own people.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { applyReport, loadTaskRow } from '@/lib/tasks/report';
import { WORK_STATUSES, type TaskStatus } from '@/lib/tasks/types';

const e = escapeHtml;
const DONE = '✅ ጨርሻለሁ · Done';
const SKIP = '⏭ ዝለል · Skip';
const STEPS = ['25%', '50%', '75%'];

export interface TasksData {
  tasks?: { id: string; button: string }[];
  task_id?: string;
  person_id?: string;
  progress?: number;
  done?: boolean;
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, step: 'TASK_PICK' | 'TASK_PROGRESS' | 'TASK_NOTE', data: TasksData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

const STATUS_AM: Record<string, string> = {
  ASSIGNED: 'አዲስ · new',
  IN_PROGRESS: 'በሂደት ላይ · in progress',
  RETURNED: 'ተመልሷል · sent back',
  SUBMITTED: 'ግምገማ ይጠብቃል · waiting for review',
};

/** "🗂️ My tasks": the open tasks given to this chat's own people. */
export async function startTasks(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>) {
  if (scope.memberPersonIds.length === 0) return sendTelegram(chatId, e('ይህ ቻት ከአባል ጋር አልተያያዘም። · This chat is not linked to a member.'), menu);
  const { data, error } = await db.from('tasks')
    .select('id, task_no, title, due_date, status, progress')
    .in('assignee_person_id', scope.memberPersonIds)
    .in('status', ['ASSIGNED', 'IN_PROGRESS', 'RETURNED', 'SUBMITTED'])
    .order('due_date', { ascending: true })
    .limit(10);
  if (error) return sendTelegram(chatId, e('ተግባሮች ገና አልተዘጋጁም። · Tasks are not set up yet.'), menu);
  const rows = (data ?? []) as { id: string; task_no: string; title: string; due_date: string | null; status: TaskStatus; progress: number }[];
  if (rows.length === 0) return sendTelegram(chatId, e('✅ አሁን የተሰጠዎት ተግባር የለም። · You have no open tasks.'), menu);

  const lines = ['🗂️ <b>ተግባሮቼ · My tasks</b>', ''];
  for (const r of rows) {
    lines.push(`🔹 <b>${e(r.task_no)}</b> ${e(r.title)}`);
    lines.push(e(`    ${r.due_date ? `📅 ${formatEthiopianDate(r.due_date, 'am')} · ` : ''}${r.progress}% · ${STATUS_AM[r.status] ?? r.status}`));
  }
  lines.push('', e('ሂደቱን ለማሳወቅ ተግባሩን ይጫኑ። · Tap a task to report progress.'));
  const tasks = rows.map((r) => ({ id: r.id, button: `🗂️ ${r.task_no}` }));
  await save(db, chatId, 'TASK_PICK', { tasks });
  return sendTelegram(chatId, lines.join('\n'), keyboard([...tasks.map((x) => [x.button]), [CANCEL]]));
}

/** The task, if it is still given to one of this chat's own people. */
async function ownTask(db: SupabaseClient, taskId: string, scope: ChatScope) {
  const task = await loadTaskRow(db, taskId).catch(() => null);
  if (!task || !task.assignee_person_id || !scope.memberPersonIds.includes(task.assignee_person_id)) return null;
  return task;
}

export async function continueTasks(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: TasksData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>
) {
  const { step, data } = session;
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }

  if (step === 'TASK_PICK') {
    const picked = data.tasks?.find((x) => x.button === text);
    if (!picked) return sendTelegram(chatId, e('ከአዝራሮቹ ተግባር ይምረጡ። · Choose a task from the buttons.'));
    const task = await ownTask(db, picked.id, scope);
    if (!task) {
      await clearSession(db, chatId);
      return sendTelegram(chatId, e('ይህ ተግባር ከእንግዲህ የእርስዎ አይደለም። · This task is no longer yours.'), menu);
    }
    if (!WORK_STATUSES.includes(task.status)) {
      await clearSession(db, chatId);
      return sendTelegram(chatId, e('⏳ ጨርሻለሁ ብለዋል — ኃላፊዎ እስኪገመግሙ ይጠብቃል። · You said it is done — waiting for your head to review it.'), menu);
    }
    const { data: full } = await db.from('tasks').select('details, progress').eq('id', task.id).maybeSingle();
    const f = full as { details: string | null; progress: number } | null;
    const { data: back } = await db.from('task_updates').select('note').eq('task_id', task.id).eq('kind', 'RETURNED').order('created_at', { ascending: false }).limit(1);
    const returned = task.status === 'RETURNED' ? ((back ?? []) as { note: string | null }[])[0]?.note : null;
    await save(db, chatId, 'TASK_PROGRESS', { task_id: task.id, person_id: task.assignee_person_id! });
    const lines = [`🗂️ <b>${e(task.task_no)}</b> — ${e(task.title)}`];
    if (f?.details) lines.push(e(f.details.slice(0, 600)));
    if (task.due_date) lines.push(e(`📅 ${formatEthiopianDate(task.due_date, 'am')}`));
    lines.push(e(`📊 ${f?.progress ?? 0}%`));
    if (returned) lines.push(e(`↩ ተመልሷል · Sent back: ${returned}`));
    lines.push('', e('የት ደረሱ? · How far are you?'));
    return sendTelegram(chatId, lines.join('\n'), keyboard([STEPS, [DONE], [CANCEL]]));
  }

  if (step === 'TASK_PROGRESS') {
    const done = text === DONE;
    const pct = done ? 100 : STEPS.includes(text) ? parseInt(text, 10) : NaN;
    if (!Number.isFinite(pct)) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
    await save(db, chatId, 'TASK_NOTE', { ...data, progress: pct, done });
    return sendTelegram(chatId, e('ምን ሠሩ? በአጭሩ ይጻፉ (ወይም ዝለል)። · What did you do? Write a short note (or skip).'), keyboard([[SKIP], [CANCEL]]));
  }

  // TASK_NOTE
  const task = await ownTask(db, data.task_id!, scope);
  await clearSession(db, chatId);
  if (!task || task.assignee_person_id !== data.person_id) return sendTelegram(chatId, e('ይህ ተግባር ከእንግዲህ የእርስዎ አይደለም። · This task is no longer yours.'), menu);
  const [{ data: person }, { data: account }] = await Promise.all([
    db.from('persons').select('full_name_en, full_name_am').eq('id', data.person_id!).maybeSingle(),
    db.from('system_users').select('id').eq('person_id', data.person_id!).eq('is_active', true).limit(1),
  ]);
  const p = person as { full_name_en: string; full_name_am: string | null } | null;
  const res = await applyReport(db, task, {
    note: text === SKIP ? '' : text.trim().slice(0, 2000),
    progress: data.progress ?? 0,
    done: Boolean(data.done),
    byHead: false,
    authorUserId: ((account ?? []) as { id: string }[])[0]?.id ?? null,
    authorPersonId: data.person_id!,
    authorName: p?.full_name_am || p?.full_name_en || '',
  });
  return sendTelegram(
    chatId,
    e(
      data.done
        ? res.submitted
          ? '✅ ለኃላፊዎ ለግምገማ ተልኳል። · Sent to your head for review.'
          : '✅ ድርሻዎ ተጠናቋል ተብሏል — ኃላፊዎ ተነግሯቸዋል። · Your part is marked done — your head was told.'
        : `✅ ተቀምጧል፦ ${data.progress}% · Saved: ${data.progress}%`
    ),
    menu
  );
}
