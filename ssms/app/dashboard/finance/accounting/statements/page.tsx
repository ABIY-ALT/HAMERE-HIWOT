'use client';

// Financial statements from the general ledger: trial balance, income
// statement (statement of activities), balance sheet (statement of financial
// position) and cash flow. Each can be compared, printed and exported.
// Server work: ../actions (the figures are computed there, lib/finance/gl).

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { ExportButton } from '@/components/ui/ExportButton';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { GlNav, PeriodBar, ReportHeading, periodText } from '@/components/finance/GlShared';
import { exportTable, type ExportCell } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  CASH_SECTION_LABEL,
  accountName,
  addDays,
  fiscalYearStart,
  fmtAmount,
  type BalanceSheet,
  type Bilingual,
  type CashFlow,
  type IncomeStatement,
  type ReportKind,
  type StatementGroup,
  type StatementLine,
  type StatementsData,
  type TrialBalance,
} from '@/lib/finance/gl';
import { loadStatements, type StatementParams } from '../actions';

const REPORTS: { key: ReportKind; label: Bilingual; hint: Bilingual }[] = [
  { key: 'trial', label: ['Trial balance', 'የሙከራ ሚዛን'], hint: ['Every account’s opening, movement and closing balance', 'የእያንዳንዱ ሂሳብ መነሻ፣ እንቅስቃሴና መዝጊያ'] },
  { key: 'income', label: ['Income statement', 'የገቢና ወጪ መግለጫ'], hint: ['Statement of activities: income, expenses, surplus', 'ገቢ፣ ወጪና ትርፍ'] },
  { key: 'balance', label: ['Balance sheet', 'የሀብትና ዕዳ መግለጫ'], hint: ['Statement of financial position', 'የፋይናንስ አቋም መግለጫ'] },
  { key: 'cashflow', label: ['Cash flow', 'የገንዘብ ፍሰት'], hint: ['Cash received and paid, by activity', 'የገባና የወጣ ገንዘብ በእንቅስቃሴ'] },
];

type Tr = (en: string, am: string) => string;
const lbl = (l: Bilingual, locale: string) => (locale === 'am' ? l[1] : l[0]);

