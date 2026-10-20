'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  CheckCircle2,
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  Repeat,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { EthiopianDateInput } from '@/components/ui/EthiopianDateInput';
import { attachFiles, runTasks, type TasksState } from '@/lib/tasks/client';
import { fileProblem } from '@/lib/tasks/upload';
import {
  assignTasks,
  cancelTask,
  deleteTaskFile,
  remindTask,
  reportTask,
  reviewTask,
  setTaskAssignee,
  stopRepeating,
  updateTask,
  type TaskInput,
} from '@/app/dashboard/tasks/actions';
import {
  ASSIGNEE_TYPES,
  FILE_ACCEPT,
  fileSize,
  FREQUENCY,
  GIVER_TYPES,
  ISSUE_BEFORE,
  isOverdue,
  MAX_FILES_AT_ONCE,
  OPEN_STATUSES,
  PRIORITY,
  SOURCE,
  STATUS,
  UPDATE_KIND,
  WORK_STATUSES,
  type Frequency,
  type Task,
  type TaskFile,
  type TaskPerson,
  type TaskPriority,
  type TaskSource,
} from '@/lib/tasks/types';
import { addDays } from '@/lib/hr/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

type Done = (message: string) => void;

function ErrorBox({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
      <AlertCircle size={16} className="shrink-0" />
      {text}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-slate-700 block mb-1">{children}</label>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${value >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-slate-500 w-8 text-right">{value}%</span>
    </div>
  );
}

// ── Assign / edit ────────────────────────────────────────────────────────────

