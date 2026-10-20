'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, Check, ChevronLeft, ChevronRight, Pencil, Plus, Search, Send, Target, Trash2, Undo2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportTable, type ExportFormat } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { formatETB } from '@/lib/finance/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import {
  ACTIVITY_STATES,
  QUARTERS,
  QUARTER_LABEL,
  STATE_LABEL,
  STATUS_LABEL,
  isOverdue,
  planSummary,
  type ActivityState,
  type PlanActivity,
  type PlanStatus,
  type PlansData,
  type UnitPlan,
} from '@/lib/plans/types';
import { deleteActivity, loadPlans, remindPlans, reportActivity, reviewPlan, saveActivity, savePlanGoal, submitPlan } from './actions';
import { OwnTaskForm } from '@/components/tasks/OwnTaskForm';
import { STATUS as TASK_STATUS, type TaskStatus } from '@/lib/tasks/types';

const STATUS_STYLE: Record<PlanStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  RETURNED: 'bg-amber-100 text-amber-800',
};
const STATE_STYLE: Record<ActivityState, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600',
  ON_TRACK: 'bg-blue-50 text-blue-700',
  DELAYED: 'bg-amber-100 text-amber-800',
  DONE: 'bg-emerald-100 text-emerald-800',
  DROPPED: 'bg-slate-100 text-slate-400 line-through',
};

type Filter = 'ALL' | 'NONE' | PlanStatus;

