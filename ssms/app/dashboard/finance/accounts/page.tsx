'use client';

// Bank accounts, the cash box and mobile money: balances from the books, the
// newest statement of each, and money moved between them (transfers).

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, ArrowRightLeft, Building2, Landmark, Pencil, Plus, Smartphone, Trash2, Wallet } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { refreshFinance } from '@/lib/finance/client';
import { formatETB } from '@/lib/finance/types';
import { ACCOUNT_KINDS, accountKindLabel, type AccountKind, type BankAccount, type BankingData } from '@/lib/finance/banking';
import { demoBanking } from '@/lib/finance/banking-demo';
import type { LoadMode } from '@/lib/admin/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { deleteTransfer, loadBanking, recordTransfer, saveAccount } from '../banking/actions';

const EMPTY: BankingData = { accounts: [], transfers: [], unassigned: { count: 0, income: 0, expense: 0 } };
const KIND_ICON: Record<AccountKind, React.ElementType> = { BANK: Landmark, CASH: Wallet, MOBILE: Smartphone };

type AccountForm = {
  id: string; name: string; kind: AccountKind; bank_name: string; account_number: string; branch: string;
  opening_balance: string; opening_date: string; is_active: boolean; notes: string;
};
const NEW_ACCOUNT: AccountForm = {
  id: '', name: '', kind: 'BANK', bank_name: '', account_number: '', branch: '', opening_balance: '0', opening_date: todayIso(), is_active: true, notes: '',
};

