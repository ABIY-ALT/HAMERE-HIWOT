'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Tasks — work given to departments and the reports that come back.
//
//   assign   (TASK_ASSIGN)                        → ASSIGNED, one task per unit
//   report   (TASK_REPORT in that unit, or        → IN_PROGRESS (progress note)
//             TASK_ASSIGN recording it for them)  → SUBMITTED   (final report)
//   review   (TASK_ASSIGN, SUBMITTED)             → COMPLETED | RETURNED
//   cancel   (TASK_ASSIGN, not finished)          → CANCELLED
//   remind   (TASK_ASSIGN, waiting on the unit)   → push to the unit's heads
//   repeat   (TASK_ASSIGN)                        → task_series; the next one is
//             given automatically (lib/tasks/recurring.ts)
//   files    (anyone who may report)              → private bucket "task-files",
//             opened through /dashboard/tasks/files/[id]
// People inside a department (migration 035):
//   hand     (the unit's head, TASK_ASSIGN)        → the person in the department doing it
//   own task (the unit's head)                     → a task for its own people (internal):
//             the head reviews it; it can be part of a bigger task or of a plan activity
//   report   (the person the task was given to)   → progress; "done" goes to the head
//             (website "My tasks" or the bot "🗂️ My tasks", lib/tasks/report)
// Every step is kept in task_updates.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorizeIn, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import { tenantPath } from '@/lib/tenant/db';
import type { SessionUser } from '@/lib/auth/session';
import { notifyLater } from '@/lib/push/send';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { issueRepeatingTasks } from '@/lib/tasks/recurring';
import { inUnit, tellPerson, unitPeople } from '@/lib/tasks/people';
import { applyReport, loadTaskRow, type TaskRow } from '@/lib/tasks/report';
import {
  ASSIGNEE_TYPES,
  FILE_TYPES,
  MAX_FILE_BYTES,
  nextDue,
  OPEN_STATUSES,
  WORK_STATUSES,
  type Frequency,
  type Task,
  type MyTask,
  type TaskFile,
  type TaskPriority,
  type TaskSeries,
  type TaskSource,
  type TaskStatus,
  type TaskUnit,
  type TasksData,
  type UpdateKind,
} from '@/lib/tasks/types';

type Db = Awaited<ReturnType<typeof authorizeIn>>['db'];
type Row = Record<string, unknown> & { id: string };
type ByUser = { person?: { full_name_en?: string | null } | null } | null;
type UnitName = { name_en?: string; name_am?: string | null } | null;

const optionalDate = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date');
const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const personName = (u: unknown) => (u as ByUser)?.person?.full_name_en ?? '';
const TASKS_PAGE = '/dashboard/tasks';
const MY_TASKS_PAGE = '/dashboard/my-tasks';

function missingTables(message: string) {
  if (/task_series|task_files|series_id|[Bb]ucket not found/.test(message)) {
    return 'Run database migration 020 (repeating tasks and files) first';
  }
  return /task/.test(message) && /schema cache|does not exist/.test(message)
    ? 'Run database migration 019 (tasks) first'
    : message;
}

