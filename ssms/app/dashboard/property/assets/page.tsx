'use client';

import React, { useState } from 'react';
import { Download, PackagePlus, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { useAssetDialogs } from '@/components/property/useAssetDialogs';
import { useProperty } from '@/lib/property/client';
import {
  ASSET_CATEGORIES,
  CONDITION_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  assetCategoryLabel,
  isHeld,
  type AssetStatus,
} from '@/lib/property/types';
import { formatETB } from '@/lib/finance/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

export default function AssetsPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const prop = useProperty();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState<'HELD' | 'ALL' | AssetStatus>('HELD');
  const [unit, setUnit] = useState('ALL');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useAssetDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3500);
  });
  const pair = (p: [string, string]) => t(p[0], p[1]);

  const held = prop.assets.filter(isHeld);
  const needle = search.toLowerCase();
  const rows = prop.assets
    .filter((a) => (status === 'HELD' ? isHeld(a) : status === 'ALL' ? true : a.status === status))
    .filter((a) => category === 'ALL' || a.category === category)
    .filter((a) => unit === 'ALL' || a.unit === unit)
    .filter(
      (a) =>
        a.tag.toLowerCase().includes(needle) ||
        (locale === 'am' ? a.name_am : a.name_en).toLowerCase().includes(needle) ||
        a.serial_no.toLowerCase().includes(needle) ||
        a.custodian.toLowerCase().includes(needle) ||
        a.location.toLowerCase().includes(needle)
    );
  const unitNames = [...new Set(prop.assets.map((a) => a.unit).filter(Boolean))].sort();

  const exportExcel = async () => {
    const header = [
      t('Tag', 'መለያ'), t('Item', 'ዕቃ'), t('Category', 'ምድብ'), t('Serial no.', 'ተከታታይ ቁጥር'), t('Department', 'ክፍል'),
      t('Custodian', 'ኃላፊ'), t('Location', 'ቦታ'), t('Condition', 'ሁኔታ'), t('Status', 'ደረጃ'), t('Acquired', 'የተገኘበት'),
      t('Value (ETB)', 'ዋጋ (ብር)'), t('Last checked', 'መጨረሻ የተቆጠረው'),
    ].map(headerCell);
    const body = rows.map((a) => [
      a.tag, cell(locale === 'am' ? a.name_am : a.name_en), assetCategoryLabel(a.category, locale), a.serial_no,
      locale === 'am' ? a.unit_am : a.unit, a.custodian, cell(a.location), pair(CONDITION_LABEL[a.condition]),
      pair(STATUS_LABEL[a.status]), a.acquired_on ?? '', a.value, a.last_verified_on ?? '',
    ]);
    await downloadXlsx(`asset_register_${todayIso()}`, [header, ...body], { sheet: 'Assets', widths: [14, 28, 22, 16, 26, 20, 18, 10, 14, 12, 12, 12] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Asset Register', 'የንብረት መዝገብ')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Everything the Sunday school owns — who holds it, where it is and its condition', 'የሰንበት ት/ቤቱ ንብረቶች በሙሉ — ማን እንደያዛቸው፣ የት እንዳሉና ሁኔታቸው')}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}
          </button>
          {can('ASSET_CREATE') && (
            <button onClick={dialogs.openNew} disabled={prop.mode === 'loading' || prop.mode === 'error'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <PackagePlus size={14} /> {t('Register Asset', 'ንብረት መዝግብ')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={prop.mode} error={prop.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={t('Items held', 'ያሉ ዕቃዎች')} value={String(held.length)} />
        <Kpi label={t('Total value', 'ጠቅላላ ዋጋ')} value={formatETB(held.reduce((s, a) => s + (a.value ?? 0), 0))} />
        <Kpi label={t('Under repair', 'በጥገና ላይ')} value={String(held.filter((a) => a.status === 'UNDER_REPAIR').length)} />
        <Kpi label={t('Without a custodian', 'ኃላፊ የሌላቸው')} value={String(held.filter((a) => !a.custodian && a.status !== 'IN_STORE').length)} />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search tag, item, serial, person…', 'መለያ፣ ዕቃ፣ ቁጥር፣ ሰው ፈልግ…')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input text-xs py-1.5 w-auto">
              <option value="ALL">{t('All categories', 'ሁሉም ምድቦች')}</option>
              {ASSET_CATEGORIES.map(([en, am]) => <option key={en} value={en}>{locale === 'am' ? am : en}</option>)}
            </select>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-xs py-1.5 w-auto">
              <option value="ALL">{t('All departments', 'ሁሉም ክፍሎች')}</option>
              {unitNames.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="form-input text-xs py-1.5 w-auto">
              <option value="HELD">{t('Held now', 'አሁን ያሉ')}</option>
              <option value="ALL">{t('All, incl. written off', 'ሁሉም (የተወገዱም)')}</option>
              {(Object.keys(STATUS_LABEL) as AssetStatus[]).map((s) => <option key={s} value={s}>{pair(STATUS_LABEL[s])}</option>)}
            </select>
          </div>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Tag', 'መለያ')}</th>
                <th>{t('Item', 'ዕቃ')}</th>
                <th>{t('Department · custodian', 'ክፍል · ኃላፊ')}</th>
                <th>{t('Condition', 'ሁኔታ')}</th>
                <th>{t('Status', 'ደረጃ')}</th>
                <th className="text-right">{t('Value', 'ዋጋ')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} onClick={() => dialogs.openAsset(a.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="font-mono text-xs font-semibold text-blue-600">{a.tag}</td>
                  <td>
                    <div className="font-medium text-slate-900">{locale === 'am' ? a.name_am : a.name_en}</div>
                    <div className="text-[11px] text-slate-400">{assetCategoryLabel(a.category, locale)}{a.serial_no ? ` · ${a.serial_no}` : ''}</div>
                  </td>
                  <td className="text-xs text-slate-600">
                    {(locale === 'am' ? a.unit_am : a.unit) || '—'}
                    <div className={a.custodian ? 'text-slate-500' : 'text-slate-400'}>{a.custodian || t('no custodian', 'ኃላፊ የለም')}</div>
                  </td>
                  <td className="text-xs text-slate-700">{pair(CONDITION_LABEL[a.condition])}</td>
                  <td><span className={STATUS_STYLE[a.status]}>{pair(STATUS_LABEL[a.status])}</span></td>
                  <td className="text-right font-mono text-xs whitespace-nowrap">{a.value === null ? '—' : formatETB(a.value)}</td>
                </tr>
              ))}
              {prop.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-8">{t('No assets registered yet.', 'እስካሁን የተመዘገበ ንብረት የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
