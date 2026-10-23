// ─────────────────────────────────────────────────────────────────────────────
// Daily automation (server only — never import from a client component).
// Run once a day by GET /api/cron (an outside timer), or by "Run now" on
// Administration → Automation. Each job is safe to run again: what was sent
// is kept in automation_log (migration 038), so the same reminder never goes
// out twice — not on a second run, and not when two runs overlap.
//   repeating_tasks     the next task of each series (lib/tasks/recurring)
//   event_reminders     tomorrow's public programs → every chat connected to the bot
//   roster_reminders    tomorrow's choir service → each member on its published roster
//   vestment_reminders  vestments past their return day → the holder (again a week later)
//   library_reminders   library books: the day before the return day, then weekly while late → the borrower
//   overdue_tasks       tasks whose due date passed → their department's heads
//   dues_reminders      from the chosen day of each Ethiopian month → members who owe
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/auth/authorize';
import { notifyLater } from '@/lib/push/send';
import { escapeHtml, publicUrl, telegramConfigured, telegramToChats, telegramToPersons } from '@/lib/telegram/bot';
import { openPeriods } from '@/lib/telegram/dues-flow';
import { nonMemberIds } from '@/lib/members/membership';
import { expectedTotal, periodsLabel, toPeriod } from '@/lib/finance/dues';
import { sessionTitle, vestmentReminderText } from '@/lib/choir/service-core';
import { vestmentLabel } from '@/lib/choir/service';
import { issueRepeatingTasks } from '@/lib/tasks/recurring';
import { addDays } from '@/lib/hr/types';
import { formatEthiopianDate, isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';
import { borrowerChats, libraryText } from '@/lib/library/notify';
import {
  AUTOMATION_KEY,
  DEFAULT_AUTOMATION,
  LAST_RUN_KEY,
  type AutomationSettings,
  type JobName,
  type JobResult,
  type LastRun,
} from './types';

const e = escapeHtml;
const birr = (n: number) => `${n.toLocaleString('en-US')} ብር`;
const MIGRATION = 'Run database migration 038 (automation) first';
const missing = (m: string) => (/automation_log|is_public/.test(m) && /does not exist|schema cache/.test(m) ? MIGRATION : m);
/** Overdue tasks older than this are not announced (e.g. on the very first run) */
const OVERDUE_WINDOW_DAYS = 14;
/** A vestment holder is reminded again after this many days */
const VESTMENT_REPEAT_DAYS = 7;
/** Members whose dues are worked out at the same time */
const DUES_BATCH = 8;

export async function loadAutomation(db: SupabaseClient): Promise<AutomationSettings> {
  const { data } = await db.from('system_settings').select('value').eq('key', AUTOMATION_KEY).maybeSingle();
  return { ...DEFAULT_AUTOMATION, ...((data as { value?: Partial<AutomationSettings> } | null)?.value ?? {}) };
}

export async function loadLastRun(db: SupabaseClient): Promise<LastRun | null> {
  const { data } = await db.from('system_settings').select('value').eq('key', LAST_RUN_KEY).maybeSingle();
  return ((data as { value?: LastRun } | null)?.value as LastRun | undefined) ?? null;
}

/**
 * Marks these refs as done for the job and returns the ones that were not
 * done before — only those may be sent. ON CONFLICT DO NOTHING returns just
 * the new rows, so two runs at once cannot both send.
 */
async function claim(db: SupabaseClient, job: JobName, refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const { data, error } = await db.from('automation_log')
    .upsert(refs.map((ref) => ({ job, ref })), { onConflict: 'job,ref', ignoreDuplicates: true })
    .select('ref');
  if (error) throw new Error(missing(error.message));
  return new Set(((data ?? []) as { ref: string }[]).map((r) => r.ref));
}

const when = (date: string, time: string | null) => `${formatEthiopianDate(date, 'am')}${time ? ` · ${time.slice(0, 5)}` : ''}`;

// ── The jobs ─────────────────────────────────────────────────────────────────

async function eventReminders(db: SupabaseClient, today: string): Promise<number> {
  const tomorrow = addDays(today, 1);
  const { data, error } = await db.from('programs')
    .select('id, title_en, title_am, start_time, location')
    .eq('is_public', true)
    .in('status', ['PLANNED', 'CONFIRMED'])
    .eq('start_date', tomorrow)
    .order('start_time');
  if (error) throw new Error(missing(error.message));
  const programs = (data ?? []) as { id: string; title_en: string; title_am: string | null; start_time: string | null; location: string | null }[];
  const fresh = await claim(db, 'event_reminders', programs.map((p) => `${p.id}:${tomorrow}`));
  const due = programs.filter((p) => fresh.has(`${p.id}:${tomorrow}`));
  if (due.length === 0) return 0;

  const links = await selectAll<{ chat_id: number }>((a, b) => db.from('telegram_links').select('chat_id').order('chat_id').range(a, b));
  const chats = new Set(links.map((l) => Number(l.chat_id)));
  const html = [
    `🔔 <b>${e('ነገ · Tomorrow')}</b> — ${e(formatEthiopianDate(tomorrow, 'am'))}`,
    '',
    ...due.map((p) => e(`• ${p.start_time ? `${p.start_time.slice(0, 5)} — ` : ''}${p.title_am || p.title_en}${p.title_am && p.title_am !== p.title_en ? ` · ${p.title_en}` : ''}${p.location ? ` (${p.location})` : ''}`)),
    '',
    await publicUrl('/events'),
  ].join('\n');
  return (await telegramToChats(db, chats, html)).delivered;
}

async function rosterReminders(db: SupabaseClient, today: string): Promise<number> {
  const tomorrow = addDays(today, 1);
  const { data: sessions } = await db.from('choir_sessions')
    .select('id, title, kind, session_date, start_time, location')
    .eq('session_date', tomorrow)
    .eq('status', 'PLANNED')
    .eq('roster_status', 'PUBLISHED');
  const byId = new Map(((sessions ?? []) as { id: string; title: string | null; kind: string; session_date: string; start_time: string | null; location: string | null }[]).map((s) => [s.id, s]));
  if (byId.size === 0) return 0;
  const { data: rows } = await db.from('service_roster')
    .select('id, session_id, role, response, member:choir_members(person_id)')
    .in('session_id', [...byId.keys()])
    .neq('response', 'DECLINED');
  const entries = ((rows ?? []) as unknown as { id: string; session_id: string; role: string | null; response: string; member: { person_id: string } | null }[]).filter((r) => r.member);
  const fresh = await claim(db, 'roster_reminders', entries.map((r) => r.id));
  let delivered = 0;
  for (const r of entries.filter((x) => fresh.has(x.id))) {
    const s = byId.get(r.session_id)!;
    const lines = [
      `🎵 <b>${e('ነገ አገልግሎት አለብዎ · You serve tomorrow')}</b>`,
      e(`${sessionTitle(s)} — ${when(s.session_date, s.start_time)}${s.location ? ` (${s.location})` : ''}`),
    ];
    if (r.role) lines.push(e(`ድርሻ · Role: ${r.role}`));
    if (r.response === 'PENDING') lines.push('', e('እባክዎ በ«🎵 ምደባዬ» ያረጋግጡ። · Please confirm in “🎵 My roster”.'));
    delivered += (await telegramToPersons(db, [r.member!.person_id], lines.join('\n'), 'SELF')).delivered;
  }
  return delivered;
}

async function vestmentReminders(db: SupabaseClient, today: string): Promise<number> {
  const again = new Date(Date.now() - VESTMENT_REPEAT_DAYS * 86_400_000).toISOString();
  const { data } = await db.from('vestment_loans')
    .select('id, person_id, due_on, reminded_at, vestment:vestments(code, kind, size)')
    .is('returned_at', null)
    .lt('due_on', today);
  const rows = ((data ?? []) as unknown as { id: string; person_id: string; due_on: string; reminded_at: string | null; vestment: { code: string; kind: string; size: string | null } | null }[])
    .filter((r) => !r.reminded_at || r.reminded_at < again);
  if (rows.length === 0) return 0;
  // Marked first: a second run at the same time finds nothing left to remind
  const { data: marked } = await db.from('vestment_loans')
    .update({ reminded_at: new Date().toISOString() })
    .in('id', rows.map((r) => r.id))
    .or(`reminded_at.is.null,reminded_at.lt.${again}`)
    .select('id');
  const mine = new Set(((marked ?? []) as { id: string }[]).map((r) => r.id));
  const byPerson = new Map<string, { vestment: string; due_on: string }[]>();
  for (const r of rows.filter((x) => mine.has(x.id))) {
    byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), { vestment: r.vestment ? vestmentLabel(r.vestment) : '—', due_on: r.due_on }]);
  }
  let delivered = 0;
  for (const [personId, items] of byPerson) delivered += (await telegramToPersons(db, [personId], vestmentReminderText(items), 'SELF')).delivered;
  return delivered;
}

