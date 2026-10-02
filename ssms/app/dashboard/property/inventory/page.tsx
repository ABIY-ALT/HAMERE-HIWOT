'use client';

import React, { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Download, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { useAssetDialogs } from '@/components/property/useAssetDialogs';
import { useProperty } from '@/lib/property/client';
import { CONDITION_LABEL, isHeld } from '@/lib/property/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

/**
 * Physical stocktake: walk through the items and confirm each one was seen.
 * Items not checked within the chosen period are listed first.
 */
export default function InventoryPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const prop = useProperty();
  const today = todayIso();
  const [since, setSince] = useState(`${today.slice(0, 4)}-01-01`);
  const [search, setSearch] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useAssetDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3000);
  });
  const pair = (p: [string, string]) => t(p[0], p[1]);

  const held = prop.assets.filter(isHeld);
  const checked = held.filter((a) => (a.last_verified_on ?? '') >= since);
  const pct = held.length ? Math.round((checked.length / held.length) * 100) : 0;
  const needle = search.toLowerCase();
  const rows = held
    .filter((a) => showChecked || (a.last_verified_on ?? '') < since)
    .filter(
      (a) =>
        a.tag.toLowerCase().includes(needle) ||
        (locale === 'am' ? a.name_am : a.name_en).toLowerCase().includes(needle) ||
        a.location.toLowerCase().includes(needle) ||
        a.custodian.toLowerCase().includes(needle)
    )
    .sort((a, b) => (a.last_verified_on ?? '').localeCompare(b.last_verified_on ?? '') || a.tag.localeCompare(b.tag));

  const exportSheet = async () => {
    const header = [t('Tag', 'መለያ'), t('Item', 'ዕቃ'), t('Expected location', 'የሚጠበቅበት ቦታ'), t('Custodian', 'ኃላፊ'), t('Last checked', 'መጨረሻ የተቆጠረው'), t('Seen? ✓', 'ታይቷል? ✓'), t('Condition', 'ሁኔታ'), t('Remarks', 'አስተያየት')].map(headerCell);
    const body = rows.map((a) => [a.tag, cell(locale === 'am' ? a.name_am : a.name_en), cell(a.location), a.custodian, a.last_verified_on ?? '', '', '', '']);
    await downloadXlsx(`stocktake_sheet_${today}`, [header, ...body], { sheet: 'Stocktake', widths: [14, 30, 20, 20, 14, 10, 12, 30] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Stocktake (Physical Count)', 'የንብረት ቆጠራ')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Confirm each item was seen. Items not yet checked are listed first.', 'እያንዳንዱ ዕቃ መታየቱን ያረጋግጡ። ያልተቆጠሩት ቀድመው ይታያሉ።')}</p>
        </div>
        <button onClick={exportSheet} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50">
          <Download size={14} /> {t('Count sheet (Excel)', 'የቆጠራ ሉህ (ኤክሴል)')}
        </button>
      </div>

      <AdminModeNotice mode={prop.mode} error={prop.error} />

      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            <span className="text-2xl font-bold text-slate-900">{checked.length}</span> / {held.length} {t('items checked since', 'ዕቃዎች ተቆጥረዋል ከ')}{' '}
            <input type="date" value={since} max={today} onChange={(e) => e.target.value && setSince(e.target.value)} className="form-input text-xs py-1 w-auto inline-block" />
          </div>
          <span className="text-sm font-semibold text-slate-700">{pct}%</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
        </div>
        {held.length > 0 && pct === 100 && (
          <p className="text-sm text-emerald-700 font-medium flex items-center gap-1.5"><CheckCircle2 size={16} /> {t('Every item has been checked.', 'ሁሉም ዕቃዎች ተቆጥረዋል።')}</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search tag, item, place…', 'መለያ፣ ዕቃ፣ ቦታ ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showChecked} onChange={(e) => setShowChecked(e.target.checked)} />
            {t('Also show items already checked', 'የተቆጠሩትንም አሳይ')}
          </label>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((a) => {
            const done = (a.last_verified_on ?? '') >= since;
            return (
              <li key={a.id} className="p-4 flex items-center justify-between gap-3">
                <button onClick={() => dialogs.openAsset(a.id)} className="text-left min-w-0">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-blue-600 mr-2">{a.tag}</span>
                    <span className="font-medium text-slate-900">{locale === 'am' ? a.name_am : a.name_en}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {[a.location, a.custodian, pair(CONDITION_LABEL[a.condition])].filter(Boolean).join(' · ')}
                    {' · '}
                    {a.last_verified_on ? `${t('last checked', 'መጨረሻ የተቆጠረው')} ${formatEthiopianDate(a.last_verified_on, locale)}` : t('never checked', 'ተቆጥሮ አያውቅም')}
                  </div>
                </button>
                {done ? (
                  <span className="text-emerald-600 text-xs font-semibold inline-flex items-center gap-1 shrink-0"><CheckCircle2 size={14} /> {t('Checked', 'ተቆጥሯል')}</span>
                ) : can('ASSET_CREATE') ? (
                  <button onClick={() => dialogs.openAsset(a.id, 'verify')} className="btn btn-primary text-xs inline-flex items-center gap-1.5 shrink-0">
                    <ClipboardCheck size={13} /> {t('Seen', 'ታይቷል')}
                  </button>
                ) : null}
              </li>
            );
          })}
          {prop.mode !== 'loading' && rows.length === 0 && (
            <li className="p-8 text-center text-sm text-slate-400">{held.length ? t('All items in this view are checked.', 'በዚህ እይታ ያሉት ሁሉ ተቆጥረዋል።') : t('No assets registered yet.', 'እስካሁን የተመዘገበ ንብረት የለም።')}</li>
          )}
        </ul>
      </div>
      {dialogs.node}
    </div>
  );
}
