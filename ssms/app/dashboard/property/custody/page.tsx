'use client';

import React, { useState } from 'react';
import { Download, Printer, UserRound } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { useAssetDialogs } from '@/components/property/useAssetDialogs';
import { useProperty } from '@/lib/property/client';
import { CONDITION_LABEL, STATUS_LABEL, STATUS_STYLE, isHeld, type Asset } from '@/lib/property/types';
import { formatETB } from '@/lib/finance/types';
import { boldCell, cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

type GroupBy = 'PERSON' | 'DEPARTMENT';

/** Who is accountable for what: assets grouped by custodian or department. */
export default function CustodyPage() {
  const { t, locale } = useLang();
  const prop = useProperty();
  const [groupBy, setGroupBy] = useState<GroupBy>('PERSON');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dialogs = useAssetDialogs((text) => {
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 3500);
  });
  const pair = (p: [string, string]) => t(p[0], p[1]);

  const held = prop.assets.filter(isHeld);
  const keyOf = (a: Asset) =>
    groupBy === 'PERSON'
      ? a.custodian || (a.status === 'IN_STORE' ? t('In the store', 'በመጋዘን') : t('No custodian', 'ኃላፊ የሌላቸው'))
      : (locale === 'am' ? a.unit_am : a.unit) || t('No department', 'ክፍል የሌላቸው');
  const groups = [...held.reduce((m, a) => m.set(keyOf(a), [...(m.get(keyOf(a)) ?? []), a]), new Map<string, Asset[]>())]
    .sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));

  const exportExcel = async () => {
    const rows: unknown[][] = [[boldCell(t('Custody list', 'የኃላፊነት ዝርዝር') + ` — ${todayIso()}`)], []];
    for (const [name, items] of groups) {
      rows.push([boldCell(name), `${items.length}`]);
      rows.push([t('Tag', 'መለያ'), t('Item', 'ዕቃ'), t('Condition', 'ሁኔታ'), t('Location', 'ቦታ'), t('Value', 'ዋጋ')].map(headerCell));
      for (const a of items) rows.push([a.tag, cell(locale === 'am' ? a.name_am : a.name_en), pair(CONDITION_LABEL[a.condition]), cell(a.location), a.value]);
      rows.push([]);
    }
    await downloadXlsx(`custody_${todayIso()}`, rows as never, { sheet: 'Custody', widths: [14, 32, 12, 20, 12] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Custody & Accountability', 'ኃላፊነትና ተጠያቂነት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Who is responsible for which items. Print a list to sign at hand-over.', 'የትኛውን ዕቃ ማን እንደያዘ። በርክክብ ጊዜ ለመፈረም ዝርዝሩን ያትሙ።')}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2 self-start sm:self-auto">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
            {(['PERSON', 'DEPARTMENT'] as GroupBy[]).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className={`px-3 py-1.5 ${groupBy === g ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>
                {g === 'PERSON' ? t('By person', 'በሰው') : t('By department', 'በክፍል')}
              </button>
            ))}
          </div>
          <button onClick={exportExcel} disabled={groups.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Excel', 'ኤክሴል')}</button>
          <button onClick={() => window.print()} disabled={groups.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Printer size={14} /> {t('Print', 'አትም')}</button>
        </div>
      </div>

      <AdminModeNotice mode={prop.mode} error={prop.error} />

      {prop.mode !== 'loading' && groups.length === 0 && <p className="card p-8 text-center text-sm text-slate-400">{t('No assets registered yet.', 'እስካሁን የተመዘገበ ንብረት የለም።')}</p>}

      <div className="space-y-4">
        {groups.map(([name, items]) => (
          <div key={name} className="card overflow-hidden break-inside-avoid">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><UserRound size={16} className="text-slate-400" />{name}</h2>
              <span className="text-xs text-slate-500">{items.length} {t('items', 'ዕቃዎች')} · {formatETB(items.reduce((s, a) => s + (a.value ?? 0), 0))}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((a) => (
                <li key={a.id}>
                  <button onClick={() => dialogs.openAsset(a.id)} className="w-full px-5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 text-sm">
                    <span>
                      <span className="font-mono text-xs text-blue-600 mr-2">{a.tag}</span>
                      <span className="text-slate-900">{locale === 'am' ? a.name_am : a.name_en}</span>
                      {a.location && <span className="text-xs text-slate-400"> · {a.location}</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500">{pair(CONDITION_LABEL[a.condition])}</span>
                      {a.status !== 'IN_USE' && <span className={STATUS_STYLE[a.status]}>{pair(STATUS_LABEL[a.status])}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {dialogs.node}
    </div>
  );
}
