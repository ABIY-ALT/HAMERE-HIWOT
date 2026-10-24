'use client';

// General ledger: one account's (or every account's) entries in a period,
// with the opening balance, debits, credits and the running balance.
// Server work: ../actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { ExportButton } from '@/components/ui/ExportButton';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { GlNav, PeriodBar, ReportHeading, periodText } from '@/components/finance/GlShared';
import { exportTable, type ExportCell } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { GL_TYPES, SOURCE_LABEL, accountName, chartOrder, fmtAmount, type LedgerData, type LedgerSection } from '@/lib/finance/gl';
import { loadLedger } from '../actions';

const EMPTY: LedgerData = { accounts: [], settings: { fiscal_year_start: '07-08', lock_date: null, require_approval: false }, sections: [], from: todayIso(), to: todayIso() };

export default function GeneralLedgerPage() {
  const { t, locale } = useLang();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<LedgerData>(EMPTY);
  const [query, setQuery] = useState({
    account: params.get('account') ?? '',
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  } as { account: string; from?: string; to?: string });

  const apply = useCallback((res: Awaited<ReturnType<typeof loadLedger>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadLedger(query).then(apply);
  }, [apply, query]);

  const update = (patch: Partial<typeof query>) => {
    setMode('loading');
    const next = { ...query, ...patch };
    setQuery(next);
    const p = new URLSearchParams();
    if (next.account) p.set('account', next.account);
    if (next.from) p.set('from', next.from);
    if (next.to) p.set('to', next.to);
    router.replace(`?${p.toString()}`);
  };

  const options = useMemo(() => chartOrder(data.accounts).filter((a) => !a.is_header), [data.accounts]);
  const tenant: [string, string] = [user?.tenant?.name_en ?? '', user?.tenant?.name_am || user?.tenant?.name_en || ''];

  const exportLedger = async (format: 'xlsx' | 'csv') => {
    const rows: ExportCell[][] = [];
    for (const s of data.sections) {
      rows.push([`${s.account.code} ${s.account.name_en}`, '', '', '', '', '', '', null, null, null]);
      rows.push(['', '', 'Opening balance', '', '', '', '', null, null, s.opening]);
      for (const r of s.rows) rows.push([r.date, r.entry_no, r.memo, r.reference, r.description, r.unit, SOURCE_LABEL[r.source][0], r.debit || null, r.credit || null, r.balance]);
      rows.push(['', '', 'Totals and closing balance', '', '', '', '', s.debit, s.credit, s.closing]);
      rows.push([]);
    }
    await exportTable(
      `general-ledger_${data.from}_${data.to}`,
      ['Date', 'Entry no.', 'Memo', 'Reference', 'Line description', 'Department', 'Source', 'Debit', 'Credit', 'Balance'],
      rows,
      format,
      { sheet: 'General ledger', widths: [12, 14, 40, 14, 28, 18, 16, 14, 14, 16] }
    );
  };

  return (
    <div className="space-y-5 print-sheet">
      <div className="no-print">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Accounting', 'የሂሳብ አያያዝ')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('Every movement of an account, with its running balance', 'የአንድ ሂሳብ እያንዳንዱ እንቅስቃሴ ከቀሪው ጋር')}</p>
      </div>
      <GlNav />
      <AdminModeNotice mode={mode} error={error} />

      <PeriodBar from={data.from} to={data.to} fyStart={data.settings.fiscal_year_start} onChange={(from, to) => update({ from, to })}>
        <label className="text-xs font-semibold text-slate-600 min-w-[220px] flex-1">
          {t('Account', 'ሂሳብ')}
          <select value={query.account} onChange={(e) => update({ account: e.target.value })} className="form-input text-sm mt-1 block">
            <option value="">— {t('Choose an account', 'ሂሳብ ይምረጡ')} —</option>
            <option value="all">{t('All accounts with activity', 'እንቅስቃሴ ያላቸው ሁሉም ሂሳቦች')}</option>
            {GL_TYPES.map((g) => (
              <optgroup key={g.code} label={locale === 'am' ? g.label[1] : g.label[0]}>
                {options.filter((a) => a.type === g.code).map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {accountName(a, locale)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <ExportButton onExport={exportLedger} disabled={!data.sections.length} />
      </PeriodBar>

      {mode !== 'error' && query.account === '' && (
        <div className="card p-8 text-center text-sm text-slate-500">{t('Choose an account to see its ledger.', 'መዝገቡን ለማየት ሂሳብ ይምረጡ።')}</div>
      )}

      {data.sections.length > 0 && (
        <div className="card p-4 space-y-5">
          <ReportHeading tenant={tenant} title={['General ledger', 'ጠቅላላ መዝገብ']} period={periodText(data.from, data.to, locale)} onPrint={() => window.print()} />
          {data.sections.map((s) => (
            <Section key={s.account.id} s={s} locale={locale} t={t} />
          ))}
        </div>
      )}
      {mode === 'live' && query.account && data.sections.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">{t('Nothing in this period.', 'በዚህ ጊዜ ምንም የለም።')}</div>
      )}
    </div>
  );
}

function Section({ s, locale, t }: { s: LedgerSection; locale: string; t: (en: string, am: string) => string }) {
  const side = s.account.normal_balance === 'DEBIT' ? t('Dr', 'ዴ') : t('Cr', 'ክ');
  return (
    <div className="space-y-1 break-inside-avoid-page">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-bold text-slate-900 text-sm">
          <span className="font-mono mr-2">{s.account.code}</span>
          {accountName(s.account, locale)}
        </div>
        <div className="text-[11px] text-slate-500">
          {t('Normal balance', 'መደበኛ ቀሪ')}: {s.account.normal_balance === 'DEBIT' ? t('Debit', 'ዴቢት') : t('Credit', 'ክሬዲት')}
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{t('Date', 'ቀን')}</th>
              <th>{t('Entry', 'ምዝገባ')}</th>
              <th>{t('Memo', 'መግለጫ')}</th>
              <th className="hidden lg:table-cell">{t('Department', 'ክፍል')}</th>
              <th className="text-right">{t('Debit', 'ዴቢት')}</th>
              <th className="text-right">{t('Credit', 'ክሬዲት')}</th>
              <th className="text-right">{t('Balance', 'ቀሪ')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50/70">
              <td colSpan={4} className="text-xs font-semibold text-slate-600">{t('Opening balance', 'መነሻ ቀሪ')}</td>
              <td />
              <td />
              <td className="text-right font-mono text-sm font-semibold">{fmtAmount(s.opening)} <span className="text-[10px] text-slate-400">{side}</span></td>
            </tr>
            {s.rows.map((r, i) => (
              <tr key={`${r.entry_id}-${i}`}>
                <td className="text-xs whitespace-nowrap">
                  {formatEthiopianDate(r.date, locale as 'en' | 'am')}
                  <div className="text-[10px] text-slate-400">{r.date}</div>
                </td>
                <td className="font-mono text-xs whitespace-nowrap">
                  <Link href={`/dashboard/finance/accounting/journal?from=${r.date}&to=${r.date}`} className="text-blue-700 hover:underline">{r.entry_no}</Link>
                </td>
                <td className="text-sm text-slate-800">
                  {r.memo}
                  {(r.description || r.reference) && <div className="text-[11px] text-slate-400">{[r.description, r.reference].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="hidden lg:table-cell text-xs text-slate-500">{r.unit}</td>
                <td className="text-right font-mono text-sm">{fmtAmount(r.debit, true)}</td>
                <td className="text-right font-mono text-sm">{fmtAmount(r.credit, true)}</td>
                <td className={`text-right font-mono text-sm ${r.balance < 0 ? 'text-red-600' : ''}`}>{fmtAmount(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={4} className="text-sm">{t('Totals · closing balance', 'ድምር · የመዝጊያ ቀሪ')}</td>
              <td className="text-right font-mono">{fmtAmount(s.debit)}</td>
              <td className="text-right font-mono">{fmtAmount(s.credit)}</td>
              <td className={`text-right font-mono ${s.closing < 0 ? 'text-red-600' : ''}`}>{fmtAmount(s.closing)} <span className="text-[10px] text-slate-400">{side}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