export default function StatementsPage() {
  const { t, locale } = useLang();
  const router = useRouter();
  const sp = useSearchParams();

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<StatementsData | null>(null);
  const [params, setParams] = useState<StatementParams>(() => ({
    report: (REPORTS.some((r) => r.key === sp.get('report')) ? sp.get('report') : 'trial') as ReportKind,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    compare: sp.get('compare') ?? undefined,
    unit: sp.get('unit') ?? undefined,
  }));

  const apply = useCallback((res: Awaited<ReturnType<typeof loadStatements>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  useEffect(() => {
    loadStatements(params).then(apply);
  }, [apply, params]);

  const update = (patch: Partial<StatementParams>) => {
    setMode('loading');
    const next = { ...params, ...patch };
    setParams(next);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, String(v));
    router.replace(`?${q.toString()}`);
  };

  const fyStart = data?.settings.fiscal_year_start ?? '07-08';
  const to = params.to ?? todayIso();
  const from = params.from ?? fiscalYearStart(to, fyStart);
  const tenant: Bilingual = data?.tenant ?? ['', ''];

  return (
    <div className="space-y-5 print-sheet">
      <div className="no-print">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Accounting', 'የሂሳብ አያያዝ')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('Financial statements straight from the books', 'የሂሳብ መግለጫዎች በቀጥታ ከመዝገቡ')}</p>
      </div>
      <GlNav />

      <div className="no-print grid grid-cols-2 lg:grid-cols-4 gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => update({ report: r.key, compare: undefined })}
            className={`text-left card p-3 transition-colors ${params.report === r.key ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/40' : 'hover:border-blue-300'}`}
          >
            <div className="text-sm font-bold text-slate-900">{lbl(r.label, locale)}</div>
            <div className="text-[11px] text-slate-500">{lbl(r.hint, locale)}</div>
          </button>
        ))}
      </div>

      <PeriodBar from={from} to={to} fyStart={fyStart} single={params.report === 'balance'} onChange={(f, tt) => update({ from: f, to: tt })}>
        {params.report === 'income' && (
          <>
            <label className="text-xs font-semibold text-slate-600">
              {t('Compare with', 'አወዳድር ከ')}
              <select value={params.compare ?? ''} onChange={(e) => update({ compare: e.target.value || undefined })} className="form-input text-sm mt-1 block">
                <option value="">{t('No comparison', 'ያለ ማወዳደሪያ')}</option>
                <option value="previous">{t('Previous period', 'ያለፈው ጊዜ')}</option>
                <option value="year">{t('Same period last year', 'ያለፈው ዓመት ተመሳሳይ ጊዜ')}</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              {t('Department', 'ክፍል')}
              <select value={params.unit ?? ''} onChange={(e) => update({ unit: e.target.value || undefined })} className="form-input text-sm mt-1 block">
                <option value="">{t('Whole Sunday school', 'መላው ሰንበት ት/ቤት')}</option>
                {(data?.units ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {params.report === 'balance' && (
          <label className="text-xs font-semibold text-slate-600">
            {t('Compare with (date)', 'አወዳድር ከ (ቀን)')}
            <div className="flex items-center gap-1 mt-1">
              <input type="date" value={params.compare ?? ''} max={to} onChange={(e) => update({ compare: e.target.value || undefined })} className="form-input text-sm" />
              <button
                type="button"
                onClick={() => update({ compare: addDays(fiscalYearStart(to, fyStart), -1) })}
                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:border-blue-300 whitespace-nowrap"
              >
                {t('End of last fiscal year', 'ያለፈው በጀት ዓመት መጨረሻ')}
              </button>
            </div>
          </label>
        )}
      </PeriodBar>

      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && data && (
        <div className="card p-4 sm:p-6 space-y-4">
          {data.trial && <TrialView r={data.trial} tenant={tenant} locale={locale} t={t} />}
          {data.income && <IncomeView r={data.income} tenant={tenant} unit={data.units.find((u) => u.id === params.unit)} locale={locale} t={t} />}
          {data.balance && <BalanceView r={data.balance} fy={fyStart} tenant={tenant} locale={locale} t={t} />}
          {data.cashflow && <CashFlowView r={data.cashflow} tenant={tenant} locale={locale} t={t} />}
        </div>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Amount({ n, strong = false, double = false }: { n: number | null; strong?: boolean; double?: boolean }) {
  if (n === null) return <td />;
  return (
    <td className={`text-right font-mono text-sm whitespace-nowrap ${strong ? 'font-bold' : ''} ${n < 0 ? 'text-red-600' : 'text-slate-800'}`}>
      <span className={double ? 'border-b-4 border-double border-slate-700 pb-0.5' : strong ? 'border-t border-slate-400 pt-0.5' : ''}>{fmtAmount(n)}</span>
    </td>
  );
}

function Balanced({ ok, t, text }: { ok: boolean; t: Tr; text?: string }) {
  return ok ? (
    <div className="no-print flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={14} /> {text ?? t('In balance', 'ሚዛናዊ ነው')}</div>
  ) : (
    <div className="flex items-center gap-1.5 text-xs text-red-700 font-semibold"><AlertTriangle size={14} /> {t('Out of balance — check the entries', 'ሚዛናዊ አይደለም — ምዝገባዎቹን ያረጋግጡ')}</div>
  );
}

const ledgerHref = (accountId: string, from: string, to: string) => `/dashboard/finance/accounting/ledger?account=${accountId}&from=${from}&to=${to}`;

function lineName(l: StatementLine, locale: string) {
  return l.account ? accountName(l.account, locale) : l.label ? lbl(l.label, locale) : '';
}

/** Rows of grouped statement lines, with a subtotal per group */
function GroupRows({ groups, locale, hasCompare, link }: { groups: StatementGroup[]; locale: string; hasCompare: boolean; link?: (id: string) => string }) {
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.code}>
          <tr>
            <td colSpan={hasCompare ? 3 : 2} className="pt-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{lbl(g.label, locale)}</td>
          </tr>
          {g.lines.map((l, i) => (
            <tr key={l.account?.id ?? i}>
              <td className="pl-4 text-sm text-slate-800">
                {l.account && <span className="font-mono text-[11px] text-slate-400 mr-2">{l.account.code}</span>}
                {l.account && link ? (
                  <Link href={link(l.account.id)} className="hover:text-blue-700 hover:underline">{lineName(l, locale)}</Link>
                ) : (
                  <span className={l.account ? '' : 'italic'}>{lineName(l, locale)}</span>
                )}
              </td>
              <Amount n={l.amount} />
              {hasCompare && <Amount n={l.compare} />}
            </tr>
          ))}
          {g.lines.length > 1 && (
            <tr>
              <td className="pl-4 text-xs font-semibold text-slate-600">{locale === 'am' ? `ድምር ${g.label[1]}` : `Total ${g.label[0].toLowerCase()}`}</td>
              <Amount n={g.total} strong />
              {hasCompare && <Amount n={g.compareTotal} strong />}
            </tr>
          )}
        </React.Fragment>
      ))}
    </>
  );
}