/**
 * Library books at home (migration 043): the day before the return day a
 * reminder, then on the first late day and once a week while still out.
 * A student's parents get them too (lib/library/notify).
 */
async function libraryReminders(db: SupabaseClient, today: string): Promise<number | JobResult> {
  const tomorrow = addDays(today, 1);
  const { data, error } = await db.from('library_loans')
    .select('id, due_date, borrower_person_id, borrower:persons!library_loans_borrower_fkey(full_name_en, full_name_am), book:library_books!library_loans_book_fkey(title)')
    .eq('status', 'OUT')
    .eq('kind', 'HOME')
    .lte('due_date', tomorrow);
  if (error) {
    if (/library_loans/.test(error.message)) return { job: 'library_reminders', count: 0, note: 'Run database migration 043 (library) first' };
    throw new Error(error.message);
  }
  const loans = (data ?? []) as unknown as {
    id: string; due_date: string; borrower_person_id: string; borrower: { full_name_en: string; full_name_am: string | null } | null; book: { title: string } | null;
  }[];
  const refOf = (l: (typeof loans)[number]) => {
    if (l.due_date === tomorrow) return `${l.id}:due:${l.due_date}`;
    if (l.due_date >= today) return null;
    const late = Math.round((Date.parse(today) - Date.parse(l.due_date)) / 86_400_000);
    return `${l.id}:late:${l.due_date}:${Math.floor((late - 1) / 7)}`;
  };
  const wanted = loans.map((l) => ({ l, ref: refOf(l) })).filter((x): x is { l: (typeof loans)[number]; ref: string } => Boolean(x.ref));
  const fresh = await claim(db, 'library_reminders', wanted.map((x) => x.ref));
  let delivered = 0;
  for (const { l, ref } of wanted.filter((x) => fresh.has(x.ref))) {
    const name = l.borrower?.full_name_am || l.borrower?.full_name_en || '';
    const title = l.book?.title ?? '';
    const late = Math.round((Date.parse(today) - Date.parse(l.due_date)) / 86_400_000);
    const html = ref.includes(':due:')
      ? libraryText({ kind: 'DUE_TOMORROW', title, due: l.due_date }, name)
      : libraryText({ kind: 'LATE', title, due: l.due_date, days: late }, name);
    delivered += (await telegramToChats(db, await borrowerChats(db, l.borrower_person_id), html)).delivered;
  }
  return delivered;
}

