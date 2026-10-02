'use client';

import React, { useState } from 'react';
import { CalendarCheck, CheckCircle2, Download, ShieldAlert } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ErrorBox, personName, useHrDialogs } from '@/components/hr/HrDialogs';
import { lastSunday, runHr, useHr } from '@/lib/hr/client';
import { activeSuspension, addDays, roleLabel, tally, type AttendanceMark } from '@/lib/hr/types';
import { saveServantAttendance } from '@/app/dashboard/hr/actions';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/attendance/store';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

type Mark = { status: AttendanceStatus; check_in: string };

const MARK_STYLE: Record<AttendanceStatus, { on: string; label: [string, string] }> = {
  PRESENT: { on: 'bg-emerald-600 text-white border-emerald-600', label: ['Present', 'የተገኘ'] },
  LATE: { on: 'bg-amber-500 text-white border-amber-500', label: ['Late', 'የዘገየ'] },
  ABSENT: { on: 'bg-red-600 text-white border-red-600', label: ['Absent', 'የቀረ'] },
  EXCUSED: { on: 'bg-blue-600 text-white border-blue-600', label: ['Excused', 'በፈቃድ'] },
};

const PERIODS = [4, 12, 26, 52];

export default function ServantAttendancePage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const hr = useHr();
  const canManage = can('HR_MANAGE');
  const today = todayIso();

  const [tab, setTab] = useState<'ROLL' | 'SUMMARY'>('ROLL');
  const [date, setDate] = useState(() => lastSunday(todayIso()));
  const [unit, setUnit] = useState('ALL');
  const [edits, setEdits] = useState<Record<string, Record<string, Mark | null>>>({});
  const [weeks, setWeeks] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const notify = (text: string) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  };
  const dialogs = useHrDialogs(notify);
  const name = (id: string) => personName(hr, id, locale);

  // ── Roll call ──────────────────────────────────────────────────────────────
  const onDay = hr.assignments.filter((a) => a.start_date <= date && (!a.end_date || a.end_date >= date) && (unit === 'ALL' || a.unit_id === unit));
  const savedDay = new Map(hr.attendance.filter((m) => m.date === date).map((m) => [m.person_id, m]));
  const rollIds = [
    ...new Set([
      ...onDay.map((a) => a.person_id),
      ...(unit === 'ALL' ? [...hr.homeroom.map((h) => h.person_id).filter((id): id is string => Boolean(id)), ...savedDay.keys()] : []),
    ]),
  ].sort((a, b) => name(a).localeCompare(name(b)));
  const dayEdits = edits[date] ?? {};
  const markOf = (id: string): Mark | null => {
    if (id in dayEdits) return dayEdits[id];
    const s = savedDay.get(id);
    return s ? { status: s.status, check_in: s.check_in } : null;
  };
  const setMark = (id: string, m: Mark | null) => setEdits((e) => ({ ...e, [date]: { ...(e[date] ?? {}), [id]: m } }));
  const rollMarks = rollIds.map(markOf);
  const count = (s: AttendanceStatus) => rollMarks.filter((m) => m?.status === s).length;
  const dirty = Object.keys(dayEdits).length > 0;

  const saveRoll = async () => {
    setBusy(true);
    setError('');
    const marks = Object.fromEntries(rollIds.map((id) => [id, markOf(id)]).filter(([, m]) => m)) as Record<string, Mark>;
    const res = await runHr(() => saveServantAttendance(date, rollIds, marks));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEdits((e) => {
      const next = { ...e };
      delete next[date];
      return next;
    });
    notify(t('Attendance saved', 'ተገኝነት ተመዝግቧል'));
  };

  // ── Summary ────────────────────────────────────────────────────────────────
  const from = addDays(today, -7 * weeks);
  const inPeriod = hr.attendance.filter((m) => m.date >= from && m.date <= today);
  const serving = new Set(hr.assignments.filter((a) => a.status === 'ACTIVE').map((a) => a.person_id));
  const byPerson = new Map<string, AttendanceMark[]>();
  for (const m of inPeriod) byPerson.set(m.person_id, [...(byPerson.get(m.person_id) ?? []), m]);
  const summary = [...new Set([...serving, ...byPerson.keys()])]
    .map((id) => ({ id, x: tally(byPerson.get(id) ?? []) }))
    .sort((a, b) => (a.x.rate ?? 101) - (b.x.rate ?? 101) || name(a.id).localeCompare(name(b.id)));
  const days = [...new Set(inPeriod.map((m) => m.date))].sort().reverse();
  const last12 = hr.attendance.filter((m) => m.date >= addDays(today, -84));
  const followUp = [...new Set(last12.map((m) => m.person_id))].filter((id) => last12.filter((m) => m.person_id === id && m.status === 'ABSENT').length >= 3);
  const lastDay = [...new Set(hr.attendance.map((m) => m.date))].sort().at(-1);
  const lastRate = lastDay ? tally(hr.attendance.filter((m) => m.date === lastDay)).rate : null;
  const rate12 = tally(last12).rate;
  const unitsOf = (id: string) =>
    hr.assignments.filter((a) => a.person_id === id && a.status === 'ACTIVE').map((a) => `${roleLabel(a, t)} — ${locale === 'am' ? a.unit_am : a.unit}`).join('; ');

  const exportExcel = async () => {
    const header = [t('Servant', 'አገልጋይ'), t('Serving as', 'የአገልግሎት ኃላፊነት'), t('Present', 'የተገኘ'), t('Late', 'የዘገየ'), t('Absent', 'የቀረ'), t('Excused', 'በፈቃድ'), t('Attendance %', 'ተገኝነት %')].map(headerCell);
    const body = summary.map(({ id, x }) => [cell(name(id)), unitsOf(id), x.present, x.late, x.absent, x.excused, x.rate]);
    await downloadXlsx(`servant_attendance_${weeks}w_${today}`, [header, ...body], { sheet: 'Attendance', widths: [26, 50, 9, 9, 9, 9, 12] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      {dialogs.node}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Servant Attendance', 'የአገልጋዮች ተገኝነት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Take the roll on service days and see who needs a follow-up call', 'በአገልግሎት ቀን ተገኝነት ይያዙ፤ ክትትል የሚያስፈልጋቸውን ይለዩ')}</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start sm:self-auto bg-white">
          {(['ROLL', 'SUMMARY'] as const).map((v) => (
            <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${tab === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {v === 'ROLL' ? t('Roll call', 'ተገኝነት መያዣ') : t('Summary', 'ማጠቃለያ')}
            </button>
          ))}
        </div>
      </div>

      <AdminModeNotice mode={hr.mode} error={hr.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={lastRate === null ? '—' : `${lastRate}%`} label={lastDay ? `${t('Last service day', 'የመጨረሻው የአገልግሎት ቀን')} · ${formatEthiopianDate(lastDay, locale)}` : t('Last service day', 'የመጨረሻው የአገልግሎት ቀን')} />
        <Kpi value={rate12 === null ? '—' : `${rate12}%`} label={t('Attendance, last 12 weeks', 'ተገኝነት፣ ያለፉት 12 ሳምንታት')} />
        <Kpi value={followUp.length} label={t('3+ absences in 12 weeks', 'በ12 ሳምንት 3 እና ከዚያ በላይ የቀሩ')} warn={followUp.length > 0} />
        <Kpi value={new Set(last12.map((m) => m.date)).size} label={t('Days recorded, 12 weeks', 'የተያዙ ቀናት፣ 12 ሳምንት')} />
      </div>

      {tab === 'ROLL' ? (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Service day', 'የአገልግሎት ቀን')}</label>
              <input type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="form-input text-sm w-auto" />
            </div>
            <div className="text-sm font-semibold text-slate-800 sm:pb-2">{formatEthiopianDate(date, locale, { weekday: true })}</div>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-xs py-1.5 w-auto max-w-[260px] sm:ml-auto">
              <option value="ALL">{t('All servants', 'ሁሉም አገልጋዮች')}</option>
              {hr.units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name}</option>)}
            </select>
          </div>
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-600 tabular-nums">
              {rollMarks.filter(Boolean).length} / {rollIds.length} {t('marked', 'ተመዝግበዋል')} · {t('Present', 'የተገኘ')} {count('PRESENT')} · {t('Late', 'የዘገየ')} {count('LATE')} · {t('Absent', 'የቀረ')} {count('ABSENT')} · {t('Excused', 'በፈቃድ')} {count('EXCUSED')}
            </span>
            {canManage && (
              <button
                type="button"
                disabled={rollIds.length === 0}
                onClick={() => {
                  const rest = Object.fromEntries(rollIds.filter((id) => !markOf(id)).map((id) => [id, { status: 'PRESENT' as const, check_in: '' }]));
                  setEdits((e) => ({ ...e, [date]: { ...(e[date] ?? {}), ...rest } }));
                }}
                className="btn btn-secondary text-xs py-1.5"
              >
                {t('Mark the rest present', 'የቀሩትን የተገኘ አድርግ')}
              </button>
            )}
          </div>

          {rollIds.length === 0 ? (
            <p className="p-8 text-sm text-slate-500 text-center">
              {t('No one was assigned here on this day. Assign servants under HR → Assignments.', 'በዚህ ቀን የተመደበ አገልጋይ የለም። በሰው ሀብት → ምደባዎች ይመድቡ።')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rollIds.map((id, i) => {
                const m = markOf(id);
                const roles = onDay.filter((a) => a.person_id === id);
                const suspended = activeSuspension(hr.cases, id, date);
                return (
                  <li key={id} className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <button onClick={() => dialogs.openPerson(id)} className="text-sm font-medium text-slate-900 hover:text-blue-700 text-left">
                        <span className="text-slate-400 font-normal mr-2">{i + 1}.</span>{name(id)}
                      </button>
                      {suspended && <span className="ml-2 text-[11px] font-semibold text-red-700 inline-flex items-center gap-0.5"><ShieldAlert size={11} />{t('Suspended', 'ታግዷል')}</span>}
                      <div className="text-[11px] text-slate-400 ml-6">{roles.map((a) => `${roleLabel(a, t)} — ${locale === 'am' ? a.unit_am : a.unit}`).join('; ')}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                      {ATTENDANCE_STATUSES.map((st) => {
                        const on = m?.status === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            disabled={!canManage}
                            aria-pressed={on}
                            onClick={() => setMark(id, on ? null : { status: st, check_in: m?.check_in ?? '' })}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors disabled:cursor-default ${on ? MARK_STYLE[st].on : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                          >
                            {t(...MARK_STYLE[st].label)}
                          </button>
                        );
                      })}
                      {m?.status !== 'PRESENT' && m?.status !== 'LATE' && <span className="hidden md:block w-[110px]" />}
                      {(m?.status === 'PRESENT' || m?.status === 'LATE') && (
                        <input
                          type="time"
                          aria-label={t('Arrived at', 'የደረሰበት ሰዓት')}
                          title={t('Arrived at', 'የደረሰበት ሰዓት')}
                          disabled={!canManage}
                          value={m.check_in}
                          onChange={(e) => setMark(id, { ...m, check_in: e.target.value })}
                          className="form-input text-xs py-1 w-[110px]"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canManage && rollIds.length > 0 && (
            <div className="p-4 border-t border-slate-100 space-y-3">
              {error && <ErrorBox text={error} />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">{t('Click a selected status again to clear it. Unmarked servants are not counted.', 'የተመረጠውን እንደገና በመጫን ያጽዱ። ያልተመረጡ አይቆጠሩም።')}</p>
                <button onClick={saveRoll} disabled={busy || !dirty} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
                  <CheckCircle2 size={14} /> {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save attendance', 'ተገኝነት መዝግብ')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="card overflow-hidden xl:col-span-2">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="form-input text-xs py-1.5 w-auto">
                {PERIODS.map((w) => <option key={w} value={w}>{t(`Last ${w} weeks`, `ያለፉት ${w} ሳምንታት`)}</option>)}
              </select>
              <button onClick={exportExcel} disabled={summary.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
            </div>
            <div className="table-container rounded-none border-0">
              <table>
                <thead>
                  <tr>
                    <th>{t('Servant', 'አገልጋይ')}</th>
                    <th className="text-right">{t('Present', 'የተገኘ')}</th>
                    <th className="text-right">{t('Late', 'የዘገየ')}</th>
                    <th className="text-right">{t('Absent', 'የቀረ')}</th>
                    <th className="text-right">{t('Excused', 'በፈቃድ')}</th>
                    <th className="text-right">{t('Rate', 'ምጣኔ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(({ id, x }) => (
                    <tr key={id}>
                      <td>
                        <button onClick={() => dialogs.openPerson(id)} className="font-medium text-slate-900 hover:text-blue-700 text-left">{name(id)}</button>
                        <div className="text-[11px] text-slate-400">{unitsOf(id) || t('No current assignment', 'የአሁን ምደባ የለም')}</div>
                      </td>
                      <td className="text-right text-xs tabular-nums">{x.present}</td>
                      <td className="text-right text-xs tabular-nums">{x.late}</td>
                      <td className={`text-right text-xs tabular-nums ${x.absent >= 3 ? 'text-red-700 font-semibold' : ''}`}>{x.absent}</td>
                      <td className="text-right text-xs tabular-nums">{x.excused}</td>
                      <td className={`text-right text-xs tabular-nums font-semibold ${x.rate !== null && x.rate < 60 ? 'text-amber-700' : 'text-slate-800'}`}>{x.rate === null ? '—' : `${x.rate}%`}</td>
                    </tr>
                  ))}
                  {hr.mode !== 'loading' && summary.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-8">{t('Nothing recorded in this period.', 'በዚህ ጊዜ ውስጥ የተመዘገበ የለም።')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden self-start">
            <div className="p-4 border-b border-slate-100 text-sm font-semibold text-slate-800">{t('Service days recorded', 'የተያዙ የአገልግሎት ቀናት')} ({days.length})</div>
            <ul className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {days.map((d) => {
                const x = tally(inPeriod.filter((m) => m.date === d));
                return (
                  <li key={d}>
                    <button onClick={() => { setDate(d); setUnit('ALL'); setTab('ROLL'); }} className="w-full px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 text-left">
                      <span className="text-xs font-medium text-slate-800 inline-flex items-center gap-1.5"><CalendarCheck size={13} className="text-slate-400" />{formatEthiopianDate(d, locale, { weekday: true })}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{x.present + x.late}/{x.present + x.late + x.absent} · {x.rate === null ? '—' : `${x.rate}%`}</span>
                    </button>
                  </li>
                );
              })}
              {days.length === 0 && <li className="px-4 py-6 text-xs text-slate-400 text-center">{t('No days recorded yet.', 'እስካሁን የተያዘ ቀን የለም።')}</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ value, label, warn = false }: { value: React.ReactNode; label: string; warn?: boolean }) {
  return (
    <div className="card p-5">
      <div className={`text-2xl font-bold tabular-nums ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