function TotalRow({ label, n, c, hasCompare, double = false, big = false }: { label: string; n: number; c: number | null; hasCompare: boolean; double?: boolean; big?: boolean }) {
  return (
    <tr className={big ? 'bg-slate-50' : ''}>
      <td className={`font-bold text-slate-900 ${big ? 'text-base' : 'text-sm'} pt-2`}>{label}</td>
      <Amount n={n} strong double={double} />
      {hasCompare && <Amount n={c} strong double={double} />}
    </tr>
  );
}

function rowsOfGroups(groups: StatementGroup[], hasCompare: boolean): ExportCell[][] {
  const out: ExportCell[][] = [];
  for (const g of groups) {
    out.push([g.label[0], '', ...(hasCompare ? [''] : [])]);
    for (const l of g.lines) out.push([`   ${l.account ? `${l.account.code} ${l.account.name_en}` : l.label?.[0] ?? ''}`, l.amount, ...(hasCompare ? [l.compare] : [])]);
    out.push([`Total ${g.label[0].toLowerCase()}`, g.total, ...(hasCompare ? [g.compareTotal] : [])]);
  }
  return out;
}

// ── Trial balance ────────────────────────────────────────────────────────────

function TrialView({ r, tenant, locale, t }: { r: TrialBalance; tenant: Bilingual; locale: string; t: Tr }) {
  const name = (row: TrialBalance['rows'][number]) => (row.account ? accountName(row.account, locale) : t('Accumulated surplus (earlier years)', 'የተጠራቀመ ትርፍ (ያለፉት ዓመታት)'));
  const dr = (n: number) => (n > 0 ? n : 0);
  const cr = (n: number) => (n < 0 ? -n : 0);
  const ok = Math.abs(r.totals.closingDr - r.totals.closingCr) < 0.01 && Math.abs(r.totals.debit - r.totals.credit) < 0.01;

  const doExport = async (format: 'xlsx' | 'csv') => {
    await exportTable(
      `trial-balance_${r.to}`,
      ['Account no.', 'Account', 'Opening Dr', 'Opening Cr', 'Debit', 'Credit', 'Closing Dr', 'Closing Cr'],
      [
        ...r.rows.map((row) => [row.account?.code ?? '', row.account?.name_en ?? 'Accumulated surplus (earlier years)', dr(row.opening) || null, cr(row.opening) || null, row.debit || null, row.credit || null, dr(row.closing) || null, cr(row.closing) || null]),
        ['', 'Total', r.totals.openingDr, r.totals.openingCr, r.totals.debit, r.totals.credit, r.totals.closingDr, r.totals.closingCr],
      ],
      format,
      { sheet: 'Trial balance', widths: [12, 40, 14, 14, 14, 14, 14, 14] }
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeading tenant={tenant} title={['Trial balance', 'የሙከራ ሚዛን']} period={periodText(r.from, r.to, locale)} onPrint={() => window.print()} />
        <div className="no-print"><ExportButton onExport={doExport} /></div>
      </div>
      <Balanced ok={ok} t={t} />
      <div className="table-container print-landscape">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>{t('No.', 'ቁጥር')}</th>
              <th rowSpan={2}>{t('Account', 'ሂሳብ')}</th>
              <th colSpan={2} className="text-center">{t('Opening balance', 'መነሻ ቀሪ')}</th>
              <th colSpan={2} className="text-center">{t('Movement in period', 'የጊዜው እንቅስቃሴ')}</th>
              <th colSpan={2} className="text-center">{t('Closing balance', 'የመዝጊያ ቀሪ')}</th>
            </tr>
            <tr>
              {[0, 1, 2].map((i) => (
                <React.Fragment key={i}>
                  <th className="text-right">{t('Debit', 'ዴቢት')}</th>
                  <th className="text-right">{t('Credit', 'ክሬዲት')}</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={row.account?.id ?? `retained-${i}`}>
                <td className="font-mono text-xs text-slate-500">{row.account?.code ?? ''}</td>
                <td className="text-sm">
                  {row.account ? (
                    <Link href={ledgerHref(row.account.id, r.from, r.to)} className="hover:text-blue-700 hover:underline">{name(row)}</Link>
                  ) : (
                    <span className="italic">{name(row)}</span>
                  )}
                </td>
                {[dr(row.opening), cr(row.opening), row.debit, row.credit, dr(row.closing), cr(row.closing)].map((n, j) => (
                  <td key={j} className="text-right font-mono text-sm">{fmtAmount(n, true)}</td>
                ))}
              </tr>
            ))}
            {r.rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-sm text-slate-400 py-8">{t('No entries yet', 'ገና ምዝገባ የለም')}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td />
              <td className="text-sm">{t('Total', 'ድምር')}</td>
              {[r.totals.openingDr, r.totals.openingCr, r.totals.debit, r.totals.credit, r.totals.closingDr, r.totals.closingCr].map((n, j) => (
                <td key={j} className="text-right font-mono text-sm"><span className="border-b-4 border-double border-slate-700">{fmtAmount(n)}</span></td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        {t(
          'Income and expense accounts start from the beginning of the fiscal year; what they held in earlier years is shown as accumulated surplus.',
          'የገቢና ወጪ ሂሳቦች ከበጀት ዓመቱ መጀመሪያ ይጀምራሉ፤ ባለፉት ዓመታት የነበራቸው እንደ የተጠራቀመ ትርፍ ይታያል።'
        )}
      </p>
    </>
  );
}

// ── Income statement ─────────────────────────────────────────────────────────

function IncomeView({ r, tenant, unit, locale, t }: { r: IncomeStatement; tenant: Bilingual; unit?: { name_en: string; name_am: string }; locale: string; t: Tr }) {
  const hasCompare = Boolean(r.compare);
  const link = (id: string) => ledgerHref(id, r.from, r.to);
  const period = periodText(r.from, r.to, locale) + (unit ? ` · ${locale === 'am' ? unit.name_am : unit.name_en}` : '');

  const doExport = async (format: 'xlsx' | 'csv') => {
    const head = ['', `${r.from} – ${r.to}`, ...(hasCompare ? [`${r.compare!.from} – ${r.compare!.to}`] : [])];
    await exportTable(
      `income-statement_${r.from}_${r.to}`,
      head,
      [
        ['INCOME', '', ...(hasCompare ? [''] : [])],
        ...rowsOfGroups(r.income, hasCompare),
        ['Total income', r.totalIncome, ...(hasCompare ? [r.compareIncome] : [])],
        [],
        ['EXPENSES', '', ...(hasCompare ? [''] : [])],
        ...rowsOfGroups(r.expenses, hasCompare),
        ['Total expenses', r.totalExpenses, ...(hasCompare ? [r.compareExpenses] : [])],
        [],
        ['Surplus (deficit) for the period', r.surplus, ...(hasCompare ? [r.compareSurplus] : [])],
      ],
      format,
      { sheet: 'Income statement', widths: [48, 18, 18] }
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeading tenant={tenant} title={['Income statement (statement of activities)', 'የገቢና ወጪ መግለጫ']} period={period} onPrint={() => window.print()} />
        <div className="no-print"><ExportButton onExport={doExport} /></div>
      </div>
      <div className="max-w-3xl">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th />
              <th className="text-right font-semibold pb-1">{r.from} – {r.to}</th>
              {hasCompare && <th className="text-right font-semibold pb-1">{r.compare!.from} – {r.compare!.to}</th>}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} className="pt-2 text-sm font-bold text-emerald-800">{t('Income', 'ገቢ')}</td></tr>
            <GroupRows groups={r.income} locale={locale} hasCompare={hasCompare} link={link} />
            <TotalRow label={t('Total income', 'ጠቅላላ ገቢ')} n={r.totalIncome} c={r.compareIncome} hasCompare={hasCompare} />
            <tr><td colSpan={3} className="pt-5 text-sm font-bold text-rose-800">{t('Expenses', 'ወጪ')}</td></tr>
            <GroupRows groups={r.expenses} locale={locale} hasCompare={hasCompare} link={link} />
            <TotalRow label={t('Total expenses', 'ጠቅላላ ወጪ')} n={r.totalExpenses} c={r.compareExpenses} hasCompare={hasCompare} />
            <tr><td colSpan={3} className="pt-3" /></tr>
            <TotalRow
              label={r.surplus >= 0 ? t('Surplus for the period', 'የጊዜው ትርፍ') : t('Deficit for the period', 'የጊዜው ጉድለት')}
              n={r.surplus}
              c={r.compareSurplus}
              hasCompare={hasCompare}
              double
              big
            />
          </tbody>
        </table>
        {r.income.length === 0 && r.expenses.length === 0 && <p className="text-sm text-slate-400 mt-4">{t('No income or expenses in this period', 'በዚህ ጊዜ ገቢም ወጪም የለም')}</p>}
        {r.totalIncome > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {t('Expenses as a share of income', 'ወጪ ከገቢ ያለው ድርሻ')}: <b>{Math.round((r.totalExpenses / r.totalIncome) * 100)}%</b>
          </p>
        )}
      </div>
    </>
  );
}

// ── Balance sheet ────────────────────────────────────────────────────────────

function BalanceView({ r, fy, tenant, locale, t }: { r: BalanceSheet; fy: string; tenant: Bilingual; locale: string; t: Tr }) {
  const hasCompare = Boolean(r.compareAsOf);
  const link = (id: string) => ledgerHref(id, fiscalYearStart(r.asOf, fy), r.asOf);
  const totalLnA = r.totalLiabilities + r.totalNetAssets;
  const cmpLnA = hasCompare ? (r.compareTotalLiabilities ?? 0) + (r.compareTotalNetAssets ?? 0) : null;

  const doExport = async (format: 'xlsx' | 'csv') => {
    const c = (n: number | null) => (hasCompare ? [n] : []);
    await exportTable(
      `balance-sheet_${r.asOf}`,
      ['', `As of ${r.asOf}`, ...(hasCompare ? [`As of ${r.compareAsOf}`] : [])],
      [
        ['ASSETS', '', ...c(null)],
        ...rowsOfGroups(r.currentAssets, hasCompare),
        ...rowsOfGroups(r.nonCurrentAssets, hasCompare),
        ['Total assets', r.totalAssets, ...c(r.compareTotalAssets)],
        [],
        ['LIABILITIES', '', ...c(null)],
        ...rowsOfGroups(r.currentLiabilities, hasCompare),
        ...rowsOfGroups(r.longTermLiabilities, hasCompare),
        ['Total liabilities', r.totalLiabilities, ...c(r.compareTotalLiabilities)],
        [],
        ['NET ASSETS', '', ...c(null)],
        ...rowsOfGroups(r.netAssets, hasCompare),
        ['Total net assets', r.totalNetAssets, ...c(r.compareTotalNetAssets)],
        [],
        ['Total liabilities and net assets', round(totalLnA), ...c(cmpLnA === null ? null : round(cmpLnA))],
      ],
      format,
      { sheet: 'Balance sheet', widths: [48, 18, 18] }
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeading tenant={tenant} title={['Balance sheet (statement of financial position)', 'የሀብትና ዕዳ መግለጫ']} period={periodText(null, r.asOf, locale)} onPrint={() => window.print()} />
        <div className="no-print"><ExportButton onExport={doExport} /></div>
      </div>
      <Balanced ok={Math.abs(r.difference) < 0.01} t={t} text={t('Assets = liabilities + net assets ✓', 'ሀብት = ዕዳ + የተጣራ ሀብት ✓')} />
      <div className="max-w-3xl">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th />
              <th className="text-right font-semibold pb-1">{r.asOf}</th>
              {hasCompare && <th className="text-right font-semibold pb-1">{r.compareAsOf}</th>}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} className="pt-2 text-sm font-bold text-sky-800">{t('Assets', 'ሀብት')}</td></tr>
            <GroupRows groups={r.currentAssets} locale={locale} hasCompare={hasCompare} link={link} />
            <GroupRows groups={r.nonCurrentAssets} locale={locale} hasCompare={hasCompare} link={link} />
            <TotalRow label={t('Total assets', 'ጠቅላላ ሀብት')} n={r.totalAssets} c={r.compareTotalAssets} hasCompare={hasCompare} double big />

            <tr><td colSpan={3} className="pt-6 text-sm font-bold text-amber-800">{t('Liabilities', 'ዕዳዎች')}</td></tr>
            <GroupRows groups={r.currentLiabilities} locale={locale} hasCompare={hasCompare} link={link} />
            <GroupRows groups={r.longTermLiabilities} locale={locale} hasCompare={hasCompare} link={link} />
            <TotalRow label={t('Total liabilities', 'ጠቅላላ ዕዳ')} n={r.totalLiabilities} c={r.compareTotalLiabilities} hasCompare={hasCompare} />

            <tr><td colSpan={3} className="pt-5 text-sm font-bold text-violet-800">{t('Net assets (funds)', 'የተጣራ ሀብት (ፈንድ)')}</td></tr>
            <GroupRows groups={r.netAssets} locale={locale} hasCompare={hasCompare} link={link} />
            <TotalRow label={t('Total net assets', 'ጠቅላላ የተጣራ ሀብት')} n={r.totalNetAssets} c={r.compareTotalNetAssets} hasCompare={hasCompare} />
            <tr><td colSpan={3} className="pt-3" /></tr>
            <TotalRow label={t('Total liabilities and net assets', 'ጠቅላላ ዕዳና የተጣራ ሀብት')} n={round(totalLnA)} c={cmpLnA === null ? null : round(cmpLnA)} hasCompare={hasCompare} double big />
          </tbody>
        </table>
      </div>
    </>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

// ── Cash flow ────────────────────────────────────────────────────────────────

function CashFlowView({ r, tenant, locale, t }: { r: CashFlow; tenant: Bilingual; locale: string; t: Tr }) {
  const doExport = async (format: 'xlsx' | 'csv') => {
    const rows: ExportCell[][] = [['Cash and bank at the start of the period', r.opening]];
    for (const s of r.sections) {
      rows.push([], [CASH_SECTION_LABEL[s.code][0], null]);
      for (const row of s.rows) rows.push([`   ${row.account.code} ${row.account.name_en}`, row.amount]);
      rows.push([`Net cash from ${s.code.toLowerCase()}`, s.total]);
    }
    rows.push([], ['Net change in cash', r.netChange], ['Cash and bank at the end of the period', r.closing]);
    await exportTable(`cash-flow_${r.from}_${r.to}`, ['', `${r.from} – ${r.to}`], rows, format, { sheet: 'Cash flow', widths: [52, 18] });
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeading tenant={tenant} title={['Cash flow statement', 'የገንዘብ ፍሰት መግለጫ']} period={periodText(r.from, r.to, locale)} onPrint={() => window.print()} />
        <div className="no-print"><ExportButton onExport={doExport} /></div>
      </div>
      <Balanced ok={Math.abs(r.closing - r.bookClosing) < 0.01} t={t} text={t('Agrees with the cash and bank balances ✓', 'ከጥሬ ገንዘብና ባንክ ቀሪ ጋር ይስማማል ✓')} />
      <div className="max-w-3xl">
        <table className="w-full">
          <tbody>
            <TotalRow label={t('Cash and bank at the start of the period', 'በጊዜው መጀመሪያ የነበረ ጥሬ ገንዘብና ባንክ')} n={r.opening} c={null} hasCompare={false} />
            {r.sections.map((s) => (
              <React.Fragment key={s.code}>
                <tr><td colSpan={2} className="pt-5 text-sm font-bold text-slate-800">{lbl(CASH_SECTION_LABEL[s.code], locale)}</td></tr>
                {s.rows.map((row) => (
                  <tr key={row.account.id}>
                    <td className="pl-4 text-sm text-slate-800">
                      <span className="font-mono text-[11px] text-slate-400 mr-2">{row.account.code}</span>
                      {row.amount >= 0 ? t('Received — ', 'የገባ — ') : t('Paid — ', 'የወጣ — ')}
                      {accountName(row.account, locale)}
                    </td>
                    <Amount n={row.amount} />
                  </tr>
                ))}
                <tr>
                  <td className="pl-4 text-xs font-semibold text-slate-600">{t('Net cash', 'የተጣራ ገንዘብ')}</td>
                  <Amount n={s.total} strong />
                </tr>
              </React.Fragment>
            ))}
            <tr><td colSpan={2} className="pt-4" /></tr>
            <TotalRow label={t('Net change in cash', 'የገንዘብ የተጣራ ለውጥ')} n={r.netChange} c={null} hasCompare={false} />
            <TotalRow label={t('Cash and bank at the end of the period', 'በጊዜው መጨረሻ ያለ ጥሬ ገንዘብና ባንክ')} n={r.closing} c={null} hasCompare={false} double big />
          </tbody>
        </table>
        <p className="mt-4 text-[11px] text-slate-500">
          {t('Money moved between your own accounts (e.g. cash deposited at the bank) is not a flow and is left out.', 'በራስዎ ሂሳቦች መካከል የተዛወረ ገንዘብ (ለምሳሌ ባንክ የገባ ጥሬ ገንዘብ) ፍሰት ስላልሆነ አይካተትም።')}
        </p>
      </div>
    </>
  );
}