/** Sees every task; others see only their units' tasks. */
const seesAll = (me: SessionUser) => me.permissions.includes('TASK_ASSIGN') || me.permissions.includes('AUDIT_VIEW_ALL');

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadTasks(): Promise<Loaded<TasksData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT', 'AUDIT_VIEW_ALL');
    const unitRows = (await db.from('organization_units')
      .select('id, name_en, name_am, unit_type')
      .eq('is_active', true)
      .order('sort_order')
      .then(check)) as { id: string; name_en: string; name_am: string | null; unit_type: string }[];
    const units: TaskUnit[] = unitRows.map((u) => ({ id: u.id, name_en: u.name_en, name_am: u.name_am || u.name_en, type: u.unit_type }));

    const mine = me.organizationIds.filter(isUuid);
    if (!seesAll(me) && mine.length === 0) return { mode: 'live', data: { tasks: [], units, series: [], people: {} } };

    await issueRepeatingTasks(db);

    const rows = await selectAll<Row>((a, b) => {
      let q = db.from('tasks')
        .select('*, unit:organization_units!tasks_unit_id_fkey(name_en, name_am), from_unit:organization_units!tasks_from_unit_id_fkey(name_en, name_am), creator:system_users!tasks_created_by_fkey(person:persons!system_users_person_id_fkey(full_name_en)), updates:task_updates(id, kind, note, progress, created_at, author:system_users!task_updates_author_id_fkey(person:persons!system_users_person_id_fkey(full_name_en)))')
        .order('created_at', { ascending: false })
        .order('id');
      if (!seesAll(me)) q = q.in('unit_id', mine);
      return q.range(a, b);
    });

    // Repeats and files come from migration 020; before it they are simply empty
    const [seriesRows, fileRows] = await Promise.all([
      selectAll<Row>((a, b) => {
        let q = db.from('task_series')
          .select('id, title, unit_id, frequency, next_due, is_active, unit:organization_units!task_series_unit_id_fkey(name_en, name_am), creator:system_users!task_series_created_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
          .eq('is_active', true)
          .order('next_due')
          .order('id');
        if (!seesAll(me)) q = q.in('unit_id', mine);
        return q.range(a, b);
      }).catch(() => [] as Row[]),
      selectAll<Row>((a, b) => {
        let q = db.from('task_files')
          .select('id, task_id, update_id, file_name, mime_type, size_bytes, uploaded_by, created_at, uploader:system_users!task_files_uploaded_by_fkey(person:persons!system_users_person_id_fkey(full_name_en)), task:tasks!inner(unit_id)')
          .order('created_at')
          .order('id');
        if (!seesAll(me)) q = q.in('task.unit_id', mine);
        return q.range(a, b);
      }).catch(() => [] as Row[]),
    ]);

    const series: TaskSeries[] = seriesRows.map((s) => {
      const unit = s.unit as UnitName;
      return {
        id: s.id,
        title: s.title as string,
        unit_id: s.unit_id as string,
        unit: unit?.name_en ?? '—',
        unit_am: unit?.name_am || unit?.name_en || '—',
        frequency: s.frequency as Frequency,
        next_due: s.next_due as string,
        is_active: Boolean(s.is_active),
        created_by: personName(s.creator) || '—',
      };
    });
    const repeatsOf = new Map(series.map((s) => [s.id, s.frequency]));

    // People (migration 035): who does each task, its plan activity, its parts
    const assigneeIds = [...new Set(rows.map((r) => r.assignee_person_id as string).filter(Boolean))];
    const activityIds = [...new Set(rows.map((r) => r.plan_activity_id as string).filter(Boolean))];
    const peopleUnits = seesAll(me) ? units.filter((u) => ASSIGNEE_TYPES.includes(u.type)).map((u) => u.id) : mine;
    const [assigneeRows, activityRows, people] = await Promise.all([
      assigneeIds.length ? db.from('persons').select('id, full_name_en, full_name_am').in('id', assigneeIds) : Promise.resolve({ data: [] }),
      activityIds.length ? db.from('plan_activities').select('id, title').in('id', activityIds) : Promise.resolve({ data: [] }),
      unitPeople(db, peopleUnits),
    ]);
    const assigneeName = new Map(((assigneeRows.data ?? []) as { id: string; full_name_en: string; full_name_am: string | null }[]).map((x) => [x.id, x.full_name_am || x.full_name_en]));
    const activityTitle = new Map(((activityRows.data ?? []) as { id: string; title: string }[]).map((x) => [x.id, x.title]));
    const taskNo = new Map(rows.map((r) => [r.id, r.task_no as string]));
    const partsOf = new Map<string, { total: number; done: number }>();
    for (const r of rows) {
      if (!r.parent_task_id || r.status === 'CANCELLED') continue;
      const c = partsOf.get(r.parent_task_id as string) ?? { total: 0, done: 0 };
      c.total += 1;
      if (r.status === 'COMPLETED') c.done += 1;
      partsOf.set(r.parent_task_id as string, c);
    }
    const filesOf = new Map<string, TaskFile[]>();
    for (const f of fileRows) {
      const list = filesOf.get(f.task_id as string) ?? [];
      list.push({
        id: f.id,
        update_id: (f.update_id as string) ?? null,
        name: f.file_name as string,
        mime: f.mime_type as string,
        size: Number(f.size_bytes),
        uploaded_by: personName(f.uploader) || '—',
        uploaded_by_id: (f.uploaded_by as string) ?? '',
        at: f.created_at as string,
      });
      filesOf.set(f.task_id as string, list);
    }

    const tasks: Task[] = rows.map((r) => {
      const unit = r.unit as UnitName;
      const from = r.from_unit as UnitName;
      const updates = ((r.updates ?? []) as Row[])
        .map((u) => ({
          id: u.id,
          kind: u.kind as UpdateKind,
          note: (u.note as string) ?? '',
          progress: u.progress === null || u.progress === undefined ? null : Number(u.progress),
          author: personName(u.author),
          at: u.created_at as string,
        }))
        .sort((x, y) => x.at.localeCompare(y.at));
      return {
        id: r.id,
        task_no: r.task_no as string,
        title: r.title as string,
        details: (r.details as string) ?? '',
        from_unit_id: (r.from_unit_id as string) ?? null,
        from_unit: from?.name_en ?? '',
        from_unit_am: from?.name_am || from?.name_en || '',
        unit_id: r.unit_id as string,
        unit: unit?.name_en ?? '—',
        unit_am: unit?.name_am || unit?.name_en || '—',
        source: r.source as TaskSource,
        meeting_title: (r.meeting_title as string) ?? '',
        meeting_date: (r.meeting_date as string) ?? null,
        decision_ref: (r.decision_ref as string) ?? '',
        priority: r.priority as TaskPriority,
        due_date: (r.due_date as string) ?? null,
        status: r.status as TaskStatus,
        progress: Number(r.progress) || 0,
        created_by_id: r.created_by as string,
        created_by: personName(r.creator) || '—',
        completed_at: (r.completed_at as string) ?? null,
        created_at: r.created_at as string,
        updates,
        files: filesOf.get(r.id) ?? [],
        series_id: (r.series_id as string) ?? null,
        repeats: repeatsOf.get(r.series_id as string) ?? null,
        assignee_id: (r.assignee_person_id as string) ?? null,
        assignee: assigneeName.get(r.assignee_person_id as string) ?? '',
        internal: Boolean(r.internal),
        parent_task_id: (r.parent_task_id as string) ?? null,
        parent_task_no: taskNo.get(r.parent_task_id as string) ?? '',
        plan_activity_id: (r.plan_activity_id as string) ?? null,
        plan_activity: activityTitle.get(r.plan_activity_id as string) ?? '',
        parts: partsOf.get(r.id) ?? { total: 0, done: 0 },
      };
    });

    return { mode: 'live', data: { tasks, units, series, people } };
  } catch (e) {
    return { mode: 'error', error: missingTables(errorMessage(e)) };
  }
}

