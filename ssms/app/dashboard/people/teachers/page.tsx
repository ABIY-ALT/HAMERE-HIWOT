'use client';

import React, { useState } from 'react';
import { BookOpen, Download, Phone, Search, ShieldAlert, UserPlus } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { personName, useHrDialogs } from '@/components/hr/HrDialogs';
import { useHr } from '@/lib/hr/client';
import { activeSuspension, addDays, tally } from '@/lib/hr/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

export default function TeachersPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const hr = useHr();
  const canManage = can('HR_MANAGE');
  const today = todayIso();
  const since12w = addDays(today, -84);

  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useHrDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  });

  const teaching = hr.assignments.filter((a) => a.status === 'ACTIVE' && a.role_kind === 'TEACHER');
  const education = hr.units.find((u) => u.code === 'DEPT_EDUCATION');
  const ids = [...new Set([...teaching.map((a) => a.person_id), ...hr.homeroom.map((h) => h.person_id).filter((id): id is string => Boolean(id))])];

  const teachers = ids
    .map((id) => {
      const mine = teaching.filter((a) => a.person_id === id);
      const homeroom = hr.homeroom.filter((h) => h.person_id === id);
      const classes = [...new Set([...homeroom.map((h) => h.class_name), ...mine.map((a) => a.class_name).filter(Boolean)])];
      return {
        id,
        name: personName(hr, id, locale),
        phone: hr.people.find((p) => p.id === id)?.phone ?? '',
        classes,
        homeroom: new Set(homeroom.map((h) => h.class_name)),
        since: mine.map((a) => a.start_date).sort()[0] ?? null,
        x: tally(hr.attendance.filter((m) => m.person_id === id && m.date >= since12w)),
        suspended: activeSuspension(hr.cases, id, today),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const needle = search.trim().toLowerCase();
  const rows = teachers.filter((r) => !needle || [r.name, r.phone, ...r.classes].some((v) => v.toLowerCase().includes(needle)));
  const covered = new Set([...hr.homeroom.filter((h) => h.person_id).map((h) => h.class_id), ...teaching.map((a) => a.class_id).filter(Boolean)]);
  const uncovered = hr.classes.filter((c) => !covered.has(c.id));
  const rate = tally(hr.attendance.filter((m) => ids.includes(m.person_id) && m.date >= since12w)).rate;

  const assign = (class_id = '') => dialogs.newAssignment({ role_kind: 'TEACHER', unit_id: education?.id ?? '', class_id });

  const exportExcel = async () => {
    const header = [t('Teacher', 'መምህር'), t('Phone', 'ስልክ'), t('Classes', 'ክፍሎች'), t('Teaching since', 'ማስተማር የጀመረበት'), t('Attendance % (12 wks)', 'ተገኝነት % (12 ሳምንት)')].map(headerCell);
    const body = rows.map((r) => [cell(r.name), r.phone, r.classes.join(', '), r.since ?? '', r.x.rate]);
    await downloadXlsx(`teachers_${today}`, [header, ...body], { sheet: 'Teachers', widths: [26, 14, 40, 14, 14] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      {dialogs.node}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Teachers', 'መምህራን')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Who teaches which class this academic year', 'በዚህ የትምህርት ዘመን ማን የትኛውን ክፍል እንደሚያስተምር')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => assign()} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><UserPlus size={14} /> {t('Assign Teacher', 'መምህር መድብ')}</button>}
        </div>
      </div>

      <AdminModeNotice mode={hr.mode} error={hr.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={teachers.length} label={t('Teachers', 'መምህራን')} />
        <Kpi value={hr.classes.length ? `${hr.classes.length - uncovered.length} / ${hr.classes.length}` : '—'} label={t('Classes with a teacher', 'መምህር ያላቸው ክፍሎች')} />
        <Kpi value={uncovered.length} label={t('Classes without a teacher', 'መምህር የሌላቸው ክፍሎች')} warn={uncovered.length > 0} />
        <Kpi value={rate === null ? '—' : `${rate}%`} label={t('Teacher attendance, 12 weeks', 'የመምህራን ተገኝነት፣ 12 ሳምንት')} />
      </div>

      {uncovered.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">{t('Classes without a teacher', 'መምህር የሌላቸው ክፍሎች')}</div>
          <div className="flex flex-wrap gap-1.5">
            {uncovered.map((c) => (
              <button key={c.id} disabled={!canManage} onClick={() => assign(c.id)} className="text-[11px] px-2 py-1 rounded border border-dashed border-amber-300 text-amber-800 bg-amber-50 hover:border-blue-400 hover:text-blue-700 disabled:hover:border-amber-300 disabled:hover:text-amber-800">
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder={t('Search name, phone or class…', 'ስም፣ ስልክ ወይም ክፍል ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <button key={r.id} onClick={() => dialogs.openPerson(r.id)} className="text-left border border-slate-200/80 rounded-xl p-4 bg-white hover:shadow-sm hover:border-blue-300 transition-all flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                    {r.name}
                    {r.suspended && <ShieldAlert size={13} className="text-red-600 shrink-0" />}
                  </div>
                  {r.phone && <div className="text-[11px] font-mono text-slate-500 inline-flex items-center gap-1"><Phone size={10} />{r.phone}</div>}
                </div>
                <span className={`text-xs font-semibold tabular-nums ${r.x.rate !== null && r.x.rate < 60 ? 'text-amber-700' : 'text-slate-600'}`} title={t('Attendance, last 12 weeks', 'ተገኝነት፣ ያለፉት 12 ሳምንታት')}>
                  {r.x.rate === null ? '—' : `${r.x.rate}%`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.classes.length ? (
                  r.classes.map((c) => (
                    <span key={c} className={`text-[11px] px-2 py-0.5 rounded ${r.homeroom.has(c) ? 'bg-blue-50 text-blue-800 border border-blue-100' : 'bg-slate-100 text-slate-700'}`}>
                      {c}{r.homeroom.has(c) && ` · ${t('homeroom', 'ኃላፊ')}`}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400 italic">{t('Not tied to a class', 'ለአንድ ክፍል ያልተመደበ')}</span>
                )}
              </div>
              {r.since && <div className="text-[11px] text-slate-400">{t('Teaching since', 'ማስተማር የጀመረበት')} {formatEthiopianDate(r.since, locale)}</div>}
            </button>
          ))}
        </div>
        {hr.mode !== 'loading' && rows.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-6"><BookOpen size={18} className="inline mr-1" /> {teachers.length ? t('No teachers match.', 'የሚዛመድ መምህር የለም።') : t('No teachers yet — use “Assign Teacher”, or set a teacher on each class.', 'እስካሁን መምህር የለም — "መምህር መድብ"ን ይጠቀሙ ወይም በክፍሉ ላይ መምህር ይመድቡ።')}</p>
        )}
      </div>
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