/** New task(s) for one or more units, or edit one task. */
export function TaskForm({ data, task, onClose, onDone }: { data: TasksState; task?: Task; onClose: () => void; onDone: Done }) {
  const { t, locale } = useLang();
  const today = todayIso();
  const givers = data.units.filter((u) => GIVER_TYPES.includes(u.type));
  const assignees = data.units.filter((u) => ASSIGNEE_TYPES.includes(u.type));
  const unitName = (id: string) => {
    const u = data.units.find((x) => x.id === id);
    return u ? (locale === 'am' ? u.name_am : u.name_en) : '';
  };

  const [f, setF] = useState(() => ({
    from_unit_id: task ? task.from_unit_id ?? '' : data.units.find((u) => u.type === 'EXECUTIVE_COMMITTEE')?.id ?? '',
    source: (task?.source ?? 'ROUTINE') as TaskSource,
    meeting_title: task?.meeting_title ?? '',
    meeting_date: task?.meeting_date ?? today,
    decision_ref: task?.decision_ref ?? '',
    title: task?.title ?? '',
    details: task?.details ?? '',
    priority: (task?.priority ?? 'NORMAL') as TaskPriority,
    hasDue: task ? Boolean(task.due_date) : true,
    due_date: task?.due_date ?? addDays(today, 14),
    repeat: '' as Frequency | '',
  }));
  const [unitIds, setUnitIds] = useState<string[]>(task ? [task.unit_id] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const toggleUnit = (id: string) => setUnitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const chooseSource = (source: TaskSource) => {
    setF((prev) => ({
      ...prev,
      source,
      // Most decisions come from the giving body's own meeting
      meeting_title: source === 'MEETING' && !prev.meeting_title ? `${unitName(prev.from_unit_id)} ${t('meeting', 'ስብሰባ')}`.trim() : prev.meeting_title,
    }));
  };

  const input = (): TaskInput => ({
    title: f.title,
    details: f.details,
    from_unit_id: f.from_unit_id,
    source: f.source,
    meeting_title: f.meeting_title,
    meeting_date: f.source === 'MEETING' ? f.meeting_date : '',
    decision_ref: f.decision_ref,
    priority: f.priority,
    due_date: f.hasDue ? f.due_date : '',
  });

  const save = async (another: boolean) => {
    setError('');
    setSaved('');
    if (unitIds.length === 0) return setError(t('Choose at least one department.', 'ቢያንስ አንድ ክፍል ይምረጡ።'));
    setBusy(true);
    if (task) {
      const res = await runTasks(() => updateTask(task.id, { ...input(), unit_id: unitIds[0] }));
      setBusy(false);
      if (!res.ok) return setError(res.error);
      return onDone(t('Task updated', 'ተግባሩ ተስተካክሏል'));
    }
    const res = await runTasks(() => assignTasks({ ...input(), unit_ids: unitIds, repeat: f.repeat }));
    setBusy(false);
    if (!res.ok) return setError('error' in res ? res.error : '');
    const nos = 'taskNos' in res ? res.taskNos.join(', ') : '';
    if (!another) return onDone(t(`Task given: ${nos}`, `ተግባር ተሰጥቷል: ${nos}`));
    // Next decision of the same meeting: keep the meeting, clear the rest
    setF((prev) => ({ ...prev, title: '', details: '', decision_ref: '' }));
    setUnitIds([]);
    setSaved(t(`Saved ${nos}. Enter the next one.`, `${nos} ተቀምጧል። ቀጣዩን ያስገቡ።`));
  };

  const groups: [string, string[]][] = [
    [t('Departments', 'ክፍሎች'), ['DEPARTMENT']],
    [t('Coordinations', 'አስተባባሪዎች'), ['COORDINATION']],
    [t('Other', 'ሌሎች'), ASSIGNEE_TYPES.filter((x) => x !== 'DEPARTMENT' && x !== 'COORDINATION')],
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="2xl"
      title={task ? `${t('Edit task', 'ተግባር አስተካክል')} ${task.task_no}` : t('Give a task', 'ተግባር ስጥ')}
      subtitle={t(
        'Each chosen department gets its own copy to report on',
        'የተመረጠ እያንዳንዱ ክፍል የራሱን ተግባር ተቀብሎ ሪፖርት ያደርጋል'
      )}
    >
      <div className="space-y-4">
        <ErrorBox text={error} />
        {saved && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 text-sm">
            <CheckCircle2 size={16} className="shrink-0" />
            {saved}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('Given by', 'የሰጠው አካል')}</Label>
            <select value={f.from_unit_id} onChange={(e) => set('from_unit_id', e.target.value)} className="form-input text-sm">
              <option value="">—</option>
              {givers.map((u) => (
                <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('Comes from', 'ምንጭ')}</Label>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 w-full">
              {(Object.keys(SOURCE) as TaskSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseSource(s)}
                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md ${f.source === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {t(...SOURCE[s])}
                </button>
              ))}
            </div>
          </div>
        </div>

        {f.source === 'MEETING' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="sm:col-span-2">
              <Label>{t('Meeting', 'ስብሰባ')} *</Label>
              <input
                value={f.meeting_title}
                onChange={(e) => set('meeting_title', e.target.value)}
                placeholder={t('e.g. Executive Committee regular meeting', 'ለምሳሌ የሥራ አስፈጻሚ መደበኛ ስብሰባ')}
                className="form-input text-sm"
              />
            </div>
            <div>
              <Label>{t('Meeting date', 'የስብሰባው ቀን')} *</Label>
              <EthiopianDateInput value={f.meeting_date} onChange={(d) => set('meeting_date', d)} />
            </div>
            <div>
              <Label>{t('Decision / minute no.', 'የውሳኔ / ቃለ ጉባኤ ቁጥር')}</Label>
              <input
                value={f.decision_ref}
                onChange={(e) => set('decision_ref', e.target.value)}
                placeholder={t('e.g. Decision 3', 'ለምሳሌ ውሳኔ ቁ. 3')}
                className="form-input text-sm"
              />
            </div>
          </div>
        )}

        <div>
          <Label>{t('What has to be done', 'መሠራት ያለበት')} *</Label>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} className="form-input text-sm" />
        </div>
        <div>
          <Label>{t('Details and expected report', 'ዝርዝርና የሚጠበቀው ሪፖርት')}</Label>
          <textarea value={f.details} onChange={(e) => set('details', e.target.value)} rows={3} className="form-input text-sm" />
        </div>

        <div>
          <Label>{task ? t('Department', 'ክፍል') : t('Give it to', 'የሚሰጠው ለ')} *</Label>
          {task ? (
            <select value={unitIds[0] ?? ''} onChange={(e) => setUnitIds([e.target.value])} className="form-input text-sm">
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
              ))}
            </select>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {groups.map(([label, types]) => {
                const list = assignees.filter((u) => types.includes(u.type));
                if (list.length === 0) return null;
                const all = list.every((u) => unitIds.includes(u.id));
                return (
                  <div key={label} className="p-2">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setUnitIds((prev) => (all ? prev.filter((id) => !list.some((u) => u.id === id)) : [...new Set([...prev, ...list.map((u) => u.id)])]))
                        }
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        {all ? t('Clear', 'አጽዳ') : t('Select all', 'ሁሉንም ምረጥ')}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                      {list.map((u) => (
                        <label key={u.id} className="flex items-start gap-2 px-1 py-1 text-sm text-slate-700 cursor-pointer rounded hover:bg-slate-50">
                          <input type="checkbox" checked={unitIds.includes(u.id)} onChange={() => toggleUnit(u.id)} className="mt-1 accent-blue-600" />
                          {locale === 'am' ? u.name_am : u.name_en}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!task && unitIds.length > 1 && (
            <p className="text-[11px] text-slate-500 mt-1">
              {t(`${unitIds.length} tasks will be created, one per department.`, `${unitIds.length} ተግባራት ይፈጠራሉ፤ ለእያንዳንዱ ክፍል አንድ።`)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('Priority', 'ቅድሚያ')}</Label>
            <select value={f.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)} className="form-input text-sm">
              {(Object.keys(PRIORITY) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>{t(...PRIORITY[p].label)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.hasDue}
                disabled={Boolean(f.repeat)}
                onChange={(e) => set('hasDue', e.target.checked)}
                className="accent-blue-600"
              />
              {f.repeat ? t('First due date', 'የመጀመሪያው ማጠናቀቂያ ቀን') : t('Due date', 'የማጠናቀቂያ ቀን')}
            </label>
            {f.hasDue ? (
              <EthiopianDateInput value={f.due_date} onChange={(d) => set('due_date', d)} />
            ) : (
              <p className="text-xs text-slate-400 py-2">{t('No due date', 'የማጠናቀቂያ ቀን የለም')}</p>
            )}
          </div>
          {!task && (
            <div className="sm:col-span-2">
              <Label>{t('Repeats', 'ይደገማል')}</Label>
              <select
                value={f.repeat}
                onChange={(e) => setF((prev) => ({ ...prev, repeat: e.target.value as Frequency | '', hasDue: prev.hasDue || Boolean(e.target.value) }))}
                className="form-input text-sm"
              >
                <option value="">{t('Does not repeat', 'አይደገምም')}</option>
                {(Object.keys(FREQUENCY) as Frequency[]).map((fr) => (
                  <option key={fr} value={fr}>{t(...FREQUENCY[fr])}</option>
                ))}
              </select>
              {f.repeat && (
                <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                  <Repeat size={12} className="mt-px shrink-0" />
                  {t(
                    `The same task is given again ${ISSUE_BEFORE[f.repeat]} days before each next due date (months follow the Ethiopian calendar), until someone stops it.`,
                    `ተመሳሳዩ ተግባር ከእያንዳንዱ ቀጣይ ማጠናቀቂያ ቀን ${ISSUE_BEFORE[f.repeat]} ቀን ቀደም ብሎ በራሱ ይሰጣል (ወራት በኢትዮጵያ አቆጣጠር)፤ እስኪቆም ድረስ።`
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs py-2">
            {t('Close', 'ዝጋ')}
          </button>
          {!task && f.source === 'MEETING' && (
            <button type="button" onClick={() => save(true)} disabled={busy} className="btn btn-secondary text-xs py-2 disabled:opacity-60">
              {t('Save & add next decision', 'አስቀምጥና ቀጣዩን ውሳኔ ጨምር')}
            </button>
          )}
          <button type="button" onClick={() => save(false)} disabled={busy} className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-60">
            <Send size={14} />
            {busy ? t('Saving…', 'በመመዝገብ ላይ…') : task ? t('Save changes', 'ለውጡን አስቀምጥ') : t('Give task', 'ተግባሩን ስጥ')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── One task: details, reports, review ──────────────────────────────────────

export function TaskDetail({
  task,
  people = [],
  onClose,
  onEdit,
  onGivePart,
  onDone,
}: {
  task: Task;
  /** The department's people, to choose who does it */
  people?: TaskPerson[];
  onClose: () => void;
  onEdit: () => void;
  /** Give a part of this task to someone in the department */
  onGivePart?: () => void;
  onDone: Done;
}) {
  const { t, locale } = useLang();
  const { user, can } = useAuth();
  const today = todayIso();
  const canAssign = can('TASK_ASSIGN');
  const inUnit = can('TASK_REPORT') && (user?.organizationIds ?? []).includes(task.unit_id);
  /** The department's head (or someone who gives tasks) */
  const head = inUnit || canAssign;
  /** The person this task was given to */
  const isMine = Boolean(task.assignee_id) && task.assignee_id === user?.person?.id;
  /** Who gave it follows it up: the Executive (TASK_ASSIGN), or the head for the department's own tasks */
  const followUp = canAssign || (task.internal && inUnit);
  const canReport = WORK_STATUSES.includes(task.status) && (head || isMine);
  const canReview = followUp && task.status === 'SUBMITTED';
  const isOpen = OPEN_STATUSES.includes(task.status);
  const canAttach = task.status !== 'CANCELLED' && (head || isMine);
  const [who, setWho] = useState(task.assignee_id ?? '');
  const canRemove = (f: TaskFile) => canAssign || f.uploaded_by_id === user?.systemUser.id;

  const [report, setReport] = useState('');
  const [progress, setProgress] = useState(task.progress);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** Runs an action; with a message the dialog closes and shows it, without one it stays open. */
  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>, message?: string) => {
    setError('');
    setBusy(true);
    const res = await runTasks(action);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (message) onDone(message);
  };

  /** Keeps up to MAX_FILES_AT_ONCE acceptable files, or says what is wrong. */
  const pickFiles = (list: FileList | null): File[] => {
    const files = [...(list ?? [])];
    const problem = files.map((f) => fileProblem(f, t)).find(Boolean);
    if (problem) {
      setError(problem);
      return [];
    }
    if (files.length > MAX_FILES_AT_ONCE) setError(t(`Only the first ${MAX_FILES_AT_ONCE} files are kept.`, `የመጀመሪያዎቹ ${MAX_FILES_AT_ONCE} ፋይሎች ብቻ ይያዛሉ።`));
    return files.slice(0, MAX_FILES_AT_ONCE);
  };

  const submitReport = async (submit: boolean) => {
    setError('');
    setBusy(true);
    const res = await runTasks(() => reportTask(task.id, { note: report, progress: submit ? 100 : progress, submit }));
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    const uploaded = await attachFiles(task.id, 'updateId' in res ? res.updateId : null, reportFiles);
    setBusy(false);
    if (!uploaded.ok) {
      // The report is saved; stay open so the missing files can be attached again
      setReport('');
      setReportFiles([]);
      return setError(t(`Report saved, but some files were not attached: ${uploaded.error}`, `ሪፖርቱ ተቀምጧል፤ አንዳንድ ፋይሎች ግን አልተያያዙም: ${uploaded.error}`));
    }
    onDone(submit ? t('Final report submitted', 'የማጠቃለያ ሪፖርት ቀርቧል') : t('Progress report saved', 'የሂደት ሪፖርት ተቀምጧል'));
  };

  const attachNow = async (list: FileList | null) => {
    setError('');
    const files = pickFiles(list);
    if (files.length === 0) return;
    setBusy(true);
    const res = await attachFiles(task.id, null, files);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  const date = (iso: string | null) => (iso ? formatEthiopianDate(iso.slice(0, 10), locale) : '—');
  const overdue = isOverdue(task, today);
  const reportIds = new Set(task.updates.map((u) => u.id));
  const looseFiles = task.files.filter((f) => !f.update_id || !reportIds.has(f.update_id));
  const fileList = (files: TaskFile[]) =>
    files.length > 0 && (
      <FileList
        files={files}
        canRemove={canRemove}
        onRemove={(f) => {
          if (window.confirm(t(`Remove ${f.name}?`, `${f.name} ይወገድ?`))) void run(() => deleteTaskFile(f.id));
        }}
        busy={busy}
      />
    );

  return (
    <Modal isOpen onClose={onClose} maxWidth="2xl" title={`${task.task_no} — ${task.title}`} subtitle={locale === 'am' ? task.unit_am : task.unit}>
      <div className="space-y-5 text-sm">
        <ErrorBox text={error} />

        <div className="flex flex-wrap items-center gap-2">
          <span className={STATUS[task.status].cls}>{t(...STATUS[task.status].label)}</span>
          {overdue && <span className="badge badge-danger">{t('Overdue', 'ጊዜው አልፏል')}</span>}
          <span className={`text-xs ${PRIORITY[task.priority].cls}`}>{t(...PRIORITY[task.priority].label)}</span>
          {task.internal && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">{t('Department’s own task', 'የክፍሉ የውስጥ ተግባር')}</span>}
          {task.plan_activity && <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">🎯 {task.plan_activity}</span>}
          {task.parent_task_no && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">🧩 {t('Part of', 'የ… አካል')} {task.parent_task_no}</span>}
          {task.repeats && task.series_id && (
            <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
              <Repeat size={12} />
              {t(...FREQUENCY[task.repeats])}
              {canAssign && (
                <button
                  onClick={() => run(() => stopRepeating(task.series_id!), t('This task will not be given again', 'ይህ ተግባር ከእንግዲህ አይሰጥም'))}
                  disabled={busy}
                  className="ml-1 font-semibold hover:underline disabled:opacity-50"
                >
                  · {t('Stop repeating', 'መደጋገሙን አቁም')}
                </button>
              )}
            </span>
          )}
          <div className="flex-1 min-w-[140px] max-w-[220px] ml-auto">
            <ProgressBar value={task.progress} />
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Info label={t('Given by', 'የሰጠው አካል')} value={(locale === 'am' ? task.from_unit_am : task.from_unit) || '—'} />
          <Info label={t('Entered by', 'ያስገባው')} value={`${task.created_by} · ${date(task.created_at)}`} />
          <Info
            label={t('Comes from', 'ምንጭ')}
            value={
              task.source === 'MEETING'
                ? `${task.meeting_title} · ${date(task.meeting_date)}${task.decision_ref ? ` · ${task.decision_ref}` : ''}`
                : t(...SOURCE.ROUTINE)
            }
          />
          <Info label={t('Due date', 'የማጠናቀቂያ ቀን')} value={date(task.due_date)} danger={overdue} />
          {task.completed_at && <Info label={t('Completed on', 'የተጠናቀቀበት')} value={date(task.completed_at)} />}
        </dl>

        {/* Who does it — the department's head chooses */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <UserCheck size={15} className="text-slate-500" />
          <span className="text-xs text-slate-500">{t('Who does it', 'የሚሠራው')}:</span>
          {head && isOpen && people.length > 0 ? (
            <>
              <select value={who} onChange={(e) => setWho(e.target.value)} className="form-input text-xs py-1 w-auto min-w-[12rem]">
                <option value="">{t('The department (no one person)', 'ክፍሉ (አንድ ሰው አይደለም)')}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {who !== (task.assignee_id ?? '') && (
                <button
                  disabled={busy}
                  onClick={() => run(() => setTaskAssignee(task.id, who), who ? t('Given — they were told', 'ተሰጥቷል — ተነግሯቸዋል') : t('Taken back to the department', 'ወደ ክፍሉ ተመልሷል'))}
                  className="btn btn-primary text-xs py-1 disabled:opacity-50"
                >
                  {t('Save', 'አስቀምጥ')}
                </button>
              )}
            </>
          ) : (
            <span className="text-sm font-medium text-slate-900">{task.assignee || t('The department', 'ክፍሉ')}</span>
          )}
          {head && isOpen && people.length === 0 && (
            <span className="text-[11px] text-slate-400">{t('(no people listed in this department yet)', '(በዚህ ክፍል ገና ሰው አልተመዘገበም)')}</span>
          )}
        </div>

        {(task.parts.total > 0 || (head && isOpen && onGivePart && !task.parent_task_id)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">
              🧩 {task.parts.total > 0
                ? t(`Parts given to people: ${task.parts.done} of ${task.parts.total} done`, `ለሰዎች የተሰጡ ክፍሎች፦ ${task.parts.total} ውስጥ ${task.parts.done} ተጠናቀዋል`)
                : t('You can split this task among people in the department.', 'ይህን ተግባር በክፍሉ ሰዎች መካከል መከፋፈል ይችላሉ።')}
            </span>
            {head && isOpen && onGivePart && !task.parent_task_id && (
              <button onClick={onGivePart} className="text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-1 rounded">
                + {t('Give a part to someone', 'ክፍሉን ለሰው ስጥ')}
              </button>
            )}
          </div>
        )}

        {task.details && <p className="whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{task.details}</p>}

        {/* History */}
        <div>
          <h4 className="text-xs font-bold text-slate-800 mb-2">{t('Reports and history', 'ሪፖርቶችና ታሪክ')}</h4>
          {task.updates.length === 0 ? (
            <p className="text-xs text-slate-400">{t('No report yet.', 'እስካሁን ሪፖርት የለም።')}</p>
          ) : (
            <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
              {task.updates.map((u) => (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">{t(...UPDATE_KIND[u.kind])}{u.kind === 'HANDED' && u.note ? ` ${u.note}` : ''}</span>
                    {u.progress !== null && u.kind === 'PROGRESS' && ` · ${u.progress}%`}
                    {' · '}
                    {u.author || '—'} · {date(u.at)}
                  </div>
                  {u.note && u.kind !== 'HANDED' && <p className="whitespace-pre-wrap text-slate-700 mt-0.5">{u.note}</p>}
                  {fileList(task.files.filter((f) => f.update_id === u.id))}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Files attached to the task itself (e.g. the meeting minutes) */}
        {(looseFiles.length > 0 || canAttach) && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-800">{t('Files', 'ፋይሎች')}</h4>
              {canAttach && (
                <label className={`text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-1 rounded inline-flex items-center gap-1 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Paperclip size={13} />
                  {t('Attach file', 'ፋይል አያይዝ')}
                  <input type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => { void attachNow(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {looseFiles.length === 0 ? (
              <p className="text-xs text-slate-400 mt-1">{t('Photos, minutes, PDF, Word or Excel files — up to 5 MB each.', 'ፎቶ፣ ቃለ ጉባኤ፣ PDF፣ Word ወይም Excel — እያንዳንዱ እስከ 5 MB።')}</p>
            ) : (
              fileList(looseFiles)
            )}
          </div>
        )}

        {/* The department reports */}
        {canReport && (
          <div className="space-y-3 p-4 rounded-xl border border-blue-100 bg-blue-50/50">
            <h4 className="text-xs font-bold text-slate-800">
              {isMine && !head ? t('Report on your work', 'በሥራዎ ላይ ሪፖርት ያድርጉ') : inUnit ? t('Report on this task', 'በዚህ ተግባር ላይ ሪፖርት ያድርጉ') : t('Record a report for the department', 'ለክፍሉ ሪፖርት መዝግብ')}
            </h4>
            {task.status === 'RETURNED' && (
              <p className="text-xs text-red-700">{t('Returned — see the note above for what is still needed.', 'ተመልሷል — የሚቀረውን ከላይ ያለውን ማስታወሻ ይመልከቱ።')}</p>
            )}
            <textarea
              value={report}
              onChange={(e) => setReport(e.target.value)}
              rows={3}
              placeholder={t('What has been done, what remains, any problem…', 'የተሠራው፣ የቀረው፣ ያጋጠመ ችግር…')}
              className="form-input text-sm bg-white"
            />
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600 shrink-0">{t('Progress', 'ሂደት')}</span>
              <input type="range" min={0} max={100} step={10} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="flex-1 accent-blue-600" />
              <span className="text-xs font-mono w-10 text-right">{progress}%</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-secondary text-xs inline-flex items-center gap-1.5 cursor-pointer">
                <Paperclip size={13} />
                {t('Add photos / files', 'ፎቶ / ፋይል ጨምር')}
                <input
                  type="file"
                  multiple
                  accept={FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const picked = pickFiles(e.target.files);
                    setReportFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES_AT_ONCE));
                    e.target.value = '';
                  }}
                />
              </label>
              {reportFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-lg pl-2 pr-1 py-1">
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button onClick={() => setReportFiles((prev) => prev.filter((_, j) => j !== i))} className="p-0.5 text-slate-400 hover:text-red-600" aria-label={t('Remove', 'አስወግድ')}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => submitReport(false)}
                disabled={busy}
                className="btn btn-secondary text-xs disabled:opacity-50"
              >
                {t('Save progress', 'ሂደቱን አስቀምጥ')}
              </button>
              <button
                onClick={() => submitReport(true)}
                disabled={busy}
                className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} />
                {head ? t('Submit final report', 'የማጠቃለያ ሪፖርት አቅርብ') : task.internal ? t('Done — send for review', 'ጨርሻለሁ — ለግምገማ ላክ') : t('My part is done', 'ድርሻዬን ጨርሻለሁ')}
              </button>
            </div>
          </div>
        )}

        {/* The giver follows up */}
        {followUp && isOpen && (
          <div className="space-y-3 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800">
              {canReview ? t('Review the report', 'ሪፖርቱን ገምግም') : t('Follow up', 'ክትትል')}
            </h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={
                canReview
                  ? t('Comment (required to send it back)', 'አስተያየት (ለመመለስ ያስፈልጋል)')
                  : t('Note to the department (required to cancel)', 'ለክፍሉ ማስታወሻ (ለመሰረዝ ያስፈልጋል)')
              }
              className="form-input text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2">
              {canAssign && (
                <button onClick={onEdit} disabled={busy} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                  <Pencil size={13} />
                  {t('Edit', 'አስተካክል')}
                </button>
              )}
              <button
                onClick={() => run(() => cancelTask(task.id, note), t('Task cancelled', 'ተግባሩ ተሰርዟል'))}
                disabled={busy}
                className="btn btn-secondary text-xs text-red-600 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <X size={13} />
                {t('Cancel task', 'ተግባሩን ሰርዝ')}
              </button>
              {WORK_STATUSES.includes(task.status) && (
                <button
                  onClick={() => run(() => remindTask(task.id, note), t('Reminder sent', 'ማስታወሻ ተልኳል'))}
                  disabled={busy}
                  className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <BellRing size={13} />
                  {t('Send reminder', 'ማስታወሻ ላክ')}
                </button>
              )}
              {canReview && (
                <>
                  <button
                    onClick={() => run(() => reviewTask(task.id, 'RETURNED', note), t('Sent back to the department', 'ለክፍሉ ተመልሷል'))}
                    disabled={busy}
                    className="btn btn-danger text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CornerUpLeft size={13} />
                    {t('Send back', 'መልስ')}
                  </button>
                  <button
                    onClick={() => run(() => reviewTask(task.id, 'COMPLETED', note), t('Accepted as completed', 'ተጠናቋል ተብሎ ተቀባይነት አግኝቷል'))}
                    disabled={busy}
                    className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check size={14} />
                    {t('Accept as done', 'ተጠናቋል — ተቀበል')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function FileList({ files, canRemove, onRemove, busy }: { files: TaskFile[]; canRemove: (f: TaskFile) => boolean; onRemove: (f: TaskFile) => void; busy: boolean }) {
  const { t } = useLang();
  return (
    <ul className="mt-1.5 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id} className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-slate-200 bg-white pl-2 pr-1 py-1" title={`${f.uploaded_by} · ${fileSize(f.size)}`}>
          {f.mime.startsWith('image/') ? <ImageIcon size={13} className="text-slate-500" /> : <FileText size={13} className="text-slate-500" />}
          <a href={`/dashboard/tasks/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline max-w-[200px] truncate">
            {f.name}
          </a>
          <span className="text-slate-400">{fileSize(f.size)}</span>
          {canRemove(f) && (
            <button onClick={() => onRemove(f)} disabled={busy} className="p-0.5 text-slate-400 hover:text-red-600 disabled:opacity-50" aria-label={t('Remove file', 'ፋይሉን አስወግድ')}>
              <X size={12} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 shrink-0">{label}:</dt>
      <dd className={`font-medium ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}