// ── Assign ───────────────────────────────────────────────────────────────────

const TaskSchema = z
  .object({
    title: z.string().trim().min(3, 'Write what has to be done'),
    details: z.string().trim(),
    from_unit_id: z.string(),
    source: z.enum(['ROUTINE', 'MEETING']),
    meeting_title: z.string().trim(),
    meeting_date: optionalDate,
    decision_ref: z.string().trim(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    due_date: optionalDate,
  })
  .refine((t) => t.source === 'ROUTINE' || t.meeting_title.length >= 2, 'Name the meeting the decision came from')
  .refine((t) => t.source === 'ROUTINE' || t.meeting_date !== '', 'Enter the date of the meeting');

export type TaskInput = z.input<typeof TaskSchema>;

function taskFields(t: z.output<typeof TaskSchema>) {
  const meeting = t.source === 'MEETING';
  return {
    title: t.title,
    details: t.details || null,
    from_unit_id: t.from_unit_id || null,
    source: t.source,
    meeting_title: meeting ? t.meeting_title : null,
    meeting_date: meeting ? t.meeting_date : null,
    decision_ref: meeting ? t.decision_ref || null : null,
    priority: t.priority,
    due_date: t.due_date || null,
  };
}

/** Units that may be given tasks. */
async function checkUnits(db: Db, ids: string[]) {
  const rows = (await db.from('organization_units')
    .select('id, unit_type, is_active')
    .in('id', ids)
    .then(check)) as { id: string; unit_type: string; is_active: boolean }[];
  if (rows.length !== ids.length || rows.some((u) => !u.is_active || !ASSIGNEE_TYPES.includes(u.unit_type))) {
    throw new Error('One of the chosen departments cannot be given tasks');
  }
}

const dueText = (due: string | null) => (due ? ` · ${due}` : '');

/**
 * Gives the same task to each chosen unit (one task per unit, followed up
 * separately). With `repeat`, each unit also gets a series that gives the
 * task again after this due date.
 */
export async function assignTasks(
  input: TaskInput & { unit_ids: string[]; repeat: Frequency | '' }
): Promise<{ ok: true; taskNos: string[] } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN');
    const t = TaskSchema.parse(input);
    const unitIds = z.array(z.string()).min(1, 'Choose at least one department').max(100).parse([...new Set(input.unit_ids)]);
    const repeat = z.enum(['', 'WEEKLY', 'MONTHLY', 'QUARTERLY']).parse(input.repeat);
    if (repeat && !t.due_date) throw new Error('A repeating task needs a due date');
    await checkUnits(db, unitIds);

    const fields = taskFields(t);
    const seriesOf = new Map<string, string>();
    if (repeat) {
      const series = (await db.from('task_series')
        .insert(unitIds.map((unit_id) => ({
          ...fields,
          unit_id,
          frequency: repeat,
          next_due: nextDue(t.due_date, repeat),
          created_by: me.systemUser.id,
        })))
        .select('id, unit_id')
        .then(check)) as { id: string; unit_id: string }[];
      for (const s of series) seriesOf.set(s.unit_id, s.id);
    }
    const created = (await db.from('tasks')
      .insert(unitIds.map((unit_id) => ({ ...fields, unit_id, created_by: me.systemUser.id, ...(repeat ? { series_id: seriesOf.get(unit_id) } : {}) })))
      .select('id, task_no, unit_id')
      .then(check)) as { id: string; task_no: string; unit_id: string }[];

    for (const row of created) {
      notifyLater(
        { units: { ids: [row.unit_id], holding: 'TASK_REPORT' }, except: me.systemUser.id },
        { title: 'አዲስ ተግባር · New task', body: `${row.task_no} — ${t.title}${dueText(fields.due_date)}`, url: TASKS_PAGE, tag: `task-${row.id}` }
      );
    }
    return { ok: true, taskNos: created.map((r) => r.task_no) };
  } catch (e) {
    return { ok: false, error: missingTables(errorMessage(e)) };
  }
}

