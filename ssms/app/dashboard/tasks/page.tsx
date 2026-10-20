'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList, Download, Plus, Repeat, Search, UserPlus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ProgressBar, TaskDetail, TaskForm } from '@/components/tasks/TaskDialogs';
import { OwnTaskForm, type OwnTaskUnit } from '@/components/tasks/OwnTaskForm';
import { stopRepeating } from '@/app/dashboard/tasks/actions';
import { runTasks, useTasks } from '@/lib/tasks/client';
import {
  FREQUENCY,
  isOverdue,
  meetingKey,
  onTime,
  OPEN_STATUSES,
  PRIORITY,
  SOURCE,
  STATUS,
  WORK_STATUSES,
  type Task,
} from '@/lib/tasks/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

type Show = 'OPEN' | 'REVIEW' | 'OVERDUE' | 'DONE' | 'ALL';
type Dialog = { kind: 'new' } | { kind: 'open' | 'edit'; id: string } | { kind: 'own'; parentId?: string } | null;

export default function TasksPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const data = useTasks();
  const today = todayIso();
  const canAssign = can('TASK_ASSIGN');
  const isHead = can('TASK_REPORT');

  const [view, setView] = useState<'tasks' | 'units' | 'repeating'>('tasks');
  const [show, setShow] = useState<Show>('OPEN');
  const [unit, setUnit] = useState('ALL');
  const [meeting, setMeeting] = useState('ALL');
  const [search, setSearch] = useState('');
  // ?open=<task id> (links from the dashboard) opens that task once the list has loaded
  const openId = useSearchParams().get('open');
  const [dialog, setDialog] = useState<Dialog>(() => (openId ? { kind: 'open', id: openId } : null));
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const closeDialog = () => {
    setDialog(null);
    if (openId) window.history.replaceState(null, '', '/dashboard/tasks');
  };
  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  };
  const done = (text: string) => {
    closeDialog();
    say('success', text);
  };
  const stop = async (seriesId: string) => {
    if (!window.confirm(t('Stop giving this task again? Tasks already given stay.', 'ይህ ተግባር ከእንግዲህ አይሰጥም? ቀድሞ የተሰጡት ይቆያሉ።'))) return;
    const res = await runTasks(() => stopRepeating(seriesId));
    if (res.ok) say('success', t('Stopped — it will not be given again', 'ቆሟል — ከእንግዲህ አይሰጥም'));
    else say('error', res.error);
  };

  const focus = (next: Show) => {
    setShow(next);
    setView('tasks');
  };
  const unitLabel = (task: Task) => (locale === 'am' ? task.unit_am : task.unit);
  const date = (iso: string | null) => (iso ? formatEthiopianDate(iso.slice(0, 10), locale) : '—');

  const matchesShow: Record<Show, (task: Task) => boolean> = {
    OPEN: (x) => OPEN_STATUSES.includes(x.status),
    REVIEW: (x) => x.status === 'SUBMITTED',
    OVERDUE: (x) => isOverdue(x, today),
    DONE: (x) => x.status === 'COMPLETED' || x.status === 'CANCELLED',
    ALL: () => true,
  };

  const meetings = [
    ...new Map(
      data.tasks
        .filter((x) => x.source === 'MEETING')
        .map((x) => [meetingKey(x), { key: meetingKey(x), title: x.meeting_title, date: x.meeting_date ?? '' }])
    ).values(),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const needle = search.trim().toLowerCase();
  const rows = data.tasks
    .filter(matchesShow[show])
    .filter((x) => unit === 'ALL' || x.unit_id === unit)
    .filter((x) => meeting === 'ALL' || (meeting === 'ROUTINE' ? x.source === 'ROUTINE' : meetingKey(x) === meeting))
    .filter((x) => !needle || `${x.task_no} ${x.title} ${x.unit} ${x.unit_am} ${x.decision_ref} ${x.assignee}`.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
        (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
        b.created_at.localeCompare(a.created_at)
    );

  const counts = {
    waiting: data.tasks.filter((x) => WORK_STATUSES.includes(x.status)).length,
    overdue: data.tasks.filter((x) => isOverdue(x, today)).length,
    review: data.tasks.filter((x) => x.status === 'SUBMITTED').length,
    completed: data.tasks.filter((x) => x.status === 'COMPLETED'),
  };
  const onTimeRate = counts.completed.length ? Math.round((counts.completed.filter(onTime).length / counts.completed.length) * 100) : null;

  // Follow-up per department
  const byUnit = [...new Set(data.tasks.map((x) => x.unit_id))]
    .map((id) => {
      const mine = data.tasks.filter((x) => x.unit_id === id && x.status !== 'CANCELLED');
      const completed = mine.filter((x) => x.status === 'COMPLETED');
      return {
        id,
        name: unitLabel(mine[0] ?? data.tasks.find((x) => x.unit_id === id)!),
        total: mine.length,
        working: mine.filter((x) => WORK_STATUSES.includes(x.status)).length,
        overdue: mine.filter((x) => isOverdue(x, today)).length,
        review: mine.filter((x) => x.status === 'SUBMITTED').length,
        completed: completed.length,
        onTime: completed.length ? Math.round((completed.filter(onTime).length / completed.length) * 100) : null,
      };
    })
    .filter((u) => u.total > 0)
    .sort((a, b) => b.overdue - a.overdue || b.working - a.working || a.name.localeCompare(b.name));

  const exportExcel = async () => {
    const header = [
      t('No.', 'ቁጥር'), t('Task', 'ተግባር'), t('Given by', 'የሰጠው አካል'), t('Department', 'ክፍል'), t('Comes from', 'ምንጭ'),
      t('Meeting', 'ስብሰባ'), t('Meeting date', 'የስብሰባው ቀን'), t('Decision no.', 'የውሳኔ ቁጥር'), t('Priority', 'ቅድሚያ'),
      t('Given on', 'የተሰጠበት'), t('Due', 'የማጠናቀቂያ ቀን'), t('Status', 'ሁኔታ'), t('Progress %', 'ሂደት %'),
      t('Latest report', 'የመጨረሻ ሪፖርት'), t('Completed on', 'የተጠናቀቀበት'),
    ].map(headerCell);
    const body = rows.map((x) => {
      const latest = [...x.updates].reverse().find((u) => u.kind === 'PROGRESS' || u.kind === 'SUBMITTED');
      return [
        x.task_no, cell(x.title), cell(locale === 'am' ? x.from_unit_am : x.from_unit), cell(unitLabel(x)), t(...SOURCE[x.source]),
        cell(x.meeting_title), x.meeting_date ? date(x.meeting_date) : '', cell(x.decision_ref), t(...PRIORITY[x.priority].label),
        date(x.created_at), x.due_date ? date(x.due_date) : '',
        `${t(...STATUS[x.status].label)}${isOverdue(x, today) ? ` (${t('overdue', 'ጊዜው አልፏል')})` : ''}`,
        x.progress, cell(latest?.note ?? ''), x.completed_at ? date(x.completed_at) : '',
      ];
    });
    await downloadXlsx(`tasks_${today}`, [header, ...body], {
      sheet: 'Tasks',
      widths: [14, 40, 24, 30, 16, 30, 16, 14, 10, 16, 16, 24, 10, 50, 16],
    });
  };

  const selected = dialog && (dialog.kind === 'open' || dialog.kind === 'edit') ? data.tasks.find((x) => x.id === dialog.id) : undefined;
  /** Departments this user gives tasks in, with their people (migration 035) */
  const ownUnits: OwnTaskUnit[] = Object.entries(data.people)
    .map(([id, people]) => {
      const u = data.units.find((x) => x.id === id);
      return { id, name: u ? (locale === 'am' ? u.name_am : u.name_en) : '', people };
    })
    .filter((u) => u.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const parentTask = dialog?.kind === 'own' && dialog.parentId ? data.tasks.find((x) => x.id === dialog.parentId) : undefined;

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Tasks & Follow-up', 'ተግባራትና ክትትል')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Work given to departments — routinely or as meeting decisions — and their reports back',
              'ለክፍሎች የሚሰጡ ተግባራት — በመደበኛ ሥራ ወይም በስብሰባ ውሳኔ — እና የሚቀርቡ ሪፖርቶች'
            )}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}
          </button>
          {isHead && ownUnits.length > 0 && (
            <button
              onClick={() => setDialog({ kind: 'own' })}
              disabled={data.mode !== 'live'}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <UserPlus size={14} /> {t('Give to my people', 'ለክፍሌ ሰዎች ስጥ')}
            </button>
          )}
          {canAssign && (
            <button
              onClick={() => setDialog({ kind: 'new' })}
              disabled={data.mode === 'loading' || data.mode === 'error'}
              className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} /> {t('Give a task', 'ተግባር ስጥ')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={data.mode} error={data.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={counts.waiting} label={t('Waiting on departments', 'በክፍሎች የሚጠበቁ')} onClick={() => focus('OPEN')} />
        <Kpi value={counts.overdue} label={t('Past the due date', 'ጊዜያቸው ያለፈ')} tone={counts.overdue ? 'text-red-600' : undefined} onClick={() => focus('OVERDUE')} />
        <Kpi value={counts.review} label={t('Reports to review', 'ግምገማ የሚጠብቁ ሪፖርቶች')} tone={counts.review ? 'text-amber-600' : undefined} onClick={() => focus('REVIEW')} />
        <Kpi
          value={onTimeRate === null ? counts.completed.length : `${counts.completed.length} · ${onTimeRate}%`}
          label={t('Completed · on time', 'የተጠናቀቁ · በጊዜው')}
          tone="text-emerald-600"
          onClick={() => focus('DONE')}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start">
            {(canAssign || data.series.length ? (['tasks', 'units', 'repeating'] as const) : (['tasks', 'units'] as const)).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${view === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {v === 'tasks' ? t('Tasks', 'ተግባራት') : v === 'units' ? t('By department', 'በክፍል') : t('Repeating', 'የሚደጋገሙ')}
              </button>
            ))}
          </div>
          {view === 'tasks' && (
            <>
              <select value={show} onChange={(e) => setShow(e.target.value as Show)} className="form-input text-xs py-1.5 w-auto">
                <option value="OPEN">{t('Not finished', 'ያልተጠናቀቁ')}</option>
                <option value="REVIEW">{t('Reports to review', 'ግምገማ የሚጠብቁ')}</option>
                <option value="OVERDUE">{t('Past the due date', 'ጊዜያቸው ያለፈ')}</option>
                <option value="DONE">{t('Completed / cancelled', 'የተጠናቀቁ / የተሰረዙ')}</option>
                <option value="ALL">{t('All', 'ሁሉም')}</option>
              </select>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-xs py-1.5 w-auto max-w-[240px]">
                <option value="ALL">{t('All departments', 'ሁሉም ክፍሎች')}</option>
                {byUnit.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <select value={meeting} onChange={(e) => setMeeting(e.target.value)} className="form-input text-xs py-1.5 w-auto max-w-[260px]">
                <option value="ALL">{t('Any source', 'ማንኛውም ምንጭ')}</option>
                <option value="ROUTINE">{t(...SOURCE.ROUTINE)}</option>
                {meetings.map((m) => (
                  <option key={m.key} value={m.key}>{date(m.date)} — {m.title}</option>
                ))}
              </select>
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder={t('Search…', 'ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
              </div>
            </>
          )}
        </div>

        {view === 'tasks' ? (
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Task', 'ተግባር')}</th>
                  <th>{t('Department', 'ክፍል')}</th>
                  <th>{t('Due', 'የማጠናቀቂያ ቀን')}</th>
                  <th>{t('Progress', 'ሂደት')}</th>
                  <th>{t('Status', 'ሁኔታ')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const overdue = isOverdue(x, today);
                  return (
                    <tr key={x.id} className={x.status === 'CANCELLED' ? 'opacity-60' : ''}>
                      <td>
                        <button onClick={() => setDialog({ kind: 'open', id: x.id })} className="text-left">
                          <div className="font-semibold text-slate-900 hover:text-blue-700">{x.title}</div>
                          <div className="text-[11px] text-slate-400">
                            <span className="font-mono">{x.task_no}</span>
                            {x.source === 'MEETING' ? ` · ${x.meeting_title}${x.decision_ref ? ` · ${x.decision_ref}` : ''}` : ` · ${t(...SOURCE.ROUTINE)}`}
                            {x.repeats && (
                              <span className="ml-1 text-violet-600 inline-flex items-center gap-0.5">
                                · <Repeat size={10} /> {t(...FREQUENCY[x.repeats])}
                              </span>
                            )}
                            {x.priority !== 'NORMAL' && <span className={`ml-1 ${PRIORITY[x.priority].cls}`}>· {t(...PRIORITY[x.priority].label)}</span>}
                          </div>
                          {(x.internal || x.plan_activity || x.parent_task_no || x.parts.total > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {x.internal && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{t('Own task', 'የውስጥ')}</span>}
                              {x.plan_activity && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 max-w-[220px] truncate">🎯 {x.plan_activity}</span>}
                              {x.parent_task_no && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">🧩 {x.parent_task_no}</span>}
                              {x.parts.total > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">🧩 {x.parts.done}/{x.parts.total}</span>}
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="text-xs text-slate-700">
                        {unitLabel(x)}
                        {x.assignee && <div className="text-[11px] text-slate-500 mt-0.5">👤 {x.assignee}</div>}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        <div className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>{date(x.due_date)}</div>
                        {overdue && <div className="text-[11px] text-red-600">{t('overdue', 'ጊዜው አልፏል')}</div>}
                      </td>
                      <td><ProgressBar value={x.progress} /></td>
                      <td><span className={STATUS[x.status].cls}>{t(...STATUS[x.status].label)}</span></td>
                      <td className="text-right">
                        <button onClick={() => setDialog({ kind: 'open', id: x.id })} className="text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-1 rounded">
                          {x.status === 'SUBMITTED' && canAssign ? t('Review', 'ገምግም') : t('Open', 'ክፈት')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {data.mode !== 'loading' && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-sm text-slate-400 py-8">
                      <ClipboardList size={18} className="inline mr-1" /> {t('No tasks here.', 'እዚህ ምንም ተግባር የለም።')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : view === 'units' ? (
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Department', 'ክፍል')}</th>
                  <th className="text-center">{t('Given', 'የተሰጡ')}</th>
                  <th className="text-center">{t('Working on', 'በሥራ ላይ')}</th>
                  <th className="text-center">{t('Overdue', 'ጊዜው ያለፈ')}</th>
                  <th className="text-center">{t('To review', 'ግምገማ የሚጠብቁ')}</th>
                  <th className="text-center">{t('Completed', 'የተጠናቀቁ')}</th>
                  <th className="text-center">{t('On time', 'በጊዜው')}</th>
                </tr>
              </thead>
              <tbody>
                {byUnit.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      setUnit(u.id);
                      setShow('ALL');
                      setView('tasks');
                    }}
                  >
                    <td className="font-medium text-slate-900">{u.name}</td>
                    <td className="text-center tabular-nums">{u.total}</td>
                    <td className="text-center tabular-nums">{u.working}</td>
                    <td className="text-center tabular-nums"><span className={u.overdue ? 'text-red-600 font-bold' : ''}>{u.overdue}</span></td>
                    <td className="text-center tabular-nums"><span className={u.review ? 'text-amber-600 font-semibold' : ''}>{u.review}</span></td>
                    <td className="text-center tabular-nums">{u.completed}</td>
                    <td className="text-center tabular-nums">{u.onTime === null ? '—' : `${u.onTime}%`}</td>
                  </tr>
                ))}
                {data.mode !== 'loading' && byUnit.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-sm text-slate-400 py-8">{t('No tasks yet.', 'እስካሁን ተግባር የለም።')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Task', 'ተግባር')}</th>
                  <th>{t('Department', 'ክፍል')}</th>
                  <th>{t('Repeats', 'ይደገማል')}</th>
                  <th>{t('Next due', 'ቀጣይ ማጠናቀቂያ')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.series.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="font-semibold text-slate-900">{s.title}</div>
                      <div className="text-[11px] text-slate-400">{t('Set up by', 'ያዘጋጀው')} {s.created_by}</div>
                    </td>
                    <td className="text-xs text-slate-700">{locale === 'am' ? s.unit_am : s.unit}</td>
                    <td className="text-xs text-slate-700 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><Repeat size={12} className="text-violet-600" /> {t(...FREQUENCY[s.frequency])}</span>
                    </td>
                    <td className="text-xs text-slate-600 whitespace-nowrap">{date(s.next_due)}</td>
                    <td className="text-right">
                      {canAssign && (
                        <button onClick={() => stop(s.id)} className="text-xs text-red-600 hover:bg-red-50 font-semibold px-2 py-1 rounded">
                          {t('Stop', 'አቁም')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.mode !== 'loading' && data.series.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-slate-400 py-8">
                      {t('No repeating tasks. Choose “Repeats” when giving a task, e.g. a monthly report.', 'የሚደጋገም ተግባር የለም። ተግባር ሲሰጡ “ይደገማል” ይምረጡ፤ ለምሳሌ ወርሃዊ ሪፖርት።')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === 'new' && <TaskForm data={data} onClose={closeDialog} onDone={done} />}
      {dialog?.kind === 'edit' && selected && <TaskForm data={data} task={selected} onClose={() => setDialog({ kind: 'open', id: selected.id })} onDone={done} />}
      {dialog?.kind === 'open' && selected && (
        <TaskDetail
          task={selected}
          people={data.people[selected.unit_id] ?? []}
          onClose={closeDialog}
          onEdit={() => setDialog({ kind: 'edit', id: selected.id })}
          onGivePart={data.people[selected.unit_id] ? () => setDialog({ kind: 'own', parentId: selected.id }) : undefined}
          onDone={done}
        />
      )}
      {dialog?.kind === 'own' && (
        <OwnTaskForm
          units={parentTask ? ownUnits.filter((u) => u.id === parentTask.unit_id) : ownUnits}
          unitId={parentTask?.unit_id}
          parent={parentTask ? { id: parentTask.id, label: `${parentTask.task_no} — ${parentTask.title}` } : undefined}
          run={(save) => runTasks(save)}
          onClose={closeDialog}
          onDone={done}
        />
      )}
    </div>
  );
}

function Kpi({ value, label, tone, onClick }: { value: React.ReactNode; label: string; tone?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card p-5 text-left hover:border-blue-200 transition-colors">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </button>
  );
}
