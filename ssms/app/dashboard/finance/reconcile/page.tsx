'use client';

// Bank reconciliation: an imported statement's lines next to the books.
// Each bank line is matched to the ledger record(s) it is, to a transfer
// between our own accounts, recorded as a new record (bank charges, interest,
// a direct deposit), or set aside with a reason. The summary compares the
// bank's closing balance with the books; a statement is closed when every
// line is done. Server work: ../banking/actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, ArrowRightLeft, Check, CheckCircle2, EyeOff, Link2, Lock, Plus, RotateCcw, Search, Sparkles, Trash2, Unlink, Upload, Wand2,
} from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { StatementImport } from '@/components/finance/StatementImport';
import { refreshFinance, useFinance } from '@/lib/finance/client';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoryLabel, formatETB } from '@/lib/finance/types';
import { suggest, transferCandidates, type LedgerItem, type ReconcileView, type StatementLine } from '@/lib/finance/banking';
import { demoReconcile } from '@/lib/finance/banking-demo';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import {
  accountOptions, autoMatch, deleteStatement, finishStatement, ignoreLine, loadReconcile, matchLine, matchTransfer,
  recordFromLine, reopenStatement, setClosingBalance, unmatchLine,
} from '../banking/actions';

type Tab = 'UNMATCHED' | 'MATCHED' | 'IGNORED' | 'ALL';
type Dialog =
  | { kind: 'find'; line: StatementLine }
  | { kind: 'record'; line: StatementLine }
  | { kind: 'ignore'; line: StatementLine }
  | null;

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReconcilePage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canWork = can('FINANCE_CREATE');
  const canClose = can('FINANCE_APPROVE');
  const router = useRouter();
  const params = useSearchParams();
  const fin = useFinance();

  const [accounts, setAccounts] = useState<{ id: string; name: string; kind: string }[]>([]);
  const accountId = params.get('account') ?? '';
  const statementId = params.get('statement') ?? '';
  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [view, setView] = useState<ReconcileView | null>(null);
  const [tab, setTab] = useState<Tab>('UNMATCHED');
  const [importing, setImporting] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [showOutstanding, setShowOutstanding] = useState(false);

  const go = useCallback(
    (account: string, statement?: string) => router.replace(`/dashboard/finance/reconcile?account=${account}${statement ? `&statement=${statement}` : ''}`),
    [router]
  );

  useEffect(() => {
    accountOptions().then((list) => {
      const bankish = list.filter((a) => a.kind !== 'CASH');
      setAccounts(bankish);
      if (!accountId && bankish[0]) go(bankish[0].id);
      if (!list.length) setMode('live');
    });
  }, [accountId, go]);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadReconcile>>) => {
    if (res.mode === 'live') {
      setView(res.data);
      setError('');
    } else if (res.mode === 'demo') setView(demoReconcile());
    else setError(res.error);
    setMode(res.mode);
  }, []);

  const reload = useCallback(async () => {
    if (accountId) apply(await loadReconcile(accountId, statementId || undefined));
  }, [accountId, statementId, apply]);

  useEffect(() => {
    if (accountId) loadReconcile(accountId, statementId || undefined).then(apply);
  }, [accountId, statementId, apply]);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  /** Runs a change, then reloads; the ledger store is refreshed too (accounts of records change). */
  const run = async (key: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(key);
    const res = await action();
    setBusy('');
    if (!res.ok) {
      say('error', res.error ?? 'Error');
      return false;
    }
    say('success', success);
    await reload();
    void refreshFinance();
    return true;
  };

  const st = view?.statement ?? null;
  const closed = st?.status === 'RECONCILED';
  const editable = canWork && !closed;
  const lines = view?.lines ?? [];
  const shown = tab === 'ALL' ? lines : lines.filter((l) => l.status === tab);
  const count = (s: Tab) => (s === 'ALL' ? lines.length : lines.filter((l) => l.status === s).length);
  const s = view?.summary ?? null;
  const difference = s && s.bank_closing != null ? Math.round((s.bank_closing - (s.book_balance + s.bank_only - s.book_only)) * 100) / 100 : null;

  if (mode !== 'loading' && accounts.length === 0) {
    return (
      <div className="space-y-6">
        <Header t={t} />
        <AdminModeNotice mode={mode} error={error} />
        <div className="card p-8 text-center text-sm text-slate-600">
          {t('Add a bank or mobile-money account first.', 'መጀመሪያ የባንክ ወይም የሞባይል ገንዘብ ሂሳብ ይጨምሩ።')}{' '}
          <Link href="/dashboard/finance/accounts" className="font-semibold text-blue-600 hover:underline">{t('Bank accounts →', 'የባንክ ሂሳቦች →')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <Header t={t} />

      {/* Account and statement */}
      <div className="card p-4 flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Account', 'ሂሳብ')}</label>
            <select value={accountId} onChange={(e) => go(e.target.value)} className="form-input text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Statement', 'መግለጫ')}</label>
            <select value={st?.id ?? ''} onChange={(e) => go(accountId, e.target.value)} disabled={!view?.statements.length} className="form-input text-sm">
              {!view?.statements.length && <option value="">{t('None imported yet', 'ገና አልገባም')}</option>}
              {view?.statements.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.period_start && x.period_end ? `${formatEthiopianDate(x.period_start, locale)} – ${formatEthiopianDate(x.period_end, locale)}` : x.file_name}
                  {x.status === 'RECONCILED' ? ` ✓` : x.unmatched ? ` (${x.unmatched})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWork && (
            <button onClick={() => setImporting(true)} disabled={!accountId} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              <Upload size={14} /> {t('Import statement', 'መግለጫ አስገባ')}
            </button>
          )}
          {st && editable && count('UNMATCHED') > 0 && (
            <button
              onClick={async () => {
                setBusy('auto');
                const res = await autoMatch(st.id);
                setBusy('');
                if (!res.ok) return say('error', res.error);
                say('success', t(`${res.matched} line(s) matched`, `${res.matched} መስመር(ሮች) ታርቀዋል`));
                await reload();
              }}
              disabled={busy === 'auto'}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Wand2 size={14} /> {t('Match the clear ones', 'ግልጽ የሆኑትን አስታርቅ')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={mode} error={error} />

      {view && !st && mode === 'live' && (
        <div className="card p-8 text-center">
          <Upload className="mx-auto text-slate-300" size={36} />
          <h2 className="mt-3 font-bold text-slate-800">{t('Import the first statement', 'የመጀመሪያውን መግለጫ ያስገቡ')}</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-lg mx-auto">
            {t(
              'Download the statement for a month from internet banking as Excel, then import it here. Lines that clearly match income and expense records are matched at once; you check the rest.',
              'የአንድ ወር መግለጫን ከኢንተርኔት ባንኪንግ በExcel ያውርዱና እዚህ ያስገቡ። ከገቢና ወጪ መዝገብ ጋር በግልጽ የሚመሳሰሉት ወዲያው ይታረቃሉ፤ የቀሩትን እርስዎ ያያሉ።'
            )}
          </p>
        </div>
      )}

      {st && view && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <SummaryTile
              label={t('Bank balance (statement end)', 'የባንክ ቀሪ (መግለጫ መጨረሻ)')}
              value={s?.bank_closing != null ? formatETB(s.bank_closing) : '—'}
              action={
                editable ? (
                  <button
                    onClick={async () => {
                      const v = window.prompt(t('Bank balance at the end of the statement', 'በመግለጫው መጨረሻ የባንኩ ቀሪ'), s?.bank_closing != null ? String(s.bank_closing) : '');
                      if (v === null) return;
                      const n = v.trim() === '' ? null : Number(v.replace(/,/g, ''));
                      if (n != null && !Number.isFinite(n)) return say('error', t('Not a number', 'ቁጥር አይደለም'));
                      await run('closing', () => setClosingBalance(st.id, n), t('Saved', 'ተቀምጧል'));
                    }}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {t('change', 'ቀይር')}
                  </button>
                ) : null
              }
            />
            <SummaryTile label={t('Books (same day)', 'መዝገብ (በዚያው ቀን)')} value={s ? formatETB(s.book_balance) : '—'} />
            <SummaryTile label={t('In bank, not in books', 'በባንክ አለ፣ በመዝገብ የለም')} value={s ? formatETB(s.bank_only) : '—'} hint={t('unmatched + set-aside lines', 'ያልታረቁና የተተዉ መስመሮች')} />
            <SummaryTile
              label={t('In books, not in bank', 'በመዝገብ አለ፣ በባንክ የለም')}
              value={s ? formatETB(s.book_only) : '—'}
              hint={view.outstanding.length ? t(`${view.outstanding.length} record(s) — e.g. cheques not cashed yet`, `${view.outstanding.length} መዝገብ — ለምሳሌ ገና ያልተመነዘረ ቼክ`) : undefined}
            />
            <div className={`card p-4 ${difference === 0 ? 'border-emerald-200 bg-emerald-50' : difference == null ? '' : 'border-amber-200 bg-amber-50'}`}>
              <div className="text-[11px] text-slate-500">{t('Difference', 'ልዩነት')}</div>
              <div className={`text-lg font-bold font-mono ${difference === 0 ? 'text-emerald-700' : difference == null ? 'text-slate-400' : 'text-amber-700'}`}>
                {difference == null ? '—' : formatETB(difference)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {difference === 0
                  ? t('The bank and the books agree', 'ባንኩና መዝገቡ ይስማማሉ')
                  : difference == null
                    ? t('Enter the bank balance to compare', 'ለማነጻጸር የባንክ ቀሪውን ያስገቡ')
                    : t('Check the opening balance and the lines set aside', 'መነሻ ቀሪውንና የተተዉትን መስመሮች ይፈትሹ')}
              </div>
            </div>
          </div>

          {/* Statement bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              {st.file_name} · {t('imported by', 'ያስገባው')} {st.imported_by || '—'} · {st.line_count} {t('lines', 'መስመሮች')}
              {st.skipped_count > 0 && <> ({st.skipped_count} {t('already imported before', 'ቀድሞ የገቡ')})</>}
              {closed && (
                <span className="ml-2 inline-flex items-center gap-1 badge badge-success">
                  <Lock size={11} /> {t('Reconciled', 'ታርቋል')} · {st.reconciled_by}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!closed && canWork && (
                <button
                  onClick={async () => {
                    if (!window.confirm(t('Remove this statement and its lines? Its matches are undone.', 'ይህ መግለጫና መስመሮቹ ይሰረዙ? ማስታረቆቹ ይቀለበሳሉ።'))) return;
                    if (await run('delete', () => deleteStatement(st.id), t('Statement removed', 'መግለጫው ተሰርዟል'))) go(accountId);
                  }}
                  className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
                >
                  <Trash2 size={13} /> {t('Remove statement', 'መግለጫውን ሰርዝ')}
                </button>
              )}
              {!closed && canClose && (
                <button
                  onClick={() => run('finish', () => finishStatement(st.id), t('Statement reconciled and closed', 'መግለጫው ታርቆ ተዘግቷል'))}
                  disabled={count('UNMATCHED') > 0 || busy === 'finish'}
                  title={count('UNMATCHED') > 0 ? t('Match or set aside every line first', 'መጀመሪያ ሁሉንም መስመሮች ያስታርቁ ወይም ይተዉ') : ''}
                  className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 size={13} /> {t('Close as reconciled', 'እንደታረቀ ዝጋ')}
                </button>
              )}
              {closed && canClose && (
                <button onClick={() => run('reopen', () => reopenStatement(st.id), t('Statement reopened', 'መግለጫው እንደገና ተከፍቷል'))} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                  <RotateCcw size={13} /> {t('Reopen', 'እንደገና ክፈት')}
                </button>
              )}
            </div>
          </div>

          {/* Lines */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap gap-1">
              {(
                [
                  ['UNMATCHED', t('To match', 'የሚታረቁ')],
                  ['MATCHED', t('Matched', 'የታረቁ')],
                  ['IGNORED', t('Set aside', 'የተተዉ')],
                  ['ALL', t('All', 'ሁሉም')],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {label} <span className="opacity-70">({count(key)})</span>
                </button>
              ))}
            </div>
            <div className="divide-y divide-slate-100">
              {shown.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-400">
                  {tab === 'UNMATCHED' ? t('Every line is matched or set aside.', 'ሁሉም መስመሮች ታርቀዋል ወይም ተትተዋል።') : t('Nothing here.', 'ምንም የለም።')}
                </div>
              )}
              {shown.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  view={view}
                  editable={editable}
                  busy={busy}
                  onMatch={(ids) => run(line.id, () => matchLine(line.id, ids), t('Matched', 'ታርቋል'))}
                  onTransfer={(id) => run(line.id, () => matchTransfer(line.id, id), t('Matched to the transfer', 'ከዝውውሩ ጋር ታርቋል'))}
                  onUnmatch={() => run(line.id, () => unmatchLine(line.id), t('Match undone', 'ማስታረቁ ተቀልብሷል'))}
                  onDialog={setDialog}
                />
              ))}
            </div>
          </div>

          {/* Outstanding */}
          {view.outstanding.length > 0 && (
            <div className="card overflow-hidden">
              <button onClick={() => setShowOutstanding((v) => !v)} className="w-full p-4 flex items-center justify-between text-left">
                <span className="font-bold text-sm text-slate-800">
                  {t('In the books, not on a statement yet', 'በመዝገብ ያለ፣ በመግለጫ ገና ያልታየ')} ({view.outstanding.length})
                </span>
                <span className="text-xs text-blue-600">{showOutstanding ? t('Hide', 'ደብቅ') : t('Show', 'አሳይ')}</span>
              </button>
              {showOutstanding && (
                <div className="table-container rounded-none border-0 border-t border-slate-100">
                  <table>
                    <tbody>
                      {view.outstanding.map((x) => (
                        <tr key={x.id}>
                          <td className="text-xs whitespace-nowrap">{formatEthiopianDate(x.date, locale)}</td>
                          <td className="text-xs text-slate-700">{describe(x, locale)}</td>
                          <td className={`text-right font-mono text-xs font-semibold ${x.type === 'INCOME' ? 'text-emerald-700' : 'text-red-600'}`}>
                            {x.type === 'INCOME' ? '+' : '−'}{money(x.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {importing && view && (
        <StatementImport
          accountId={accountId}
          accountName={view.account.name}
          onClose={() => setImporting(false)}
          onImported={(id, message) => {
            setImporting(false);
            say('success', message);
            setTab('UNMATCHED');
            go(accountId, id);
            void refreshFinance();
          }}
        />
      )}

      {dialog?.kind === 'find' && view && (
        <FindDialog
          line={dialog.line}
          view={view}
          onClose={() => setDialog(null)}
          onMatch={async (ids) => {
            if (await run(dialog.line.id, () => matchLine(dialog.line.id, ids), t('Matched', 'ታርቋል'))) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'record' && (
        <RecordDialog
          line={dialog.line}
          units={fin.units}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            if (await run(dialog.line.id, () => recordFromLine(dialog.line.id, input), t('Recorded and matched', 'ተመዝግቦ ታርቋል'))) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'ignore' && (
        <IgnoreDialog
          line={dialog.line}
          onClose={() => setDialog(null)}
          onSave={async (note) => {
            if (await run(dialog.line.id, () => ignoreLine(dialog.line.id, note), t('Line set aside', 'መስመሩ ተትቷል'))) setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function Header({ t }: { t: (en: string, am: string) => string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <Link href="/dashboard/finance/accounts" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft size={12} /> {t('Bank accounts', 'የባንክ ሂሳቦች')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{t('Bank Reconciliation', 'የባንክ ማስታረቅ')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('Check every bank statement line against the income and expense records', 'እያንዳንዱን የባንክ መግለጫ መስመር ከገቢና ወጪ መዝገብ ጋር ያመሳክሩ')}
        </p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, hint, action }: { label: string; value: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">{label}</div>
        {action}
      </div>
      <div className="text-lg font-bold font-mono text-slate-900">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

const describe = (x: LedgerItem, locale: string) =>
  [categoryLabel(x.category, locale), x.request_no, x.party, x.description, x.receipt_no && `#${x.receipt_no}`].filter(Boolean).join(' · ');

function LineRow({
  line, view, editable, busy, onMatch, onTransfer, onUnmatch, onDialog,
}: {
  line: StatementLine;
  view: ReconcileView;
  editable: boolean;
  busy: string;
  onMatch: (ids: string[]) => void;
  onTransfer: (id: string) => void;
  onUnmatch: () => void;
  onDialog: (d: Dialog) => void;
}) {
  const { t, locale } = useLang();
  const tips = useMemo(() => (line.status === 'UNMATCHED' ? suggest(line, view.candidates, view.account.id).slice(0, 3) : []), [line, view]);
  const transfers = useMemo(() => (line.status === 'UNMATCHED' ? transferCandidates(line, view.transfers, view.account.id) : []), [line, view]);
  const transfer = line.transfer_id ? view.transfers.find((x) => x.id === line.transfer_id) : null;
  const working = busy === line.id;

  return (
    <div className={`p-4 flex flex-col lg:flex-row gap-3 ${working ? 'opacity-60' : ''}`}>
      <div className="lg:w-[45%] min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800">{formatEthiopianDate(line.date, locale)} <span className="font-mono font-normal text-slate-400">{line.date}</span></div>
            <div className="text-xs text-slate-700 mt-0.5 break-words">{line.description || '—'}</div>
            {line.reference && <div className="text-[11px] font-mono text-slate-400">{line.reference}</div>}
          </div>
          <div className={`font-mono font-bold text-sm whitespace-nowrap ${line.amount > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {line.amount > 0 ? '+' : '−'}{money(Math.abs(line.amount))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 lg:border-l lg:border-slate-100 lg:pl-4">
        {line.status === 'MATCHED' && (
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs space-y-1 min-w-0">
              {transfer && (
                <div className="flex items-center gap-1.5 text-slate-700"><ArrowRightLeft size={13} className="text-blue-500 shrink-0" /> {t('Transfer', 'ዝውውር')}: {transfer.from} → {transfer.to}</div>
              )}
              {line.txns.map((x) => (
                <div key={x.id} className="flex items-start gap-1.5 text-slate-700">
                  <Check size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">{describe(x, locale)} <span className="font-mono text-slate-400">{money(x.amount)}</span></span>
                </div>
              ))}
              {line.note && <div className="text-[11px] text-slate-400">{line.note}</div>}
            </div>
            {editable && (
              <button onClick={onUnmatch} disabled={working} className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1 shrink-0">
                <Unlink size={12} /> {t('Undo', 'ቀልብስ')}
              </button>
            )}
          </div>
        )}

        {line.status === 'IGNORED' && (
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs text-slate-500 flex items-start gap-1.5"><EyeOff size={13} className="mt-0.5 shrink-0" /> {line.note}</div>
            {editable && (
              <button onClick={onUnmatch} disabled={working} className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1 shrink-0">
                <RotateCcw size={12} /> {t('Bring back', 'መልስ')}
              </button>
            )}
          </div>
        )}

        {line.status === 'UNMATCHED' && (
          <div className="space-y-2">
            {tips.map((tip) => (
              <div key={tip.item.id} className="flex items-center justify-between gap-2 rounded-lg bg-blue-50/60 border border-blue-100 px-2.5 py-1.5">
                <div className="text-xs text-slate-700 min-w-0">
                  {tip.named && <Sparkles size={12} className="inline text-amber-500 mr-1" />}
                  <span className="break-words">{describe(tip.item, locale)}</span>
                  <span className="text-slate-400"> · {formatEthiopianDate(tip.item.date, locale)}{tip.days ? ` (${tip.days} ${t('days apart', 'ቀን ልዩነት')})` : ''}</span>
                </div>
                {editable && (
                  <button onClick={() => onMatch([tip.item.id])} disabled={working} className="btn btn-primary text-[11px] py-1 px-2 inline-flex items-center gap-1 shrink-0">
                    <Link2 size={12} /> {t('Match', 'አስታርቅ')}
                  </button>
                )}
              </div>
            ))}
            {transfers.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-violet-50/60 border border-violet-100 px-2.5 py-1.5">
                <div className="text-xs text-slate-700"><ArrowRightLeft size={12} className="inline text-violet-500 mr-1" />{t('Transfer', 'ዝውውር')}: {x.from} → {x.to} · {formatEthiopianDate(x.date, locale)}</div>
                {editable && (
                  <button onClick={() => onTransfer(x.id)} disabled={working} className="btn btn-primary text-[11px] py-1 px-2 shrink-0">{t('Match', 'አስታርቅ')}</button>
                )}
              </div>
            ))}
            {tips.length === 0 && transfers.length === 0 && (
              <div className="text-xs text-slate-400">{t('No record with this amount near this date.', 'በዚህ ቀን አካባቢ ይህ መጠን ያለው መዝገብ የለም።')}</div>
            )}
            {editable && (
              <div className="flex flex-wrap gap-3 pt-1 text-xs">
                <button onClick={() => onDialog({ kind: 'find', line })} className="text-blue-600 hover:underline inline-flex items-center gap-1"><Search size={12} /> {t('Find records…', 'መዝገብ ፈልግ…')}</button>
                <button onClick={() => onDialog({ kind: 'record', line })} className="text-blue-600 hover:underline inline-flex items-center gap-1"><Plus size={12} /> {line.amount > 0 ? t('Record as new income', 'እንደ አዲስ ገቢ መዝግብ') : t('Record as new expense', 'እንደ አዲስ ወጪ መዝግብ')}</button>
                <button onClick={() => onDialog({ kind: 'ignore', line })} className="text-slate-500 hover:underline inline-flex items-center gap-1"><EyeOff size={12} /> {t('Set aside', 'ተው')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pick one or several records that add up to the line (e.g. a deposit of many collections). */
function FindDialog({ line, view, onClose, onMatch }: { line: StatementLine; view: ReconcileView; onClose: () => void; onMatch: (ids: string[]) => void }) {
  const { t, locale } = useLang();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const type = line.amount > 0 ? 'INCOME' : 'EXPENSE';
  const want = Math.round(Math.abs(line.amount) * 100);
  const needle = q.toLowerCase();
  const list = view.candidates
    .filter((x) => x.type === type && (!needle || describe(x, locale).toLowerCase().includes(needle) || money(x.amount).includes(needle)))
    .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(line.date)) - Math.abs(Date.parse(b.date) - Date.parse(line.date)))
    .slice(0, 150);
  const total = view.candidates.filter((x) => picked.has(x.id)).reduce((s, x) => s + Math.round(x.amount * 100), 0);
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <Modal isOpen onClose={onClose} title={t('Find the records for this line', 'ለዚህ መስመር መዝገቦችን ፈልግ')} subtitle={`${line.description || line.reference || ''} · ${line.amount > 0 ? '+' : '−'}${money(Math.abs(line.amount))}`} maxWidth="2xl">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">
          {t('Tick one record, or several that together make the amount (e.g. many dues deposited at once).', 'አንድ መዝገብ ይምረጡ፣ ወይም አንድ ላይ መጠኑን የሚሆኑ ብዙ መዝገቦችን (ለምሳሌ በአንድ ጊዜ የገቡ ብዙ መዋጮዎች)።')}
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search name, receipt, amount…', 'ስም፣ ደረሰኝ፣ መጠን ፈልግ…')} className="form-input pl-9 text-sm" />
        </div>
        <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {list.length === 0 && <div className="p-6 text-center text-xs text-slate-400">{t('No free records near these dates.', 'በእነዚህ ቀኖች አካባቢ ያልታረቀ መዝገብ የለም።')}</div>}
          {list.map((x) => (
            <label key={x.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(x.id)} onChange={() => toggle(x.id)} />
              <div className="flex-1 min-w-0 text-xs">
                <div className="text-slate-800 break-words">{describe(x, locale)}</div>
                <div className="text-slate-400">{formatEthiopianDate(x.date, locale)}{!x.bank_account_id && ` · ${t('no account yet', 'ሂሳብ ያልተሰጠው')}`}</div>
              </div>
              <div className="font-mono text-xs font-semibold">{money(x.amount)}</div>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className={`text-xs font-semibold ${total === want ? 'text-emerald-700' : 'text-slate-600'}`}>
            {t('Chosen', 'የተመረጠ')}: {money(total / 100)} / {money(want / 100)}
            {total !== want && picked.size > 0 && <span className="text-amber-700"> · {t('difference', 'ልዩነት')} {money((want - total) / 100)}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button onClick={() => onMatch([...picked])} disabled={total !== want || picked.size === 0} className="btn btn-primary text-xs disabled:opacity-50">
              {t('Match', 'አስታርቅ')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RecordDialog({
  line, units, onClose, onSave,
}: {
  line: StatementLine;
  units: { id: string; name_en: string; name_am: string }[];
  onClose: () => void;
  onSave: (input: { category: string; party: string; description: string; unit_id: string }) => void;
}) {
  const { t, locale } = useLang();
  const income = line.amount > 0;
  const categories = income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const guess = /charge|fee|commission|service|ክፍያ/i.test(line.description) ? (income ? 'Bank Interest' : 'Bank Charges') : /interest|ወለድ/i.test(line.description) ? 'Bank Interest' : categories[0][0];
  const [category, setCategory] = useState(categories.some(([c]) => c === guess) ? guess : categories[0][0]);
  const [party, setParty] = useState('');
  const [description, setDescription] = useState(line.description);
  const [unit, setUnit] = useState('');
  return (
    <Modal isOpen onClose={onClose} title={income ? t('Record as new income', 'እንደ አዲስ ገቢ መዝግብ') : t('Record as new expense', 'እንደ አዲስ ወጪ መዝግብ')} subtitle={`${formatETB(Math.abs(line.amount))} · ${line.date}`}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">
          {t('For money the books do not have yet — bank charges, interest, a deposit made straight to the bank.', 'መዝገቡ ገና የሌለው ገንዘብ — የባንክ ክፍያ፣ ወለድ፣ በቀጥታ ባንክ የገባ ገንዘብ።')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Category', 'ዓይነት')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input text-sm">
              {categories.map(([en, am]) => <option key={en} value={en}>{locale === 'am' ? am : en}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">{income ? t('Received from', 'ከማን') : t('Paid to', 'ለማን')}</label>
            <input value={party} onChange={(e) => setParty(e.target.value)} className="form-input text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Department (optional)', 'ክፍል (ካለ)')}</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="form-input text-sm">
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Description', 'መግለጫ')}</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="form-input text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={() => onSave({ category, party, description, unit_id: unit })} className="btn btn-primary text-xs">{t('Record and match', 'መዝግብና አስታርቅ')}</button>
        </div>
      </div>
    </Modal>
  );
}

function IgnoreDialog({ line, onClose, onSave }: { line: StatementLine; onClose: () => void; onSave: (note: string) => void }) {
  const { t } = useLang();
  const [note, setNote] = useState('');
  return (
    <Modal isOpen onClose={onClose} title={t('Set this line aside', 'ይህን መስመር ተው')} subtitle={`${line.description || ''} · ${money(line.amount)}`}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-slate-500 flex gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {t('Only for lines that are not the Sunday school’s money movement — e.g. a mistaken entry the bank reversed. The reason is kept.', 'የሰንበት ት/ቤቱ የገንዘብ እንቅስቃሴ ላልሆኑ መስመሮች ብቻ — ለምሳሌ ባንኩ የመለሰው የተሳሳተ ግብይት። ምክንያቱ ይቀመጣል።')}
        </p>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Why?', 'ለምን?')} className="form-input text-sm" />
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={() => onSave(note)} disabled={note.trim().length < 3} className="btn btn-primary text-xs disabled:opacity-50">{t('Set aside', 'ተው')}</button>
        </div>
      </div>
    </Modal>
  );
}
