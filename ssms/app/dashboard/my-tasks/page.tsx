'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, ClipboardCheck, Hourglass, Send } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { OPEN_STATUSES, PRIORITY, STATUS, UPDATE_KIND, WORK_STATUSES, isOverdue, type MyTask } from '@/lib/tasks/types';
import { loadMyTasks, reportTask } from '@/app/dashboard/tasks/actions';

const STRIPE: Record<MyTask['priority'], string> = {
  LOW: 'border-l-slate-300',
  NORMAL: 'border-l-blue-400',
  HIGH: 'border-l-amber-500',
  URGENT: 'border-l-red-600',
};

/** The tasks given to me by my department (or the Executive Committee), and reporting on them. */
export default function MyTasksPage() {
  const { t } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const today = todayIso();

  const apply = useCallback((res: Awaited<ReturnType<typeof loadMyTasks>>) => {
    if (res.mode === 'live') setTasks(res.data.tasks);
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadMyTasks().then(apply);
  }, [apply]);
  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const open = tasks.filter((x) => OPEN_STATUSES.includes(x.status));
  const finished = tasks.filter((x) => !OPEN_STATUSES.includes(x.status));
  const overdue = open.filter((x) => isOverdue(x, today)).length;
  const waiting = open.filter((x) => x.status === 'SUBMITTED').length;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2">
          <ClipboardCheck size={22} /> {t('My tasks', 'ተግባሮቼ')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('Work given to you. Tell how far you are, and press “Done” when it is finished.', 'የተሰጠዎት ሥራ። የደረሱበትን ያሳውቁ፤ ሲጨርሱ «ጨርሻለሁ» ይጫኑ።')}
        </p>
      </div>
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi value={open.length - waiting} label={t('To do', 'የሚሠሩ')} tone="text-blue-700" />
          <Kpi value={overdue} label={t('Past the due date', 'ጊዜያቸው ያለፈ')} tone={overdue ? 'text-red-600' : 'text-slate-400'} />
          <Kpi value={finished.length} label={t('Finished', 'የተጠናቀቁ')} tone="text-emerald-600" />
        </div>
      )}

      {mode === 'live' && open.length === 0 && (
        <div className="card p-10 text-center">
          <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
          <p className="mt-3 font-semibold text-slate-800">{t('Nothing to do right now', 'አሁን የሚሠራ ተግባር የለም')}</p>
          <p className="text-sm text-slate-500 mt-1">{t('When your department gives you a task, it shows here (and on Telegram).', 'ክፍልዎ ተግባር ሲሰጥዎ እዚህ (እና በቴሌግራም) ይታያል።')}</p>
        </div>
      )}

      <div className="space-y-4">
        {open.map((task) => (
          <TaskCard key={task.id} task={task} today={today} onSaved={(msg) => { notify('success', msg); loadMyTasks().then(apply); }} onError={(msg) => notify('error', msg)} />
        ))}
      </div>

      {finished.length > 0 && (
        <div>
          <button onClick={() => setShowDone((v) => !v)} className="text-sm font-semibold text-slate-600 inline-flex items-center gap-1">
            <ChevronDown size={16} className={showDone ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {t(`Finished (${finished.length})`, `የተጠናቀቁ (${finished.length})`)}
          </button>
          {showDone && (
            <div className="space-y-3 mt-3">
              {finished.map((task) => <TaskCard key={task.id} task={task} today={today} onSaved={() => {}} onError={() => {}} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, today, onSaved, onError }: { task: MyTask; today: string; onSaved: (msg: string) => void; onError: (msg: string) => void }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(task.progress);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canReport = WORK_STATUSES.includes(task.status);
  const late = isOverdue(task, today);
  const date = (iso: string | null) => (iso ? formatEthiopianDate(iso.slice(0, 10), locale) : '');
  const latest = task.updates.find((u) => u.kind === 'PROGRESS' || u.kind === 'RETURNED');

  const send = async (done: boolean) => {
    setBusy(true);
    const res = await reportTask(task.id, { note: note.trim() || (done ? t('Done', 'ተጠናቋል') : t(`${progress}% done`, `${progress}% ተሠርቷል`)), progress: done ? 100 : progress, submit: done });
    setBusy(false);
    if (!res.ok) return onError(res.error);
    setOpen(false);
    setNote('');
    onSaved(
      done
        ? task.internal
          ? t('Sent to your department head for review', 'ለክፍልዎ ኃላፊ ለግምገማ ተልኳል')
          : t('Your part is marked done — your head was told', 'ድርሻዎ ተጠናቋል ተብሏል — ኃላፊዎ ተነግሯቸዋል')
        : t('Progress saved — your head can see it', 'ሂደቱ ተቀምጧል — ኃላፊዎ ያዩታል')
    );
  };

  return (
    <div className={`card border-l-4 ${STRIPE[task.priority]} p-4 space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">{task.title}</h3>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-mono">{task.task_no}</span>
            <span>{t('From', 'ከ')}: {task.given_by || (locale === 'am' ? task.unit_am : task.unit)}</span>
            {task.due_date && (
              <span className={`inline-flex items-center gap-1 ${late ? 'text-red-600 font-semibold' : ''}`}>
                <CalendarClock size={12} /> {date(task.due_date)}{late ? ` · ${t('overdue', 'ጊዜው አልፏል')}` : ''}
              </span>
            )}
            {task.priority !== 'NORMAL' && <span className={PRIORITY[task.priority].cls}>{t(...PRIORITY[task.priority].label)}</span>}
          </div>
          {task.plan_activity && <div className="text-[11px] text-rose-800 mt-1">🎯 {task.plan_activity}</div>}
        </div>
        <span className={STATUS[task.status].cls}>{task.status === 'SUBMITTED' ? t('Waiting for review', 'ግምገማ ይጠብቃል') : t(...STATUS[task.status].label)}</span>
      </div>

      {task.details && <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.details}</p>}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full transition-all ${task.progress >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-700 w-10 text-right">{task.progress}%</span>
      </div>

      {task.status === 'RETURNED' && latest?.kind === 'RETURNED' && (
        <p className="text-xs p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800">↩ {t('Sent back', 'ተመልሷል')}: {latest.note}</p>
      )}
      {task.status === 'SUBMITTED' && (
        <p className="text-xs text-amber-800 inline-flex items-center gap-1.5"><Hourglass size={13} /> {t('You said it is done — waiting for your head to review it.', 'ጨርሻለሁ ብለዋል — ኃላፊዎ እስኪገመግሙ ይጠብቃል።')}</p>
      )}

      {canReport && !open && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOpen(true)} className="btn btn-secondary text-xs">{t('Update progress', 'ሂደቱን አሳውቅ')}</button>
          <button disabled={busy} onClick={() => send(true)} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <CheckCircle2 size={14} /> {task.internal ? t('Done', 'ጨርሻለሁ') : t('My part is done', 'ድርሻዬን ጨርሻለሁ')}
          </button>
        </div>
      )}

      {canReport && open && (
        <div className="space-y-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
          <div className="flex flex-wrap gap-1.5">
            {[25, 50, 75].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setProgress(v)}
                className={`text-xs px-3 py-1 rounded-full border ${progress === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                {v}%
              </button>
            ))}
            <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="flex-1 min-w-[8rem] accent-blue-600" />
            <span className="text-xs font-mono w-10 text-right self-center">{progress}%</span>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder={t('What was done, what is left, any problem…', 'የተሠራው፣ የቀረው፣ ያጋጠመ ችግር…')} className="form-input text-sm bg-white" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button type="button" disabled={busy} onClick={() => send(false)} className="btn btn-secondary text-xs disabled:opacity-50">{t('Save progress', 'ሂደቱን አስቀምጥ')}</button>
            <button type="button" disabled={busy} onClick={() => send(true)} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Send size={13} /> {task.internal ? t('Done — send for review', 'ጨርሻለሁ — ለግምገማ ላክ') : t('My part is done', 'ድርሻዬን ጨርሻለሁ')}
            </button>
          </div>
        </div>
      )}

      {task.updates.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer text-slate-500">{t('History', 'ታሪክ')}</summary>
          <ul className="mt-1.5 space-y-1 pl-3 border-l-2 border-slate-100">
            {task.updates.map((u) => (
              <li key={u.id}>
                <b>{t(...UPDATE_KIND[u.kind])}</b>
                {u.progress !== null && u.kind === 'PROGRESS' && ` · ${u.progress}%`}
                {u.note && u.kind !== 'HANDED' && ` — ${u.note}`}
                <span className="text-slate-400"> · {date(u.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Kpi({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