/** Moves a task from one of the expected statuses; fails if someone else changed it first. */
async function moveTask(db: Db, id: string, from: TaskStatus[], patch: Record<string, unknown>) {
  const updated = (await db.from('tasks').update(patch).eq('id', id).in('status', from).select('id').then(check)) as { id: string }[];
  if (!updated.length) throw new Error('This task was changed by someone else — reload and try again');
}

async function logUpdate(db: Db, me: SessionUser, taskId: string, kind: UpdateKind, note: string, progress: number | null = null) {
  const row = (await db.from('task_updates')
    .insert({ task_id: taskId, author_id: me.systemUser.id, kind, note: note || null, progress })
    .select('id')
    .single()
    .then(check)) as { id: string };
  return row.id;
}

/** The unit's own reporters, or anyone who gives tasks (e.g. the secretary recording a report). */
function worksOn(me: SessionUser, task: { unit_id: string }) {
  return (me.permissions.includes('TASK_REPORT') && me.organizationIds.includes(task.unit_id)) || me.permissions.includes('TASK_ASSIGN');
}

/** The person the task was given to (migration 035). */
const isAssignee = (me: SessionUser, task: Pick<TaskRow, 'assignee_person_id'>) => Boolean(task.assignee_person_id) && task.assignee_person_id === me.person.id;

/** Follows up the task: TASK_ASSIGN for every task; the unit's head for the department's own tasks. */
const followsUp = (me: SessionUser, task: Pick<TaskRow, 'internal' | 'unit_id'>) =>
  me.permissions.includes('TASK_ASSIGN') || (task.internal && me.permissions.includes('TASK_REPORT') && me.organizationIds.includes(task.unit_id));