export default function AccountsPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('FINANCE_APPROVE');
  const canRecord = can('FINANCE_CREATE');

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<BankingData>(EMPTY);
  const [showInactive, setShowInactive] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [account, setAccount] = useState<AccountForm | null>(null);
  const [transfer, setTransfer] = useState<{ from_id: string; to_id: string; amount: string; date: string; reference: string; notes: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadBanking>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'demo') setData(demoBanking());
    else setError(res.error);
    setMode(res.mode);
  }, []);

  const reload = useCallback(async () => apply(await loadBanking()), [apply]);

  useEffect(() => {
    loadBanking().then(apply);
  }, [apply]);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const active = data.accounts.filter((a) => a.is_active);
  const shown = showInactive ? data.accounts : active;
  const total = active.reduce((s, a) => s + a.balance, 0);

  const openEdit = (a: BankAccount) =>
    setAccount({
      id: a.id, name: a.name, kind: a.kind, bank_name: a.bank_name, account_number: a.account_number, branch: a.branch,
      opening_balance: String(a.opening_balance), opening_date: a.opening_date, is_active: a.is_active, notes: a.notes,
    });

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setBusy(true);
    setFormError('');
    const res = await saveAccount({ ...account, opening_balance: Number(account.opening_balance || 0) });
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setAccount(null);
    say('success', t('Account saved', 'ሂሳቡ ተቀምጧል'));
    await Promise.all([reload(), refreshFinance()]);
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transfer) return;
    setBusy(true);
    setFormError('');
    const res = await recordTransfer({ ...transfer, amount: Number(transfer.amount) });
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setTransfer(null);
    say('success', t('Transfer recorded', 'ዝውውሩ ተመዝግቧል'));
    await reload();
  };

  const removeTransfer = async (id: string) => {
    if (!window.confirm(t('Remove this transfer?', 'ይህ ዝውውር ይሰረዝ?'))) return;
    const res = await deleteTransfer(id);
    if (!res.ok) return say('error', res.error);
    say('success', t('Transfer removed', 'ዝውውሩ ተሰርዟል'));
    await reload();
  };

  const setA = (key: keyof AccountForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setAccount((f) => (f ? { ...f, [key]: e.target.value } : f));
  const setT = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setTransfer((f) => (f ? { ...f, [key]: e.target.value } : f));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Bank Accounts', 'የባንክ ሂሳቦች')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('Every account the Sunday school keeps money in — balances come from the income and expense records', 'ሰንበት ት/ቤቱ ገንዘብ የሚያስቀምጥባቸው ሂሳቦች — ቀሪ ሂሳቡ ከገቢና ወጪ መዝገብ ይሰላል')}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {canRecord && active.length >= 2 && (
            <button
              onClick={() => {
                setFormError('');
                setTransfer({ from_id: active[0].id, to_id: active[1].id, amount: '', date: todayIso(), reference: '', notes: '' });
              }}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
            >
              <ArrowRightLeft size={14} /> {t('Move money', 'ገንዘብ አዛውር')}
            </button>
          )}
          {canManage && (
            <button
              onClick={() => {
                setFormError('');
                setAccount({ ...NEW_ACCOUNT, opening_date: todayIso() });
              }}
              disabled={mode !== 'live'}
              className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} /> {t('Add account', 'ሂሳብ ጨምር')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="text-2xl font-bold text-slate-900">{formatETB(total)}</div>
            <div className="text-xs text-slate-500 mt-1">{t('Total in all active accounts (books)', 'በሁሉም ንቁ ሂሳቦች ጠቅላላ (በመዝገብ)')}</div>
          </div>
          <div className="card p-5">
            <div className="text-2xl font-bold text-slate-900">{active.length}</div>
            <div className="text-xs text-slate-500 mt-1">{t('Active accounts', 'ንቁ ሂሳቦች')}</div>
          </div>
          <div className={`card p-5 ${data.unassigned.count ? 'border-amber-200 bg-amber-50/50' : ''}`}>
            <div className={`text-2xl font-bold ${data.unassigned.count ? 'text-amber-700' : 'text-slate-900'}`}>{data.unassigned.count}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Records without an account — reconciling a statement sorts them out', 'ሂሳብ ያልተሰጣቸው መዝገቦች — መግለጫ ሲታረቅ ይስተካከላሉ')}
            </div>
          </div>
        </div>
      )}

      {mode === 'live' && data.accounts.length === 0 && (
        <div className="card p-8 text-center">
          <Building2 className="mx-auto text-slate-300" size={40} />
          <h2 className="mt-3 font-bold text-slate-800">{t('No accounts yet', 'እስካሁን ሂሳብ የለም')}</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            {t(
              'Add each bank account (e.g. CBE main account), the cash box and Telebirr. Give each one its balance on the day you start — then income and expenses can be recorded against it and bank statements reconciled.',
              'እያንዳንዱን የባንክ ሂሳብ (ለምሳሌ፡ ንግድ ባንክ ዋና ሂሳብ)፣ ካዝናውንና ቴሌብርን ይጨምሩ። በሚጀምሩበት ቀን ያለውን ቀሪ ሂሳብ ያስገቡ — ከዚያ ገቢና ወጪ በሂሳቡ ይመዘገባል፣ የባንክ መግለጫም ይታረቃል።'
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((a) => {
          const Icon = KIND_ICON[a.kind];
          const last = a.last_statement;
          return (
            <div key={a.id} className={`card p-5 flex flex-col ${a.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{a.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {[accountKindLabel(a.kind, locale), a.bank_name, a.account_number].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title={t('Edit', 'አርትዕ')}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <div className={`mt-4 text-2xl font-bold font-mono ${a.balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatETB(a.balance)}</div>
              <div className="text-[11px] text-slate-500">
                {t('Book balance', 'በመዝገብ ያለ ቀሪ')} · {t('opening', 'መነሻ')} {formatETB(a.opening_balance)} ({formatEthiopianDate(a.opening_date, locale)})
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1 flex-1">
                {last ? (
                  <div className="text-slate-600">
                    {t('Last statement', 'የመጨረሻ መግለጫ')}: {last.period_end ? formatEthiopianDate(last.period_end, locale) : '—'}
                    {last.closing_balance != null && <> · {t('bank', 'ባንክ')} {formatETB(last.closing_balance)}</>}
                    {last.status === 'RECONCILED' && <span className="ml-1 badge badge-success text-[10px]">{t('Reconciled', 'ታርቋል')}</span>}
                  </div>
                ) : (
                  a.kind !== 'CASH' && <div className="text-slate-400">{t('No statement imported yet', 'ገና መግለጫ አልገባም')}</div>
                )}
                {a.open_lines > 0 && <div className="text-amber-700 font-medium">{a.open_lines} {t('statement lines to match', 'የሚታረቁ የመግለጫ መስመሮች')}</div>}
              </div>
              {a.kind !== 'CASH' && a.is_active && (
                <Link href={`/dashboard/finance/reconcile?account=${a.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
                  {t('Reconcile with the bank', 'ከባንክ ጋር አስታርቅ')} <ArrowRight size={13} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {data.accounts.some((a) => !a.is_active) && (
        <button onClick={() => setShowInactive((v) => !v)} className="text-xs text-slate-500 hover:text-slate-800">
          {showInactive ? t('Hide closed accounts', 'የተዘጉ ሂሳቦችን ደብቅ') : t('Show closed accounts', 'የተዘጉ ሂሳቦችን አሳይ')}
        </button>
      )}

      {data.transfers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm">{t('Money moved between accounts', 'በሂሳቦች መካከል የተዛወረ ገንዘብ')}</div>
          <div className="table-container rounded-none border-0">
            <table>
              <thead>
                <tr>
                  <th>{t('Date', 'ቀን')}</th>
                  <th>{t('From → To', 'ከ → ወደ')}</th>
                  <th>{t('Reference', 'ማጣቀሻ')}</th>
                  <th className="text-right">{t('Amount', 'መጠን')}</th>
                  {canRecord && <th />}
                </tr>
              </thead>
              <tbody>
                {data.transfers.map((x) => (
                  <tr key={x.id}>
                    <td className="text-xs">{formatEthiopianDate(x.date, locale)}</td>
                    <td className="text-xs text-slate-700">
                      {x.from} → {x.to}
                      {x.notes && <div className="text-[11px] text-slate-400">{x.notes}</div>}
                    </td>
                    <td className="text-xs font-mono text-slate-500">{x.reference || '—'}</td>
                    <td className="text-right font-mono font-semibold">{formatETB(x.amount)}</td>
                    {canRecord && (
                      <td className="text-right">
                        <button onClick={() => removeTransfer(x.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title={t('Remove', 'ሰርዝ')}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / edit account */}
      <Modal
        isOpen={Boolean(account)}
        onClose={() => setAccount(null)}
        title={account?.id ? t('Edit account', 'ሂሳብ አርትዕ') : t('Add account', 'ሂሳብ ጨምር')}
        subtitle={t('The opening balance is the money in it on the opening date', 'መነሻ ቀሪው በመነሻው ቀን በሂሳቡ የነበረው ገንዘብ ነው')}
      >
        {account && (
          <form onSubmit={submitAccount} className="space-y-4">
            {formError && <ErrorBox text={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Name', 'ስም') + ' *'}>
                <input required value={account.name} onChange={setA('name')} placeholder={t('e.g. CBE main account', 'ለምሳሌ፡ ንግድ ባንክ ዋና ሂሳብ')} className="form-input text-sm" />
              </Field>
              <Field label={t('Kind', 'ዓይነት')}>
                <select value={account.kind} onChange={setA('kind')} className="form-input text-sm">
                  {ACCOUNT_KINDS.map(([code, en, am]) => (
                    <option key={code} value={code}>{locale === 'am' ? am : en}</option>
                  ))}
                </select>
              </Field>
              {account.kind !== 'CASH' && (
                <>
                  <Field label={account.kind === 'MOBILE' ? t('Provider', 'አቅራቢ') : t('Bank', 'ባንክ')}>
                    <input value={account.bank_name} onChange={setA('bank_name')} placeholder={account.kind === 'MOBILE' ? 'Telebirr' : 'Commercial Bank of Ethiopia'} className="form-input text-sm" />
                  </Field>
                  <Field label={account.kind === 'MOBILE' ? t('Phone / account no.', 'ስልክ / ሂሳብ ቁጥር') : t('Account number', 'የሂሳብ ቁጥር')}>
                    <input value={account.account_number} onChange={setA('account_number')} className="form-input text-sm font-mono" />
                  </Field>
                  {account.kind === 'BANK' && (
                    <Field label={t('Branch', 'ቅርንጫፍ')}>
                      <input value={account.branch} onChange={setA('branch')} className="form-input text-sm" />
                    </Field>
                  )}
                </>
              )}
              <Field label={t('Opening balance (ETB)', 'መነሻ ቀሪ (ብር)')}>
                <input type="number" step="0.01" value={account.opening_balance} onChange={setA('opening_balance')} className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Opening date', 'መነሻ ቀን')}>
                <input type="date" value={account.opening_date} onChange={setA('opening_date')} className="form-input text-sm" />
              </Field>
            </div>
            <Field label={t('Notes', 'ማስታወሻ')}>
              <textarea rows={2} value={account.notes} onChange={setA('notes')} className="form-input text-sm" />
            </Field>
            {account.id && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={account.is_active} onChange={(e) => setAccount({ ...account, is_active: e.target.checked })} />
                {t('Active (uncheck when the account is closed — its records stay)', 'ንቁ (ሂሳቡ ሲዘጋ ያንሡ — መዝገቦቹ ይቀመጣሉ)')}
              </label>
            )}
            <Buttons busy={busy} onCancel={() => setAccount(null)} t={t} />
          </form>
        )}
      </Modal>

      {/* Transfer */}
      <Modal isOpen={Boolean(transfer)} onClose={() => setTransfer(null)} title={t('Move money between accounts', 'በሂሳቦች መካከል ገንዘብ አዛውር')} subtitle={t('e.g. cash deposited at the bank — not income, not an expense', 'ለምሳሌ፡ ጥሬ ገንዘብ ባንክ ሲገባ — ገቢም ወጪም አይደለም')}>
        {transfer && (
          <form onSubmit={submitTransfer} className="space-y-4">
            {formError && <ErrorBox text={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('From', 'ከ') + ' *'}>
                <select value={transfer.from_id} onChange={setT('from_id')} className="form-input text-sm">
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label={t('To', 'ወደ') + ' *'}>
                <select value={transfer.to_id} onChange={setT('to_id')} className="form-input text-sm">
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label={t('Amount (ETB)', 'መጠን (ብር)') + ' *'}>
                <input type="number" required min="0.01" step="0.01" value={transfer.amount} onChange={setT('amount')} className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Date', 'ቀን') + ' *'}>
                <input type="date" required max={todayIso()} value={transfer.date} onChange={setT('date')} className="form-input text-sm" />
              </Field>
              <Field label={t('Deposit slip / reference', 'የገቢ ቅጽ / ማጣቀሻ')}>
                <input value={transfer.reference} onChange={setT('reference')} className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Notes', 'ማስታወሻ')}>
                <input value={transfer.notes} onChange={setT('notes')} className="form-input text-sm" />
              </Field>
            </div>
            <Buttons busy={busy} onCancel={() => setTransfer(null)} t={t} />
          </form>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
      <AlertCircle size={16} /> {text}
    </div>
  );
}

function Buttons({ busy, onCancel, t }: { busy: boolean; onCancel: () => void; t: (en: string, am: string) => string }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
      <button type="button" onClick={onCancel} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
      <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}</button>
    </div>
  );
}
