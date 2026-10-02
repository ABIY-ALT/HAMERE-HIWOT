'use client';

import React, { useState } from 'react';
import { ArrowRightLeft, Briefcase, Download, Plus, Search, UserMinus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { personName, useHrDialogs } from '@/components/hr/HrDialogs';
import { useHr } from '@/lib/hr/client';
import { addDays, END_REASONS, ROLE_KINDS, roleLabel, type RoleKind } from '@/lib/hr/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

export default function AssignmentsPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const hr = useHr();
  const canManage = can('HR_MANAGE');
  const today = todayIso();
  const since90 = addDays(today, -90);

  const [status, setStatus] = useState<'ACTIVE' | 'ENDED' | 'ALL'>('ACTIVE');
  const [unit, setUnit] = useState('ALL');
  const [role, setRole] = useState<'ALL' | RoleKind>('ALL');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useHrDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  });

  const name = (id: string) => personName(hr, id, locale);
  const needle = search.trim().toLowerCase();
  const rows = hr.assignments
    .filter((a) => status === 'ALL' || a.status === status)
    .filter((a) => unit === 'ALL' || a.unit_id === unit)
    .filter((a) => role === 'ALL' || a.role_kind === role)
    .filter((a) => !needle || name(a.person_id).toLowerCase().includes(needle) || a.title.toLowerCase().includes(needle))
    .sort((a, b) => (a.status === b.status ? b.start_date.localeCompare(a.start_date) : a.status === 'ACTIVE' ? -1 : 1));

  const active = hr.assignments.filter((a) => a.status === 'ACTIVE');
  const staffable = hr.units.filter((u) => u.type === 'DEPARTMENT' || u.type === 'COORDINATION');
  const headed = new Set(active.filter((a) => a.role_kind === 'HEAD').map((a) => a.unit_id));

  const exportExcel = async () => {
    const header = [t('Servant', 'አገልጋይ'), t('Role', 'ኃላፊነት'), t('Class', 'ክፍል'), t('Unit', 'ክፍል / አስተባባሪ'), t('From', 'ከ'), t('To', 'እስከ'), t('Status', 'ሁኔታ'), t('Reason ended', 'የተጠናቀቀበት ምክንያት'), t('Notes', 'ማስታወሻ')].map(headerCell);
    const body = rows.map((a) => [
      cell(name(a.person_id)), roleLabel(a, t), a.class_name, locale === 'am' ? a.unit_am : a.unit, a.start_date, a.end_date ?? '',
      a.status === 'ACTIVE' ? t('Active', 'በአገልግሎት ላይ') : t('Ended', 'የተጠናቀቀ'), a.end_reason ? t(...END_REASONS[a.end_reason]) : '', a.notes,
    ]);
    await downloadXlsx(`assignments_${today}`, [header, ...body], { sheet: 'Assignments', widths: [24, 20, 14, 34, 12, 12, 12, 22, 30] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      {dialogs.node}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Service Assignments', 'የአገልግሎት ምደባዎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Assign, move and release servants across departments and coordinations', 'አገልጋዮችን በክፍሎችና በአስተባባሪዎች መመደብ፣ ማዛወርና ማጠናቀቅ')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => dialogs.newAssignment()} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><Plus size={14} /> {t('New Assignment', 'አዲስ ምደባ')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={hr.mode} error={hr.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={active.length} label={t('Active assignments', 'ንቁ ምደባዎች')} />
        <Kpi value={staffable.length ? `${staffable.filter((u) => headed.has(u.id)).length} / ${staffable.length}` : '—'} label={t('Units with a head', 'ኃላፊ ያላቸው ክፍሎች')} />
        <Kpi value={hr.assignments.filter((a) => a.start_date >= since90).length} label={t('Started, last 90 days', 'ባለፉት 90 ቀናት የጀመሩ')} />
        <Kpi value={hr.assignments.filter((a) => a.end_date && a.end_date >= since90).length} label={t('Ended, last 90 days', 'ባለፉት 90 ቀናት የተጠናቀቁ')} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 self-start">
            {(['ACTIVE', 'ENDED', 'ALL'] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${status === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {s === 'ACTIVE' ? t('Active', 'ንቁ') : s === 'ENDED' ? t('Ended', 'የተጠናቀቁ') : t('All', 'ሁሉም')}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search name…', 'ስም ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-xs py-1.5 w-auto max-w-[260px]">
            <option value="ALL">{t('All units', 'ሁሉም ክፍሎች')}</option>
            {hr.units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All roles', 'ሁሉም ኃላፊነቶች')}</option>
            {(Object.keys(ROLE_KINDS) as RoleKind[]).map((k) => <option key={k} value={k}>{t(...ROLE_KINDS[k])}</option>)}
          </select>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Servant', 'አገልጋይ')}</th>
                <th>{t('Role', 'ኃላፊነት')}</th>
                <th>{t('Department / coordination', 'ክፍል / አስተባባሪ')}</th>
                <th>{t('Period', 'ጊዜ')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={a.status === 'ENDED' ? 'opacity-60' : ''}>
                  <td><button onClick={() => dialogs.openPerson(a.person_id)} className="font-medium text-slate-900 hover:text-blue-700 text-left">{name(a.person_id)}</button></td>
                  <td className="text-xs text-slate-700">
                    {roleLabel(a, t)}
                    {a.class_name && <span className="text-slate-400"> · {a.class_name}</span>}
                  </td>
                  <td className="text-xs text-slate-700">{locale === 'am' ? a.unit_am : a.unit}</td>
                  <td className="text-xs text-slate-600 whitespace-nowrap">
                    {formatEthiopianDate(a.start_date, locale)} – {a.end_date ? formatEthiopianDate(a.end_date, locale) : t('now', 'አሁን')}
                    {a.end_reason && <div className="text-[11px] text-slate-400">{t(...END_REASONS[a.end_reason])}</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {canManage && a.status === 'ACTIVE' && (
                      <>
                        <button onClick={() => dialogs.editAssignment(a)} className="text-xs text-blue-600 hover:bg-blue-50 font-semibold px-2 py-1 rounded">{t('Edit', 'አርትዕ')}</button>
                        <button onClick={() => dialogs.moveAssignment(a)} className="text-xs text-slate-600 hover:bg-slate-50 font-semibold px-2 py-1 rounded inline-flex items-center gap-1"><ArrowRightLeft size={12} />{t('Move', 'አዛውር')}</button>
                        <button onClick={() => dialogs.endAssignment(a)} className="text-xs text-red-600 hover:bg-red-50 font-semibold px-2 py-1 rounded inline-flex items-center gap-1"><UserMinus size={12} />{t('End', 'አጠናቅ')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {hr.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-8"><Briefcase size={18} className="inline mr-1" /> {t('No assignments here.', 'እዚህ ምንም ምደባ የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="card p-5">
      <div className="text-2xl font-bold tabular-nums text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