export async function updateTask(id: string, input: TaskInput & { unit_id: string }): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const t = TaskSchema.parse(input);
    const task = await loadTaskRow(db, id);
    if (!followsUp(me, task)) throw new Error('Only the one who gave this task can change it');
    if (!me.permissions.includes('TASK_ASSIGN') && input.unit_id !== task.unit_id) throw new Error('The department’s own task stays in the department');
    if (!OPEN_STATUSES.includes(task.status)) throw new Error('A finished task cannot be changed');
    if (input.unit_id !== task.unit_id) await checkUnits(db, [input.unit_id]);
    await moveTask(db, id, [task.status], { ...taskFields(t), unit_id: input.unit_id });
    if (input.unit_id !== task.unit_id) {
      notifyLater(
        { units: { ids: [input.unit_id], holding: 'TASK_REPORT' }, except: me.systemUser.id },
        { title: 'አዲስ ተግባር · New task', body: `${task.task_no} — ${t.title}${dueText(t.due_date || null)}`, url: TASKS_PAGE, tag: `task-${id}` }
      );
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const ReportSchema = z.object({
  note: z.string().trim().min(3, 'Write what was done'),
  progress: z.coerce.number().int().min(0).max(100),
  submit: z.boolean(),
});

/**
 * A progress report, or (submit) the final report. The department's head (or
 * TASK_ASSIGN) reports for the department; the person the task was given to
 * reports on their own work (lib/tasks/report decides where "done" goes).
 */
export async function reportTask(
  id: string,
  input: z.input<typeof ReportSchema>
): Promise<{ ok: true; updateId: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('tasks');
    const r = ReportSchema.parse(input);
    const task = await loadTaskRow(db, id);
    const head = worksOn(me, task);
    if (!head && !isAssignee(me, task)) throw new Error('Only the department this task was given to can report on it');
    const res = await applyReport(db, task, {
      note: r.note,
      progress: r.progress,
      done: r.submit,
      byHead: head,
      authorUserId: me.systemUser.id,
      authorPersonId: me.person.id,
      authorName: me.person.full_name_am || me.person.full_name_en,
    });
    return { ok: true, updateId: res.updateId };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Files ────────────────────────────────────────────────────────────────────

const BUCKET = 'task-files';

/** Attach a photo or document to a task, or (update_id) to one of its reports. */
export async function uploadTaskFile(form: FormData): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks');
    const taskId = String(form.get('task_id') ?? '');
    const updateId = String(form.get('update_id') ?? '') || null;
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file');
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    const ext = FILE_TYPES[file.type];
    if (!ext) throw new Error(`${file.name}: only photos, PDF, Word and Excel files can be attached`);

    const task = await loadTaskRow(db, taskId);
    if (!worksOn(me, task) && !isAssignee(me, task)) throw new Error('Only the department this task was given to can attach files');
    if (task.status === 'CANCELLED') throw new Error('This task was cancelled');
    if (updateId) {
      const { data: update } = await db.from('task_updates').select('id').eq('id', updateId).eq('task_id', taskId).maybeSingle();
      if (!update) throw new Error('That report does not belong to this task');
    }

    const path = tenantPath(db, taskId, `${crypto.randomUUID()}${ext}`);
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(missingTables(uploadError.message));
    const { error } = await db.from('task_files').insert({
      task_id: taskId,
      update_id: updateId,
      path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: me.systemUser.id,
    });
    if (error) {
      await db.storage.from(BUCKET).remove([path]);
      throw new Error(missingTables(error.message));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Remove a file: whoever uploaded it, or anyone who gives tasks. */
export async function deleteTaskFile(fileId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_REPORT', 'TASK_ASSIGN');
    const file = (await db.from('task_files').select('id, path, uploaded_by').eq('id', fileId).single().then(check)) as {
      id: string; path: string; uploaded_by: string | null;
    };
    if (file.uploaded_by !== me.systemUser.id && !me.permissions.includes('TASK_ASSIGN')) {
      throw new Error('Only the person who attached this file can remove it');
    }
    await db.from('task_files').delete().eq('id', fileId).then(check);
    await db.storage.from(BUCKET).remove([file.path]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Repeating ────────────────────────────────────────────────────────────────

/** Stop giving a repeating task; the tasks already given stay. */
export async function stopRepeating(seriesId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN');
    await db.from('task_series')
      .update({ is_active: false, stopped_by: me.systemUser.id, stopped_at: new Date().toISOString() })
      .eq('id', seriesId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Review / cancel / remind (assigner) ──────────────────────────────────────

export async function reviewTask(id: string, decision: 'COMPLETED' | 'RETURNED', note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    if (decision !== 'COMPLETED' && decision !== 'RETURNED') throw new Error('Invalid decision');
    const cleanNote = note.trim();
    if (decision === 'RETURNED' && cleanNote.length < 3) throw new Error('Write what still has to be done');
    const task = await loadTaskRow(db, id);
    if (!followsUp(me, task)) throw new Error('Only the one who gave this task can review it');
    if (task.status !== 'SUBMITTED') throw new Error('There is no report waiting for review on this task');

    await moveTask(db, id, ['SUBMITTED'], {
      status: decision,
      completed_at: decision === 'COMPLETED' ? new Date().toISOString() : null,
    });
    await logUpdate(db, me, id, decision, cleanNote);
    const outcome = decision === 'COMPLETED' ? 'ተቀባይነት አግኝቷል · accepted' : 'ተመልሷል · returned';
    if (task.assignee_person_id && task.assignee_person_id !== me.person.id) {
      await tellPerson(db, task.assignee_person_id, { title: `${task.task_no} ${outcome}`, body: cleanNote ? `${task.title} — ${cleanNote}` : task.title, url: MY_TASKS_PAGE, tag: `task-${id}` });
    }
    notifyLater(
      { units: { ids: [task.unit_id], holding: 'TASK_REPORT' }, except: me.systemUser.id },
      { title: `${task.task_no} ${outcome}`, body: cleanNote ? `${task.title} — ${cleanNote}` : task.title, url: TASKS_PAGE, tag: `task-${id}` }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function cancelTask(id: string, reason: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) throw new Error('Write why the task is cancelled');
    const task = await loadTaskRow(db, id);
    if (!followsUp(me, task)) throw new Error('Only the one who gave this task can cancel it');
    if (!OPEN_STATUSES.includes(task.status)) throw new Error('This task is already finished');
    await moveTask(db, id, OPEN_STATUSES, { status: 'CANCELLED' });
    await logUpdate(db, me, id, 'CANCELLED', cleanReason);
    notifyLater(
      { units: { ids: [task.unit_id], holding: 'TASK_REPORT' }, except: me.systemUser.id },
      { title: `${task.task_no} ተሰርዟል · cancelled`, body: `${task.title} — ${cleanReason}`, url: TASKS_PAGE, tag: `task-${id}` }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function remindTask(id: string, note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const task = await loadTaskRow(db, id);
    if (!followsUp(me, task) && !(task.assignee_person_id && worksOn(me, task))) throw new Error('Only the one who gave this task can send a reminder');
    if (!WORK_STATUSES.includes(task.status)) throw new Error('This task is not waiting on the department');
    await logUpdate(db, me, id, 'REMINDED', note.trim());
    if (task.assignee_person_id) {
      await tellPerson(db, task.assignee_person_id, { title: `${task.task_no} ማስታወሻ · Reminder`, body: `${task.title}${dueText(task.due_date)}${note.trim() ? ` — ${note.trim()}` : ''}`, url: MY_TASKS_PAGE, tag: `task-${id}` });
    }
    notifyLater(
      { units: { ids: [task.unit_id], holding: 'TASK_REPORT' }, except: me.systemUser.id },
      {
        title: `${task.task_no} ማስታወሻ · Reminder`,
        body: `${task.title}${dueText(task.due_date)}${note.trim() ? ` — ${note.trim()}` : ''}`,
        url: TASKS_PAGE,
        tag: `task-${id}`,
      }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── People inside a department (migration 035) ───────────────────────────────

const MIGRATION_035 = 'Run database migration 035 (tasks for people in a department) first';
const missing035 = (m: string) => (/assignee_person_id|parent_task_id|plan_activity_id|HANDED|column tasks\.internal/.test(m) ? MIGRATION_035 : m);

/** Give the task to a person in the department (or take it back: personId ''). The unit's head or TASK_ASSIGN. */
export async function setTaskAssignee(taskId: string, personId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const task = await loadTaskRow(db, z.string().min(1).parse(taskId));
    if (!worksOn(me, task)) throw new Error('Only the department’s head can choose who does it');
    if (!OPEN_STATUSES.includes(task.status)) throw new Error('This task is already finished');
    const person = z.string().parse(personId ?? '');
    if (person && !(await inUnit(db, task.unit_id, person))) throw new Error('That person is not in this department');
    const { error } = await db.from('tasks').update({ assignee_person_id: person || null }).eq('id', task.id);
    if (error) throw new Error(missing035(error.message));
    if (person) {
      const { data } = await db.from('persons').select('full_name_en, full_name_am').eq('id', person).maybeSingle();
      const p = data as { full_name_en: string; full_name_am: string | null } | null;
      await db.from('task_updates').insert({ task_id: task.id, author_id: me.systemUser.id, kind: 'HANDED', note: p?.full_name_am || p?.full_name_en || null });
      await tellPerson(db, person, {
        title: 'አዲስ ተግባር ተሰጥዎታል · A task for you',
        body: `${task.task_no} — ${task.title}${dueText(task.due_date)}`,
        url: MY_TASKS_PAGE,
        tag: `task-${task.id}`,
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing035(errorMessage(e)) };
  }
}

const OwnTaskSchema = z.object({
  unit_id: z.string().min(1, 'Choose the department'),
  title: z.string().trim().min(3, 'Write what has to be done').max(300),
  details: z.string().trim().max(4000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  due_date: optionalDate,
  assignee_person_id: z.string().min(1, 'Choose who will do it'),
  parent_task_id: z.string(),
  plan_activity_id: z.string(),
});
export type OwnTaskInput = z.input<typeof OwnTaskSchema>;

/**
 * The department gives a task to one of its own people: on its own, as part of
 * a bigger task (parent), or to carry out an activity of its approved plan.
 * The unit's head (or TASK_ASSIGN); the head reviews it when it is done.
 */
export async function createDepartmentTask(input: OwnTaskInput): Promise<{ ok: true; taskNo: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('tasks', 'TASK_ASSIGN', 'TASK_REPORT');
    const t = OwnTaskSchema.parse(input);
    if (!worksOn(me, { unit_id: t.unit_id })) throw new Error('You can only give tasks inside your own department');
    if (!(await inUnit(db, t.unit_id, t.assignee_person_id))) throw new Error('That person is not in this department');
    if (t.parent_task_id) {
      const parent = await loadTaskRow(db, t.parent_task_id);
      if (parent.unit_id !== t.unit_id) throw new Error('The bigger task belongs to another department');
      if (!OPEN_STATUSES.includes(parent.status)) throw new Error('The bigger task is already finished');
    }
    if (t.plan_activity_id) {
      const { data: act } = await db.from('plan_activities').select('id, plan_id').eq('id', t.plan_activity_id).maybeSingle();
      const { data: plan } = act ? await db.from('unit_plans').select('unit_id, status').eq('id', (act as { plan_id: string }).plan_id).maybeSingle() : { data: null };
      const p = plan as { unit_id: string; status: string } | null;
      if (!p || p.unit_id !== t.unit_id) throw new Error('That plan activity belongs to another department');
      if (p.status !== 'APPROVED') throw new Error('Tasks are made from an approved plan');
    }
    const { data, error } = await db.from('tasks')
      .insert({
        title: t.title,
        details: t.details || null,
        from_unit_id: t.unit_id,
        unit_id: t.unit_id,
        source: 'ROUTINE',
        priority: t.priority,
        due_date: t.due_date || null,
        created_by: me.systemUser.id,
        internal: true,
        assignee_person_id: t.assignee_person_id,
        parent_task_id: t.parent_task_id || null,
        plan_activity_id: t.plan_activity_id || null,
      })
      .select('id, task_no')
      .single();
    if (error) throw new Error(missing035(error.message));
    const row = data as { id: string; task_no: string };
    await tellPerson(db, t.assignee_person_id, {
      title: 'አዲስ ተግባር ተሰጥዎታል · A task for you',
      body: `${row.task_no} — ${t.title}${dueText(t.due_date || null)}`,
      url: MY_TASKS_PAGE,
      tag: `task-${row.id}`,
    });
    return { ok: true, taskNo: row.task_no };
  } catch (e) {
    return { ok: false, error: missing035(errorMessage(e)) };
  }
}

/** "My tasks": the tasks given to the signed-in person — open ones first. */
export async function loadMyTasks(): Promise<Loaded<{ tasks: MyTask[] }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorizeIn('tasks');
    const { data, error } = await db.from('tasks').select('*').eq('assignee_person_id', me.person.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(missing035(missingTables(error.message)));
    const rows = ((data ?? []) as Row[]).filter((r) => r.status !== 'CANCELLED');
    const ids = rows.map((r) => r.id);
    const unitIds = [...new Set(rows.flatMap((r) => [r.unit_id as string, r.from_unit_id as string]).filter(Boolean))];
    const creatorIds = [...new Set(rows.map((r) => r.created_by as string).filter(Boolean))];
    const activityIds = [...new Set(rows.map((r) => r.plan_activity_id as string).filter(Boolean))];
    const [units, creators, acts, updates] = await Promise.all([
      unitIds.length ? db.from('organization_units').select('id, name_en, name_am').in('id', unitIds) : Promise.resolve({ data: [] }),
      creatorIds.length ? db.from('system_users').select('id, person:persons!system_users_person_id_fkey(full_name_en, full_name_am)').in('id', creatorIds) : Promise.resolve({ data: [] }),
      activityIds.length ? db.from('plan_activities').select('id, title').in('id', activityIds) : Promise.resolve({ data: [] }),
      ids.length ? db.from('task_updates').select('id, task_id, kind, note, progress, created_at, author_id').in('task_id', ids).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    const unitOf = new Map(((units.data ?? []) as Row[]).map((u) => [u.id, u as Row]));
    const creatorName = new Map(
      ((creators.data ?? []) as Row[]).map((c) => {
        const p = (Array.isArray(c.person) ? c.person[0] : c.person) as { full_name_en?: string; full_name_am?: string | null } | null;
        return [c.id, p?.full_name_am || p?.full_name_en || ''];
      })
    );
    const actTitle = new Map(((acts.data ?? []) as Row[]).map((a) => [a.id, a.title as string]));
    const updatesOf = new Map<string, Row[]>();
    for (const u of (updates.data ?? []) as Row[]) updatesOf.set(u.task_id as string, [...(updatesOf.get(u.task_id as string) ?? []), u]);
    const label = (id: unknown, am: boolean) => {
      const u = unitOf.get(id as string);
      return u ? ((am ? (u.name_am as string) || (u.name_en as string) : (u.name_en as string)) ?? '') : '';
    };
    const tasks: MyTask[] = rows
      .map((r) => ({
        id: r.id,
        task_no: r.task_no as string,
        title: r.title as string,
        details: (r.details as string) ?? '',
        unit: label(r.unit_id, false),
        unit_am: label(r.unit_id, true),
        given_by: r.internal ? creatorName.get(r.created_by as string) ?? '' : label(r.from_unit_id, true),
        internal: Boolean(r.internal),
        plan_activity: actTitle.get(r.plan_activity_id as string) ?? '',
        priority: r.priority as TaskPriority,
        due_date: (r.due_date as string) ?? null,
        status: r.status as TaskStatus,
        progress: Number(r.progress) || 0,
        updates: (updatesOf.get(r.id) ?? [])
          .slice(0, 6)
          .map((u) => ({ id: u.id, kind: u.kind as UpdateKind, note: (u.note as string) ?? '', progress: u.progress === null || u.progress === undefined ? null : Number(u.progress), author: '', at: u.created_at as string })),
      }))
      // Open ones first (soonest due first), then finished ones
      .sort((a, b) => Number(OPEN_STATUSES.includes(b.status)) - Number(OPEN_STATUSES.includes(a.status)) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    return { mode: 'live', data: { tasks } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
