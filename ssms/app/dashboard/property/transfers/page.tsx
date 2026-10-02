'use client';

import React, { useState } from 'react';
import { ArrowRight, Download, Search, Truck } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { useAssetDialogs } from '@/components/property/useAssetDialogs';
import { useProperty } from '@/lib/property/client';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

/** Every hand-over / transfer, newest first. Records are permanent. */
export default function TransfersPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const prop = useProperty();
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useAssetDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3500);
  });

  const assetOf = new Map(prop.assets.map((a) => [a.id, a]));
  const needle = search.toLowerCase();
  const rows = prop.movements.filter((m) => {
    const a = assetOf.get(m.asset_id);
    return [a?.tag, a?.name_en, a?.name_am, m.from_unit, m.to_unit, m.from_person, m.to_person, m.reason]
      .some((x) => (x ?? '').toLowerCase().includes(needle));
  });

  const exportExcel = async () => {
    const header = [t('Date', 'ቀን'), t('Tag', 'መለያ'), t('Item', 'ዕቃ'), t('From', 'ከ'), t('To', 'ወደ'), t('Reason', 'ምክንያት'), t('Recorded by', 'የመዘገበው')].map(headerCell);
    const body = rows.map((m) => {
      const a = assetOf.get(m.asset_id);
      return [m.moved_on, a?.tag ?? '', cell(a ? (locale === 'am' ? a.name_am : a.name_en) : ''), cell([m.from_unit, m.from_person].filter(Boolean).join(' · ')), cell([m.to_unit, m.to_person].filter(Boolean).join(' · ')), cell(m.reason), m.recorded_by];
    });
    await downloadXlsx(`asset_transfers_${todayIso()}`, [header, ...body], { sheet: 'Transfers', widths: [12, 14, 28, 30, 30, 30, 20] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Transfers & Hand-overs', 'ዝውውርና ርክክብ')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Every change of department or custodian is kept here permanently.', 'የክፍል ወይም የኃላፊ ለውጥ ሁሉ እዚህ በቋሚነት ይቀመጣል።')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {(can('ASSET_ASSIGN') || can('ASSET_TRANSFER')) && (
            <button onClick={() => dialogs.pickThen('transfer')} disabled={prop.mode !== 'live' && prop.mode !== 'demo'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Truck size={14} /> {t('New Transfer', 'አዲስ ዝውውር')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={prop.mode} error={prop.error} />

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search item, person, department…', 'ዕቃ፣ ሰው፣ ክፍል ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((m) => {
            const a = assetOf.get(m.asset_id);
            return (
              <li key={m.id}>
                <button onClick={() => a && dialogs.openAsset(a.id)} className="w-full text-left p-4 hover:bg-slate-50 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <div className="md:w-36 shrink-0">
                    <div className="text-sm font-medium text-slate-900">{formatEthiopianDate(m.moved_on, locale)}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{m.moved_on}</div>
                  </div>
                  <div className="md:w-56 shrink-0">
                    <span className="font-mono text-xs text-blue-600">{a?.tag}</span>{' '}
                    <span className="text-sm text-slate-900">{a ? (locale === 'am' ? a.name_am : a.name_en) : '—'}</span>
                  </div>
                  <div className="flex-1 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <span>{[m.from_unit, m.from_person].filter(Boolean).join(' · ') || (m.reason === 'Registered' ? t('new', 'አዲስ') : '—')}</span>
                    <ArrowRight size={12} className="text-slate-400" />
                    <span className="font-medium text-slate-800">{[m.to_unit, m.to_person].filter(Boolean).join(' · ') || t('store', 'መጋዘን')}</span>
                  </div>
                  <div className="text-xs text-slate-500 md:w-56 md:text-right">
                    {m.reason === 'Registered' ? t('Registered', 'ተመዝግቧል') : m.reason}
                    {m.recorded_by && <div className="text-[11px] text-slate-400">{m.recorded_by}</div>}
                  </div>
                </button>
              </li>
            );
          })}
          {prop.mode !== 'loading' && rows.length === 0 && <li className="p-8 text-center text-sm text-slate-400">{t('No transfers recorded yet.', 'እስካሁን የተመዘገበ ዝውውር የለም።')}</li>}
        </ul>
      </div>
      {dialogs.node}
    </div>
  );
}