async function overdueTasks(db: SupabaseClient, today: string): Promise<number> {
  const { data } = await db.from('tasks')
    .select('id, task_no, title, unit_id, due_date')
    .in('status', ['ASSIGNED', 'IN_PROGRESS', 'RETURNED'])
    .lt('due_date', today)
    .gte('due_date', addDays(today, -OVERDUE_WINDOW_DAYS))
    .order('due_date');
  const tasks = (data ?? []) as { id: string; task_no: string; title: string; unit_id: string; due_date: string }[];
  const fresh = await claim(db, 'overdue_tasks', tasks.map((t) => t.id));
  const byUnit = new Map<string, typeof tasks>();
  for (const t of tasks.filter((x) => fresh.has(x.id))) byUnit.set(t.unit_id, [...(byUnit.get(t.unit_id) ?? []), t]);
  for (const [unitId, list] of byUnit) {
    const names = list.slice(0, 3).map((t) => `${t.task_no} ${t.title}`).join(' · ');
    notifyLater(
      { units: { ids: [unitId], holding: 'TASK_REPORT' } },
      {
        title: '⏰ ጊዜው ያለፈ ተግባር · Overdue tasks',
        body: `${list.length} — ${names}${list.length > 3 ? ' …' : ''}`,
        url: '/dashboard/tasks',
        tag: `overdue-${unitId}`,
      }
    );
  }
  return [...byUnit.values()].reduce((n, l) => n + l.length, 0);
}