/** Department plans: each department's activities for the year, approval, and quarterly progress. */
export default function PlansPage() {
  const { t, locale } = useLang();
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<PlansData | null>(null);
  const [unitId, setUnitId] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadPlans>>) => {
    if (res.mode === 'live') {
      setData(res.data);
      // Start where there is something to do: one's own department, or (reviewers) the first plan waiting for approval
      setUnitId((u) => {
        if (u && res.data.units.some((x) => x.id === u)) return u;
        const waiting = res.data.can_review ? res.data.plans.find((p) => p.status === 'SUBMITTED')?.unit_id : undefined;
        return waiting ?? res.data.editable_units.find((id) => res.data.units.some((x) => x.id === id)) ?? res.data.units[0]?.id ?? '';
      });
    }
    if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadPlans().then(apply);
  }, [apply]);

  const reload = (year = data?.year) => loadPlans(year).then(apply);
  const notify = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };
  const name = (u: { name_en: string; name_am: string }) => (locale === 'am' ? u.name_am : u.name_en);
  const now = data ? { year: data.current_year, quarter: data.current_quarter } : undefined;
  const planOf = (id: string) => data?.plans.find((p) => p.unit_id === id) ?? null;
  const statusOf = (id: string): Filter => planOf(id)?.status ?? 'NONE';

  /** Every activity of the departments shown, for the year — Excel / CSV */
  const exportPlans = async (format: ExportFormat) => {
    if (!data) return;
    const header = [
      t('Department', 'ክፍል'), t('Plan', 'እቅድ'), t('Main goal', 'ዋና ግብ'), t('No.', 'ተ.ቁ'), t('Activity', 'ተግባር'), t('Measure', 'መለኪያ'),
      t('Target', 'ግብ'), t('Achieved', 'የተሳካ'), t('Quarters', 'ሩብ ዓመታት'), t('Budget (birr)', 'በጀት (ብር)'), t('Responsible', 'ኃላፊ'),
      t('Done %', 'አፈጻጸም %'), t('State', 'ሁኔታ'), t('Overdue', 'ጊዜው ያለፈ'), t('Tasks done', 'የተጠናቀቁ ተግባራት'),
      t('Latest report', 'የመጨረሻ ሪፖርት'), t('Reported on', 'የቀረበበት'),
    ];
    const rows: (string | number | null)[][] = [];
    for (const u of data.units) {
      const plan = data.plans.find((x) => x.unit_id === u.id);
      const unitName = locale === 'am' ? u.name_am : u.name_en;
      if (!plan || plan.activities.length === 0) {
        rows.push([unitName, plan ? t(...STATUS_LABEL[plan.status]) : t('Not started', 'አልተጀመረም'), plan?.goal ?? '', null, '', '', null, null, '', null, '', null, '', '', '', '', '']);
        continue;
      }
      plan.activities.forEach((a, i) => {
        const latest = a.updates[0];
        rows.push([
          unitName, t(...STATUS_LABEL[plan.status]), i === 0 ? plan.goal : '', i + 1, a.title, a.measure, a.target, a.achieved,
          a.quarters.map((q) => `Q${q}`).join(', '), a.budget, a.responsible,
          plan.status === 'APPROVED' ? a.progress : null, plan.status === 'APPROVED' ? t(...STATE_LABEL[a.state]) : '',
          plan.status === 'APPROVED' && isOverdue(a, plan.year, now) ? t('Yes', 'አዎ') : '',
          a.tasks.length ? `${a.tasks.filter((x) => x.status === 'COMPLETED').length}/${a.tasks.length}` : '',
          latest?.note ?? '', latest ? formatEthiopianDate(latest.created_at.slice(0, 10), locale) : '',
        ]);
      });
    }
    await exportTable(`plans_${data.year}`, header, rows, format, { sheet: `Plans ${data.year}`, widths: [26, 18, 34, 5, 40, 22, 9, 9, 12, 12, 20, 9, 14, 9, 10, 40, 14] });
  };

  const remind = async () => {
    if (!data) return;
    setBusy(true);
    const res = await remindPlans(data.year);
    setBusy(false);
    if (!res.ok) return notify('error', res.error);
    notify('success', t(`Reminded: ${res.no_plan} without a sent plan, ${res.no_report} without this quarter’s progress`, `ተስታውሰዋል፦ እቅድ ያልላኩ ${res.no_plan}፣ የዚህን ሩብ ሪፖርት ያላቀረቡ ${res.no_report}`));
  };

  const choose = (id: string) => {
    setUnitId(id);
    // On a phone the plan is below the list: bring it into view
    if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: 0, NONE: 0, DRAFT: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0 };
    for (const u of data?.units ?? []) {
      c.ALL += 1;
      c[data?.plans.find((p) => p.unit_id === u.id)?.status ?? 'NONE'] += 1;
    }
    return c;
  }, [data]);
  const approved = (data?.plans ?? []).filter((p) => p.status === 'APPROVED').map((p) => planSummary(p, now));
  const overall = approved.length ? Math.round(approved.reduce((s, x) => s + x.progress, 0) / approved.length) : null;
  const overdueTotal = approved.reduce((s, x) => s + x.overdue, 0);

  const needle = search.trim().toLowerCase();
  const shown = (data?.units ?? []).filter((u) => (filter === 'ALL' || statusOf(u.id) === filter) && (!needle || `${u.name_en} ${u.name_am}`.toLowerCase().includes(needle)));
  const selected = data?.units.find((u) => u.id === unitId);
  const chips: [Filter, string, string][] = [
    ['ALL', t('All', 'ሁሉም'), 'bg-slate-900 text-white border-slate-900'],
    ['NONE', t('Not started', 'ያልጀመሩ'), 'bg-slate-600 text-white border-slate-600'],
    ['DRAFT', t(...STATUS_LABEL.DRAFT), 'bg-slate-700 text-white border-slate-700'],
    ['SUBMITTED', t(...STATUS_LABEL.SUBMITTED), 'bg-blue-700 text-white border-blue-700'],
    ['RETURNED', t(...STATUS_LABEL.RETURNED), 'bg-amber-600 text-white border-amber-600'],
    ['APPROVED', t(...STATUS_LABEL.APPROVED), 'bg-emerald-700 text-white border-emerald-700'],
  ];

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 inline-flex items-center gap-2">
            <Target size={22} /> {t('Department plans', 'የክፍላት ዓመታዊ እቅድ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Each department writes its activities for the year, sends the plan for approval, and reports progress every quarter.',
              'እያንዳንዱ ክፍል የዓመቱን ተግባራት ጽፎ ለማጽደቅ ይልካል፤ በየሩብ ዓመቱም አፈጻጸሙን ያሳውቃል።'
            )}
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2 self-start">
          <ExportButton onExport={exportPlans} disabled={data.units.length === 0} />
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1">
            <button onClick={() => reload(data.year - 1)} className="p-1.5 rounded hover:bg-slate-100" aria-label={t('Previous year', 'ያለፈው ዓመት')}>
              <ChevronLeft size={18} />
            </button>
            <span className="font-bold text-slate-900 px-2">{data.year} {t('E.C.', 'ዓ.ም')}</span>
            <button onClick={() => reload(data.year + 1)} className="p-1.5 rounded hover:bg-slate-100" aria-label={t('Next year', 'ቀጣዩ ዓመት')}>
              <ChevronRight size={18} />
            </button>
          </div>
          </div>
        )}
      </div>

      <AdminModeNotice mode={mode} error={error} />
      {mode === 'demo' && <p className="text-sm text-slate-500">{t('Plans need the database.', 'እቅዶች ዳታቤዝ ያስፈልጋቸዋል።')}</p>}

      {data && data.units.length === 0 && (
        <p className="card p-6 text-sm text-slate-500">{t('You are not assigned to a department yet.', 'ገና በክፍል አልተመደቡም።')}</p>
      )}

      {/* The year at a glance */}
      {data && data.units.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={t('Departments', 'ክፍላት')} value={String(counts.ALL)} />
          <Stat label={t('Waiting for approval', 'ማጽደቅ የሚጠብቁ')} value={String(counts.SUBMITTED)} warn={data.can_review && counts.SUBMITTED > 0} />
          <Stat label={t('Approved plans', 'የጸደቁ እቅዶች')} value={`${counts.APPROVED} / ${counts.ALL}`} />
          <Stat
            label={overdueTotal ? t(`Done overall · ${overdueTotal} overdue`, `አጠቃላይ አፈጻጸም · ${overdueTotal} ጊዜያቸው ያለፈ`) : t('Done overall (approved plans)', 'አጠቃላይ አፈጻጸም (የጸደቁ)')}
            value={overall === null ? '—' : `${overall}%`}
            warn={overdueTotal > 0}
          />
        </div>
      )}

      {data && data.units.length > 0 && (
        <div className={data.units.length > 1 ? 'grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] gap-6 items-start' : ''}>
          {data.units.length > 1 && (
            <aside className="card overflow-hidden lg:sticky lg:top-4">
              <div className="p-3 border-b border-slate-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-slate-800 text-sm">{t('Departments', 'ክፍላት')}</h2>
                  {data.can_review && (
                    <button disabled={busy} onClick={remind} className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100" title={t('Remind those behind', 'የዘገዩትን አስታውስ')}>
                      <BellRing size={13} /> {t('Remind', 'አስታውስ')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Find a department…', 'ክፍል ፈልግ…')} className="form-input text-xs pl-8 py-1.5" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {chips
                    .filter(([f]) => f === 'ALL' || counts[f] > 0)
                    .map(([f, label, on]) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${filter === f ? on : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {label} {counts[f]}
                      </button>
                    ))}
                </div>
              </div>
              <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                {shown.map((u) => {
                  const p = planOf(u.id);
                  const s = p ? planSummary(p, now) : null;
                  const active = unitId === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => choose(u.id)}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors ${active ? 'bg-rose-50/70 border-l-rose-800' : 'border-l-transparent hover:bg-slate-50'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm leading-snug ${active ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{name(u)}</span>
                          {p ? (
                            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[p.status]}`}>{t(...STATUS_LABEL[p.status])}</span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-slate-400">{t('Not started', 'አልተጀመረም')}</span>
                          )}
                        </div>
                        {p?.status === 'APPROVED' && s ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1">
                              <Bar value={s.progress} />
                            </div>
                            {s.overdue > 0 && (
                              <span className="text-[10px] font-semibold text-red-600 inline-flex items-center gap-0.5">
                                <AlertTriangle size={10} /> {s.overdue}
                              </span>
                            )}
                          </div>
                        ) : (
                          s &&
                          s.activities > 0 && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {t(`${s.activities} activities`, `${s.activities} ተግባራት`)}
                              {s.budget > 0 && ` · ${formatETB(s.budget)}`}
                            </div>
                          )
                        )}
                      </button>
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="p-6 text-center text-xs text-slate-400">{t('No department matches', 'የሚመሳሰል ክፍል የለም')}</li>}
              </ul>
            </aside>
          )}

          <div ref={detailRef} className="scroll-mt-4 min-w-0">
            {selected ? (
              <PlanView
                key={`${unitId}-${data.year}`}
                data={data}
                unitId={unitId}
                unitName={name(selected)}
                plan={planOf(unitId)}
                editable={data.editable_units.includes(unitId)}
                onChanged={(msg) => {
                  if (msg) notify('success', msg);
                  reload();
                }}
                onError={(msg) => notify('error', msg)}
              />
            ) : (
              <p className="card p-10 text-center text-sm text-slate-500">{t('Choose a department on the left.', 'በግራ በኩል ክፍል ይምረጡ።')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanView({
  data,
  unitId,
  unitName,
  plan,
  editable,
  onChanged,
  onError,
}: {
  data: PlansData;
  unitId: string;
  unitName: string;
  plan: UnitPlan | null;
  editable: boolean;
  onChanged: (msg?: string) => void;
  onError: (msg: string) => void;
}) {
  const { t, locale } = useLang();
  const [goal, setGoal] = useState(plan?.goal ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PlanActivity | 'NEW' | null>(null);
  const [reporting, setReporting] = useState<PlanActivity | null>(null);
  const [returning, setReturning] = useState(false);
  const [makingTask, setMakingTask] = useState<PlanActivity | null>(null);
  const open = !plan || plan.status === 'DRAFT' || plan.status === 'RETURNED';
  const canChange = editable && open;
  const now = { year: data.current_year, quarter: data.current_quarter };
  const summary = useMemo(() => (plan ? planSummary(plan, now) : null), [plan, now.year, now.quarter]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The plan row exists before the first activity is added */
  const ensurePlan = async (): Promise<string | null> => {
    if (plan) return plan.id;
    const res = await savePlanGoal(unitId, data.year, goal);
    if (!res.ok) {
      onError(res.error);
      return null;
    }
    return res.id;
  };
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return onError(res.error ?? '');
    onChanged(msg);
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            {unitName} · {data.year} {t('E.C.', 'ዓ.ም')}
          </h2>
          {plan && <span className={`text-xs font-semibold px-2.5 py-1 rounded ${STATUS_STYLE[plan.status]}`}>{t(...STATUS_LABEL[plan.status])}</span>}
        </div>
        {plan?.status === 'RETURNED' && plan.review_note && (
          <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <b>{t('To change', 'የሚስተካከለው')}:</b> {plan.review_note} <span className="text-xs text-amber-700">— {plan.reviewer}</span>
          </p>
        )}
        {plan?.status === 'APPROVED' && plan.reviewed_at && (
          <p className="text-xs text-emerald-700">
            {t('Approved', 'ጸድቋል')} · {plan.reviewer} · {formatEthiopianDate(plan.reviewed_at.slice(0, 10), locale)}
          </p>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Main goal this year', 'የዓመቱ ዋና ግብ')}</label>
          {canChange ? (
            <div className="flex gap-2 items-start">
              <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} maxLength={2000} className="form-input text-sm flex-1" />
              <button
                disabled={busy || goal === (plan?.goal ?? '')}
                onClick={() => run(() => savePlanGoal(unitId, data.year, goal), t('Goal saved', 'ግቡ ተቀምጧል'))}
                className="btn btn-secondary text-xs disabled:opacity-50"
              >
                {t('Save', 'አስቀምጥ')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{plan?.goal || '—'}</p>
          )}
        </div>
        {summary && plan?.status === 'APPROVED' && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <Stat label={t('Activities', 'ተግባራት')} value={String(summary.activities)} />
            <Stat label={t('Done', 'ተጠናቀዋል')} value={String(summary.done)} />
            <Stat label={t('Delayed', 'ዘግይተዋል')} value={String(summary.delayed)} warn={summary.delayed > 0} />
            <Stat label={t('Overdue', 'ጊዜያቸው አልፏል')} value={String(summary.overdue)} warn={summary.overdue > 0} />
            <Stat label={t('Overall', 'አጠቃላይ')} value={`${summary.progress}%`} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {canChange && plan && plan.activities.length > 0 && (
            <button disabled={busy} onClick={() => run(() => submitPlan(plan.id), t('Sent for approval', 'ለማጽደቅ ተልኳል'))} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <Send size={14} /> {t('Send for approval', 'ለማጽደቅ ላክ')}
            </button>
          )}
          {data.can_review && plan?.status === 'SUBMITTED' && (
            <button disabled={busy} onClick={() => run(() => reviewPlan(plan.id, 'APPROVED', ''), t('Plan approved', 'እቅዱ ጸድቋል'))} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <Check size={14} /> {t('Approve', 'አጽድቅ')}
            </button>
          )}
          {data.can_review && (plan?.status === 'SUBMITTED' || plan?.status === 'APPROVED') && (
            <button disabled={busy} onClick={() => setReturning(true)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
              <Undo2 size={14} /> {plan.status === 'APPROVED' ? t('Reopen for changes…', 'ለማስተካከያ ክፈት…') : t('Return for changes…', 'ለማስተካከያ መልስ…')}
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h3 className="font-bold text-slate-800 text-sm">{t('Activities', 'ተግባራት')}</h3>
          {canChange && (
            <button onClick={() => setEditing('NEW')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
              <Plus size={14} /> {t('Add an activity', 'ተግባር ጨምር')}
            </button>
          )}
        </div>
        {(!plan || plan.activities.length === 0) && (
          <p className="p-6 text-sm text-slate-500 text-center">
            {editable ? t('No activities yet — add what the department will do this year.', 'ገና ተግባር የለም — ክፍሉ በዚህ ዓመት የሚሠራውን ይጨምሩ።') : t('No plan yet.', 'ገና እቅድ የለም።')}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {plan?.activities.map((a, i) => {
            const overdue = plan.status === 'APPROVED' && isOverdue(a, plan.year, now);
            return (
              <li key={a.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 text-sm">
                      <span className="text-slate-400 font-normal mr-1.5">{i + 1}.</span>
                      {a.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                      {(a.measure || a.target !== null) && (
                        <span>
                          🎯 {a.measure}
                          {a.target !== null && ` · ${a.achieved ?? 0} / ${a.target}`}
                        </span>
                      )}
                      {a.budget !== null && <span>💰 {formatETB(a.budget)}</span>}
                      {a.responsible && <span>👤 {a.responsible}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {a.quarters.map((q) => (
                        <span key={q} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${q === data.current_quarter && plan.year === data.current_year ? 'bg-rose-100 text-rose-900' : 'bg-slate-100 text-slate-600'}`}>
                          {t(...QUARTER_LABEL[q]).split(' · ')[0]}
                        </span>
                      ))}
                      {overdue && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 inline-flex items-center gap-1">
                          <AlertTriangle size={10} /> {t('Overdue', 'ጊዜው አልፏል')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canChange && (
                      <>
                        <button onClick={() => setEditing(a)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label={t('Edit', 'አርትዕ')}>
                          <Pencil size={14} />
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => window.confirm(t('Remove this activity?', 'ይህ ተግባር ይወገድ?')) && run(() => deleteActivity(plan.id, a.id), t('Removed', 'ተወግዷል'))}
                          className="p-1.5 rounded text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={t('Remove', 'አስወግድ')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {editable && plan.status === 'APPROVED' && (
                      <button onClick={() => setReporting(a)} className="btn btn-secondary text-xs">
                        {t('Report progress', 'አፈጻጸም አሳውቅ')}
                      </button>
                    )}
                  </div>
                </div>
                {plan.status === 'APPROVED' && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Bar value={a.progress} />
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STATE_STYLE[a.state]}`}>{t(...STATE_LABEL[a.state])}</span>
                  </div>
                )}
                {/* Tasks that carry it out */}
                {plan.status === 'APPROVED' && (a.tasks.length > 0 || editable) && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600">
                        🗂️{' '}
                        {a.tasks.length
                          ? t(`Tasks: ${a.tasks.filter((x) => x.status === 'COMPLETED').length} of ${a.tasks.length} done`, `ተግባራት፦ ${a.tasks.length} ውስጥ ${a.tasks.filter((x) => x.status === 'COMPLETED').length} ተጠናቀዋል`)
                          : t('Give it to someone as a task, to follow it up.', 'ለመከታተል ለአንድ ሰው እንደ ተግባር ይስጡ።')}
                      </span>
                      {editable && (
                        <button onClick={() => setMakingTask(a)} className="text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1">
                          <Plus size={12} /> {t('Task', 'ተግባር')}
                        </button>
                      )}
                    </div>
                    {a.tasks.map((x) => (
                      <a key={x.id} href={`/dashboard/tasks?open=${x.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs hover:bg-white rounded px-1 py-0.5">
                        <span className="font-mono text-slate-400">{x.task_no}</span>
                        <span className="text-slate-800 flex-1 min-w-[8rem] truncate">{x.title}</span>
                        {x.assignee && <span className="text-slate-500">👤 {x.assignee}</span>}
                        <span className={`${TASK_STATUS[x.status as TaskStatus]?.cls ?? 'badge'} text-[10px]`}>{TASK_STATUS[x.status as TaskStatus] ? t(...TASK_STATUS[x.status as TaskStatus].label) : x.status}</span>
                        <span className="text-slate-500 w-9 text-right">{x.progress}%</span>
                      </a>
                    ))}
                  </div>
                )}
                {a.updates.length > 0 && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer text-slate-500">
                      {t(`${a.updates.length} progress report(s)`, `${a.updates.length} የአፈጻጸም ሪፖርት(ዎች)`)}
                    </summary>
                    <ul className="mt-1.5 space-y-1 pl-3 border-l-2 border-slate-100">
                      {a.updates.map((u) => (
                        <li key={u.id}>
                          <b>{t(...QUARTER_LABEL[u.quarter]).split(' · ')[0]}</b> · {u.progress}% · {t(...STATE_LABEL[u.state])}
                          {u.achieved !== null && ` · ${u.achieved}`}
                          {u.note && <span className="text-slate-700"> — {u.note}</span>}
                          <span className="text-slate-400"> · {u.author} · {formatEthiopianDate(u.created_at.slice(0, 10), locale)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {editing && (
        <ActivityDialog
          activity={editing === 'NEW' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const planId = await ensurePlan();
            if (!planId) return null;
            const res = await saveActivity(planId, input, editing === 'NEW' ? undefined : editing.id);
            if (!res.ok) return res.error;
            setEditing(null);
            onChanged(t('Activity saved', 'ተግባሩ ተቀምጧል'));
            return null;
          }}
        />
      )}
      {reporting && (
        <ReportDialog
          activity={reporting}
          quarter={plan?.year === data.current_year ? data.current_quarter : 4}
          onClose={() => setReporting(null)}
          onSave={async (input) => {
            const res = await reportActivity(reporting.id, input);
            if (!res.ok) return res.error;
            setReporting(null);
            onChanged(t('Progress reported', 'አፈጻጸሙ ተመዝግቧል'));
            return null;
          }}
        />
      )}
      {makingTask && plan && (
        <OwnTaskForm
          units={[{ id: unitId, name: unitName, people: data.people[unitId] ?? [] }]}
          unitId={unitId}
          activity={{ id: makingTask.id, label: makingTask.title }}
          defaultTitle={makingTask.title}
          onClose={() => setMakingTask(null)}
          onDone={(msg) => {
            setMakingTask(null);
            onChanged(msg);
          }}
        />
      )}
      {returning && plan && (
        <ReturnDialog
          approved={plan.status === 'APPROVED'}
          onClose={() => setReturning(false)}
          onSave={async (note) => {
            const res = await reviewPlan(plan.id, 'RETURNED', note);
            if (!res.ok) return res.error;
            setReturning(false);
            onChanged(t('Returned to the department', 'ለክፍሉ ተመልሷል'));
            return null;
          }}
        />
      )}
    </div>
  );
}

type ActivityInput = { title: string; measure: string; target: string; quarters: number[]; budget: string; responsible: string };

function ActivityDialog({ activity, onClose, onSave }: { activity: PlanActivity | null; onClose: () => void; onSave: (a: ActivityInput) => Promise<string | null> }) {
  const { t } = useLang();
  const [form, setForm] = useState<ActivityInput>({
    title: activity?.title ?? '',
    measure: activity?.measure ?? '',
    target: activity?.target === null || activity?.target === undefined ? '' : String(activity.target),
    quarters: activity?.quarters ?? [],
    budget: activity?.budget === null || activity?.budget === undefined ? '' : String(activity.budget),
    responsible: activity?.responsible ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof ActivityInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const problem = await onSave(form);
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Modal isOpen onClose={onClose} title={activity ? t('Edit activity', 'ተግባር አርትዕ') : t('New activity', 'አዲስ ተግባር')} maxWidth="lg">
      <form onSubmit={save} className="space-y-4">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <Field label={t('What will be done', 'የሚሠራው ተግባር') + ' *'}>
          <textarea required value={form.title} onChange={set('title')} rows={2} maxLength={300} placeholder={t('e.g. Train 30 new choir members', 'ለምሳሌ፦ 30 አዳዲስ ዘማሪያንን ማሰልጠን')} className="form-input text-sm" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('How success is measured', 'መለኪያ')}>
            <input value={form.measure} onChange={set('measure')} maxLength={200} placeholder={t('e.g. members trained', 'ለምሳሌ፦ የሰለጠኑ አባላት')} className="form-input text-sm" />
          </Field>
          <Field label={t('Target (number)', 'ግብ (ቁጥር)')}>
            <input type="number" min={0} step="any" value={form.target} onChange={set('target')} className="form-input text-sm" />
          </Field>
          <Field label={t('Budget (birr)', 'በጀት (ብር)')}>
            <input type="number" min={0} step="0.01" value={form.budget} onChange={set('budget')} className="form-input text-sm" />
          </Field>
          <Field label={t('Responsible', 'ኃላፊ')}>
            <input value={form.responsible} onChange={set('responsible')} maxLength={200} className="form-input text-sm" />
          </Field>
        </div>
        <Field label={t('When (quarters)', 'መቼ (ሩብ ዓመት)') + ' *'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUARTERS.map((q) => (
              <label key={q} className="flex items-center gap-2 text-sm text-slate-700 rounded-lg border border-slate-200 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={form.quarters.includes(q)}
                  onChange={(e) => setForm((f) => ({ ...f, quarters: e.target.checked ? [...f.quarters, q] : f.quarters.filter((x) => x !== q) }))}
                />
                {t(...QUARTER_LABEL[q])}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy || form.quarters.length === 0} className="btn btn-primary text-xs disabled:opacity-50">
            {busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type ReportInput = { quarter: number; progress: number; achieved: string; state: ActivityState; note: string };

function ReportDialog({ activity, quarter, onClose, onSave }: { activity: PlanActivity; quarter: number; onClose: () => void; onSave: (r: ReportInput) => Promise<string | null> }) {
  const { t } = useLang();
  const [form, setForm] = useState<ReportInput>({
    quarter,
    progress: activity.progress,
    achieved: activity.achieved === null ? '' : String(activity.achieved),
    state: activity.state === 'NOT_STARTED' ? 'ON_TRACK' : activity.state,
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const problem = await onSave(form);
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Modal isOpen onClose={onClose} title={t('Report progress', 'አፈጻጸም አሳውቅ')} subtitle={activity.title} maxWidth="lg">
      <form onSubmit={save} className="space-y-4">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Quarter', 'ሩብ ዓመት')}>
            <select value={form.quarter} onChange={(e) => setForm((f) => ({ ...f, quarter: Number(e.target.value) }))} className="form-input text-sm">
              {QUARTERS.map((q) => <option key={q} value={q}>{t(...QUARTER_LABEL[q])}</option>)}
            </select>
          </Field>
          <Field label={t('State', 'ሁኔታ')}>
            <select value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value as ActivityState, progress: e.target.value === 'DONE' ? 100 : f.progress }))} className="form-input text-sm">
              {ACTIVITY_STATES.map((s) => <option key={s} value={s}>{t(...STATE_LABEL[s])}</option>)}
            </select>
          </Field>
          <Field label={t(`Done so far: ${form.progress}%`, `እስካሁን የተሠራ፦ ${form.progress}%`)}>
            <input type="range" min={0} max={100} step={5} value={form.progress} disabled={form.state === 'DONE'} onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) }))} className="w-full" />
          </Field>
          <Field label={activity.target !== null ? t(`Achieved (target ${activity.target})`, `የተሳካ (ግብ ${activity.target})`) : t('Achieved (number)', 'የተሳካ (ቁጥር)')}>
            <input type="number" min={0} step="any" value={form.achieved} onChange={(e) => setForm((f) => ({ ...f, achieved: e.target.value }))} className="form-input text-sm" />
          </Field>
        </div>
        <Field label={t('Note (what was done, problems)', 'ማስታወሻ (የተሠራው፣ ችግሮች)')}>
          <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={3} maxLength={2000} className="form-input text-sm" />
        </Field>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-50">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReturnDialog({ approved, onClose, onSave }: { approved: boolean; onClose: () => void; onSave: (note: string) => Promise<string | null> }) {
  const { t } = useLang();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal isOpen onClose={onClose} title={approved ? t('Reopen the plan for changes', 'እቅዱን ለማስተካከያ ክፈት') : t('Return for changes', 'ለማስተካከያ መልስ')} maxWidth="md">
      <div className="space-y-3">
        {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <label className="text-xs font-semibold text-slate-700 block">{t('What should the department change?', 'ክፍሉ ምን ማስተካከል አለበት?')}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} className="form-input text-sm" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button
            type="button"
            disabled={busy || note.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const problem = await onSave(note);
              setBusy(false);
              if (problem) setError(problem);
            }}
            className="btn btn-primary text-xs disabled:opacity-50"
          >
            {t('Send back', 'መልስ')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${value >= 100 ? 'bg-emerald-500' : 'bg-rose-800'}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-9 text-right">{value}%</span>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className={`text-lg font-semibold ${warn ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
