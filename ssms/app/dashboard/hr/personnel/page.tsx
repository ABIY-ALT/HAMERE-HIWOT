'use client';

import React, { useState } from 'react';
import { Download, Phone, Search, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { useHrDialogs } from '@/components/hr/HrDialogs';
import { useHr } from '@/lib/hr/client';
import { activeSuspension, addDays, ROLE_KINDS, roleLabel, tally, type RoleKind } from '@/lib/hr/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

export default function PersonnelPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const hr = useHr();
  const canManage = can('HR_MANAGE');
  const today = todayIso();
  const since12w = addDays(today, -84);

  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('ALL');
  const [role, setRole] = useState<'ALL' | RoleKind>('ALL');
  const [showFormer, setShowFormer] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useHrDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  });

  const active = hr.assignments.filter((a) => a.status === 'ACTIVE');
  const homeroomIds = new Set(hr.homeroom.map((h) => h.person_id).filter(Boolean));
  const servingIds = new Set([...active.map((a) => a.person_id), ...homeroomIds]);
  const everIds = new Set([...hr.assignments.map((a) => a.person_id), ...homeroomIds]);
  const recent = hr.attendance.filter((m) => m.date >= since12w);
  const marksOf = (id: string) => recent.filter((m) => m.person_id === id);

  const needle = search.trim().toLowerCase();
  const rows = hr.people
    .filter((p) => (showFormer ? everIds.has(p.id) : servingIds.has(p.id)))
    .map((p) => {
      const mine = hr.assignments.filter((a) => a.person_id === p.id && (a.status === 'ACTIVE' || !servingIds.has(p.id)));
      return { p, mine, x: tally(marksOf(p.id)), since: mine.map((a) => a.start_date).sort()[0] ?? null, suspended: activeSuspension(hr.cases, p.id, today) };
    })
    .filter((r) => unit === 'ALL' || r.mine.some((a) => a.unit_id === unit))
    .filter((r) => role === 'ALL' || r.mine.some((a) => a.role_kind === role) || (role === 'TEACHER' && homeroomIds.has(r.p.id)))
    .filter((r) => !needle || [r.p.name, r.p.name_am, r.p.phone].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => a.p.name.localeCompare(b.p.name));

  const staffable = hr.units.filter((u) => u.type === 'DEPARTMENT' || u.type === 'COORDINATION');
  const staffed = new Set(active.map((a) => a.unit_id));
  const unstaffed = staffable.filter((u) => !staffed.has(u.id));
  const overall = tally(recent.filter((m) => servingIds.has(m.person_id)));
  const teachers = new Set([...active.filter((a) => a.role_kind === 'TEACHER').map((a) => a.person_id), ...homeroomIds]);
  const openCases = hr.cases.filter((c) => c.status === 'OPEN').length;
  const unitLabel = (u: { name: string; name_am: string }) => (locale === 'am' ? u.name_am : u.name);

  const exportExcel = async () => {
    const header = [t('Name', 'ስም'), t('Name (Amharic)', 'ስም (አማርኛ)'), t('Phone', 'ስልክ'), t('Serving as', 'የአገልግሎት ኃላፊነት'), t('Since', 'ከ'), t('Attendance % (12 wks)', 'ተገኝነት % (12 ሳምንት)'), t('Present', 'የተገኘ'), t('Late', 'የዘገየ'), t('Absent', 'የቀረ'), t('Excused', 'በፈቃድ')].map(headerCell);
    const body = rows.map(({ p, mine, x, since }) => [
      cell(p.name), p.name_am, p.phone,
      mine.map((a) => `${roleLabel(a, t)} — ${locale === 'am' ? a.unit_am : a.unit}${a.class_name ? ` (${a.class_name})` : ''}`).join('; '),
      since ?? '', x.rate, x.present, x.late, x.absent, x.excused,
    ]);
    await downloadXlsx(`servants_${today}`, [header, ...body], { sheet: 'Servants', widths: [24, 24, 14, 60, 12, 12, 8, 8, 8, 8] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      {dialogs.node}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Servants & Personnel', 'አገልጋዮችና ሠራተኞች')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Who serves where, since when, and how regularly they come', 'ማን የት እንደሚያገለግል፣ ከመቼ ጀምሮና ተገኝነቱ')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => dialogs.newAssignment()} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><UserPlus size={14} /> {t('Assign a Servant', 'አገልጋይ መድብ')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={hr.mode} error={hr.error} />

      <div className={`grid grid-cols-2 gap-4 ${hr.canSeeCases ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <Kpi value={servingIds.size} label={t('Serving now', 'አሁን የሚያገለግሉ')} />
        <Kpi value={staffable.length ? `${staffable.length - unstaffed.length} / ${staffable.length}` : '—'} label={t('Units staffed', 'አገልጋይ ያላቸው ክፍሎች')} />
        <Kpi value={teachers.size} label={t('Teachers', 'መምህራን')} />
        <Kpi value={overall.rate === null ? '—' : `${overall.rate}%`} label={t('Attendance, last 12 weeks', 'ተገኝነት፣ ያለፉት 12 ሳምንታት')} />
        {hr.canSeeCases && <Kpi value={openCases} label={t('Open discipline cases', 'በሂደት ያሉ የዲሲፕሊን ጉዳዮች')} warn={openCases > 0} />}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search name or phone…', 'ስም ወይም ስልክ ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-xs py-1.5 w-auto max-w-[260px]">
            <option value="ALL">{t('All units', 'ሁሉም ክፍሎች')}</option>
            {hr.units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="form-input text-xs py-1.5 w-auto">
            <option value="ALL">{t('All roles', 'ሁሉም ኃላፊነቶች')}</option>
            {(Object.keys(ROLE_KINDS) as RoleKind[]).map((k) => <option key={k} value={k}>{t(...ROLE_KINDS[k])}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showFormer} onChange={(e) => setShowFormer(e.target.checked)} /> {t('Include former servants', 'የቀድሞ አገልጋዮችንም አሳይ')}</label>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Name', 'ስም')}</th>
                <th>{t('Serving as', 'የአገልግሎት ኃላፊነት')}</th>
                <th>{t('Since', 'ከ')}</th>
                <th className="text-right">{t('Attendance (12 wks)', 'ተገኝነት (12 ሳምንት)')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, mine, x, since, suspended }) => (
                <tr key={p.id} onClick={() => dialogs.openPerson(p.id)} className={`cursor-pointer hover:bg-slate-50 ${servingIds.has(p.id) ? '' : 'opacity-60'}`}>
                  <td>
                    <div className="font-medium text-slate-900 flex items-center gap-1.5">
                      {locale === 'am' ? p.name_am : p.name}
                      {suspended && <span title={t('Suspended', 'ታግዷል')}><ShieldAlert size={13} className="text-red-600" /></span>}
                    </div>
                    {p.phone && <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="text-[11px] font-mono text-blue-600 inline-flex items-center gap-1"><Phone size={10} />{p.phone}</a>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {mine.map((a) => (
                        <span key={a.id} className={`text-[11px] px-2 py-0.5 rounded border ${a.role_kind === 'HEAD' ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                          {roleLabel(a, t)}{a.class_name && ` · ${a.class_name}`} — {locale === 'am' ? a.unit_am : a.unit}
                        </span>
                      ))}
                      {hr.homeroom.filter((h) => h.person_id === p.id).map((h) => (
                        <span key={h.class_id} className="text-[11px] px-2 py-0.5 rounded border bg-slate-50 border-slate-200 text-slate-700">{t('Homeroom teacher', 'የክፍል ኃላፊ መምህር')} · {h.class_name}</span>
                      ))}
                    </div>
                  </td>
                  <td className="text-xs text-slate-600 whitespace-nowrap">{since ? formatEthiopianDate(since, locale) : '—'}</td>
                  <td className={`text-right text-xs tabular-nums whitespace-nowrap ${x.rate !== null && x.rate < 60 ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>
                    {x.rate === null ? '—' : `${x.rate}% (${x.present + x.late}/${x.present + x.late + x.absent})`}
                  </td>
                </tr>
              ))}
              {hr.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={4} className="text-center text-sm text-slate-400 py-8"><Users size={18} className="inline mr-1" /> {servingIds.size ? t('No servants match.', 'የሚዛመድ አገልጋይ የለም።') : t('No one is assigned yet — use “Assign a Servant”.', 'እስካሁን የተመደበ የለም — "አገልጋይ መድብ"ን ይጠቀሙ።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hr.mode === 'live' && unstaffed.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">{t('Departments and coordinations with no one assigned', 'ምንም አገልጋይ ያልተመደበላቸው ክፍሎች')}</div>
          <div className="flex flex-wrap gap-1.5">
            {unstaffed.map((u) => (
              <button
                key={u.id}
                disabled={!canManage}
                onClick={() => dialogs.newAssignment({ unit_id: u.id })}
                className="text-[11px] px-2 py-1 rounded border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:hover:border-slate-300 disabled:hover:text-slate-600"
              >
                {unitLabel(u)}
              </button>
            ))}
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
