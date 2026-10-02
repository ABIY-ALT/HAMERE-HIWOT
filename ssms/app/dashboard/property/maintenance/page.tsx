'use client';

import React, { useState } from 'react';
import { Download, Wrench } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { useAssetDialogs } from '@/components/property/useAssetDialogs';
import { useProperty } from '@/lib/property/client';
import type { MaintenanceStatus } from '@/lib/property/types';
import { formatETB } from '@/lib/finance/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

export default function MaintenancePage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const prop = useProperty();
  const [tab, setTab] = useState<MaintenanceStatus | 'ALL'>('OPEN');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useAssetDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3500);
  });

  const assetOf = new Map(prop.assets.map((a) => [a.id, a]));
  const year = todayIso().slice(0, 4);
  const open = prop.maintenance.filter((j) => j.status === 'OPEN');
  const doneThisYear = prop.maintenance.filter((j) => j.status === 'DONE' && (j.completed_on ?? '').startsWith(year));
  const rows = prop.maintenance.filter((j) => tab === 'ALL' || j.status === tab);
  const kindLabel = (k: string) => (k === 'REPAIR' ? t('Repair', 'ጥገና') : k === 'SERVICE' ? t('Service', 'አገልግሎት') : t('Inspection', 'ፍተሻ'));
  const daysOpen = (d: string) => Math.max(0, Math.round((Date.parse(todayIso()) - Date.parse(d)) / 86_400_000));

  const exportExcel = async () => {
    const header = [t('Reported', 'የተዘገበበት'), t('Tag', 'መለያ'), t('Item', 'ዕቃ'), t('Type', 'ዓይነት'), t('Work', 'ሥራ'), t('Handled by', 'የሚያከናውነው'), t('Status', 'ሁኔታ'), t('Completed', 'የተጠናቀቀበት'), t('Cost (ETB)', 'ወጪ (ብር)'), t('In expenses', 'በወጪዎች')].map(headerCell);
    const body = rows.map((j) => {
      const a = assetOf.get(j.asset_id);
      return [j.reported_on, a?.tag ?? '', cell(a ? (locale === 'am' ? a.name_am : a.name_en) : ''), kindLabel(j.kind), cell(j.description), cell(j.handled_by), j.status, j.completed_on ?? '', j.cost, j.expense_booked ? '✓' : ''];
    });
    await downloadXlsx(`maintenance_${todayIso()}`, [header, ...body], { sheet: 'Maintenance', widths: [12, 14, 26, 12, 36, 20, 10, 12, 12, 10] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Maintenance & Repairs', 'ጥገናና እድሳት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Report a problem, follow it up, and record what it cost.', 'ችግር ሪፖርት ያድርጉ፣ ይከታተሉ፣ ወጪውን ይመዝግቡ።')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {can('ASSET_CREATE') && (
            <button onClick={() => dialogs.pickThen('repair')} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><Wrench size={14} /> {t('Report Repair', 'ጥገና ሪፖርት')}</button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={prop.mode} error={prop.error} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label={t('Open jobs', 'ክፍት ሥራዎች')} value={String(open.length)} />
        <Kpi label={t(`Completed in ${year}`, `በ${year} የተጠናቀቁ`)} value={String(doneThisYear.length)} />
        <Kpi label={t(`Spent on repairs in ${year}`, `በ${year} ለጥገና የወጣ`)} value={formatETB(doneThisYear.reduce((s, j) => s + (j.cost ?? 0), 0))} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-100 flex gap-1">
          {(['OPEN', 'DONE', 'ALL'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {k === 'OPEN' ? t('Open', 'ክፍት') : k === 'DONE' ? t('Completed', 'የተጠናቀቁ') : t('All', 'ሁሉም')}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((j) => {
            const a = assetOf.get(j.asset_id);
            return (
              <li key={j.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-blue-600 mr-2">{a?.tag}</span>
                    <span className="font-medium text-slate-900">{a ? (locale === 'am' ? a.name_am : a.name_en) : '—'}</span>
                    <span className="text-xs text-slate-500"> · {kindLabel(j.kind)}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{j.description}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {t('Reported', 'ተዘግቧል')} {formatEthiopianDate(j.reported_on, locale)}
                    {j.handled_by && ` · ${j.handled_by}`}
                    {j.status === 'OPEN' && <span className={daysOpen(j.reported_on) > 30 ? 'text-amber-700 font-semibold' : ''}> · {daysOpen(j.reported_on)} {t('days open', 'ቀናት ክፍት')}</span>}
                    {j.status === 'DONE' && ` · ${t('done', 'ተጠናቋል')} ${j.completed_on}${j.cost ? ` · ${formatETB(j.cost)}` : ''}${j.expense_booked ? ` · ${t('in Expenses', 'በወጪዎች')}` : ''}`}
                  </div>
                </div>
                {j.status === 'OPEN' && can('ASSET_CREATE') ? (
                  <button onClick={() => dialogs.closeJob(j.id)} className="btn btn-secondary text-xs shrink-0">{t('Close job', 'ሥራ ዝጋ')}</button>
                ) : (
                  <span className={`badge shrink-0 ${j.status === 'DONE' ? 'badge-success' : j.status === 'OPEN' ? 'badge-warning' : 'bg-slate-100 text-slate-500'}`}>
                    {j.status === 'DONE' ? t('Done', 'ተጠናቋል') : j.status === 'OPEN' ? t('Open', 'ክፍት') : t('Cancelled', 'ተሰርዟል')}
                  </span>
                )}
              </li>
            );
          })}
          {prop.mode !== 'loading' && rows.length === 0 && <li className="p-8 text-center text-sm text-slate-400">{tab === 'OPEN' ? t('No open repairs.', 'ክፍት ጥገና የለም።') : t('Nothing here.', 'ምንም የለም።')}</li>}
        </ul>
      </div>
      {dialogs.node}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