async function duesReminders(db: SupabaseClient, today: string, settings: AutomationSettings): Promise<JobResult> {
  const now = isoToEthiopian(today);
  // No dues in Pagume (month 13)
  if (!now || now.month > 12) return { job: 'dues_reminders', count: 0, note: 'No dues this month' };
  if (now.day < settings.dues_day) return { job: 'dues_reminders', count: 0, note: `Starts on day ${settings.dues_day} of the month` };
  const period = toPeriod(now.year, now.month);

  // Members connected to the bot as themselves, who pay dues (not honorary, not student-only / parents' records)
  let res = await selectAll<{ person_id: string; relation?: string }>((a, b) => db.from('telegram_links').select('person_id, relation').order('id').range(a, b)).catch(() => null);
  if (!res) res = await selectAll<{ person_id: string }>((a, b) => db.from('telegram_links').select('person_id').order('id').range(a, b));
  const linked = [...new Set(res.filter((l) => l.relation !== 'GUARDIAN').map((l) => l.person_id))];
  if (linked.length === 0) return { job: 'dues_reminders', count: 0 };
  const notMembers = await nonMemberIds(db, linked);
  const people: { id: string; name: string }[] = [];
  for (let i = 0; i < linked.length; i += 200) {
    const { data } = await db.from('persons')
      .select('id, full_name_en, full_name_am, membership_type')
      .in('id', linked.slice(i, i + 200))
      .eq('status', 'ACTIVE');
    for (const p of (data ?? []) as { id: string; full_name_en: string; full_name_am: string | null; membership_type: string | null }[]) {
      if (!notMembers.has(p.id) && p.membership_type !== 'HONORARY') people.push({ id: p.id, name: p.full_name_am || p.full_name_en });
    }
  }

  // Who owes this month — and was not reminded for it yet
  const owing: { id: string; name: string; periods: number[]; total: number | null }[] = [];
  for (let i = 0; i < people.length; i += DUES_BATCH) {
    await Promise.all(
      people.slice(i, i + DUES_BATCH).map(async (p) => {
        const { available, due_now, rates } = await openPeriods(db, p.id, today);
        if (due_now === 0) return;
        const periods = available.slice(0, due_now);
        owing.push({ ...p, periods, total: expectedTotal(periods, Object.fromEntries(Object.entries(rates).map(([y, r]) => [Number(y), r]))) });
      })
    );
  }
  const fresh = await claim(db, 'dues_reminders', owing.map((p) => `${p.id}:${period}`));
  let delivered = 0;
  for (const p of owing.filter((x) => fresh.has(`${x.id}:${period}`))) {
    const lines = [
      `🧾 <b>${e('የወርሃዊ መዋጮ ማስታወሻ · Monthly dues reminder')}</b> — ${e(p.name)}`,
      e(`ያልተከፈሉ ወራት · Unpaid months: ${periodsLabel(p.periods.slice(0, 8))}${p.periods.length > 8 ? '…' : ''} (${p.periods.length})`),
    ];
    if (p.total !== null) lines.push(e(`ድምር · Total: ${birr(p.total)}`));
    lines.push('', e('ከከፈሉ በኋላ «💳 ከፍያለሁ» ይጫኑ። ከፍለው ከሆነ ይህን ይተዉት። · After paying, tap “💳 I paid”. Already paid? Please ignore this.'));
    delivered += (await telegramToPersons(db, [p.id], lines.join('\n'), 'SELF')).delivered;
  }
  return { job: 'dues_reminders', count: delivered };
}

// ── One run ──────────────────────────────────────────────────────────────────

/** Runs every job that is turned on, and keeps what each did for the Automation page. */
export async function runDaily(db: SupabaseClient, trigger: LastRun['trigger']): Promise<LastRun> {
  const today = todayIso();
  const settings = await loadAutomation(db);
  const results: JobResult[] = [];
  const run = async (job: JobName, enabled: boolean, work: () => Promise<number | JobResult>, needsBot = true) => {
    if (!enabled) return results.push({ job, count: 0, note: 'Turned off' });
    if (needsBot && !(await telegramConfigured())) return results.push({ job, count: 0, note: 'The Telegram bot is not set up' });
    try {
      const out = await work();
      results.push(typeof out === 'number' ? { job, count: out } : out);
    } catch (err) {
      console.error(`automation ${job} failed`, err);
      results.push({ job, count: 0, error: true, note: missing(err instanceof Error ? err.message : 'Failed') });
    }
  };

  await run('repeating_tasks', true, () => issueRepeatingTasks(db), false);
  await run('event_reminders', settings.event_reminders, () => eventReminders(db, today));
  await run('roster_reminders', settings.roster_reminders, () => rosterReminders(db, today));
  await run('vestment_reminders', settings.vestment_reminders, () => vestmentReminders(db, today));
  await run('library_reminders', settings.library_reminders, () => libraryReminders(db, today));
  // Push and/or Telegram — notifyLater sends by whichever is set up
  await run('overdue_tasks', settings.overdue_tasks, () => overdueTasks(db, today), false);
  await run('dues_reminders', settings.dues_reminders, () => duesReminders(db, today, settings));

  // The log only needs to outlive the reminders it guards
  await db.from('automation_log').delete().lt('done_on', addDays(today, -400));
  const last: LastRun = { at: new Date().toISOString(), trigger, results };
  await db.from('system_settings').upsert({ key: LAST_RUN_KEY, value: last, updated_at: last.at }, { onConflict: 'key' });
  return last;
}
