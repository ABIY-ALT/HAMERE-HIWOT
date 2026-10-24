'use client';

// Chart of accounts: the account numbers, their type and normal balance, the
// groups they sit in; the posting rules (which account each income / expense
// category goes to); and the ledger settings (fiscal year, closed period,
// approval). Server work: ../actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Lock, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { ExportButton } from '@/components/ui/ExportButton';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { ErrorBox, Field, GlNav } from '@/components/finance/GlShared';
import { exportTable } from '@/lib/export/table';
import type { LoadMode } from '@/lib/admin/types';
import { categoryLabel } from '@/lib/finance/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  DEFAULT_KEYS,
  FISCAL_PRESETS,
  GL_TYPES,
  SUB_TYPES,
  accountName,
  chartOrder,
  descendants,
  fmtAmount,
  subTypeLabel,
  typeLabel,
  type ChartData,
  type GlAccount,
  type GlType,
} from '@/lib/finance/gl';
import { deleteGlAccount, loadChart, repostEntries, saveGlAccount, saveGlSettings, saveMapping } from '../actions';

const EMPTY: ChartData = {
  accounts: [], bankNames: {}, mappings: [], settings: { fiscal_year_start: '07-08', lock_date: null, require_approval: false },
  categories: { income: [], expense: [] }, balances: {}, used: [], fyStart: todayIso(),
};

type Tab = 'accounts' | 'rules' | 'settings';
type AccountForm = {
  id: string; code: string; name_en: string; name_am: string; type: GlType; sub_type: string;
  normal_balance: 'DEBIT' | 'CREDIT'; parent_id: string; is_header: boolean; description: string; is_active: boolean;
};

const TYPE_TONE: Record<GlType, string> = {
  ASSET: 'bg-sky-50 text-sky-700',
  LIABILITY: 'bg-amber-50 text-amber-700',
  EQUITY: 'bg-violet-50 text-violet-700',
  INCOME: 'bg-emerald-50 text-emerald-700',
  EXPENSE: 'bg-rose-50 text-rose-700',
};

/** Next free number after the accounts already in a group */
function nextCode(accounts: GlAccount[], parentId: string, type: GlType): string {
  const used = new Set(accounts.map((a) => a.code));
  const siblings = accounts.filter((a) => (a.parent_id ?? '') === parentId && /^\d+$/.test(a.code)).map((a) => Number(a.code));
  const parent = accounts.find((a) => a.id === parentId);
  const typeIndex = GL_TYPES.findIndex((t) => t.code === type) + 1;
  let n = siblings.length ? Math.max(...siblings) + 10 : parent && /^\d+$/.test(parent.code) ? Number(parent.code) + 10 : typeIndex * 1000;
  while (used.has(String(n))) n += 1;
  return String(n);
}

export default function ChartOfAccountsPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('FINANCE_APPROVE');

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<ChartData>(EMPTY);
  const [tab, setTab] = useState<Tab>('accounts');
  const [typeFilter, setTypeFilter] = useState<GlType | ''>('');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<AccountForm | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadChart>>) => {
    if (res.mode === 'live') setData(res.data);
    else if (res.mode === 'error') setError(res.error);
    setMode(res.mode);
  }, []);
  const reload = useCallback(async () => apply(await loadChart()), [apply]);
  useEffect(() => {
    loadChart().then(apply);
  }, [apply]);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const used = useMemo(() => new Set(data.used), [data.used]);
  const tree = useMemo(() => chartOrder(data.accounts), [data.accounts]);
  const shown = tree.filter((a) => {
    if (!showInactive && !a.is_active) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return a.code.toLowerCase().includes(s) || a.name_en.toLowerCase().includes(s) || a.name_am.includes(q.trim());
    }
    return true;
  });

  const openNew = (parent?: GlAccount) => {
    const type = parent?.type ?? typeFilter ?? 'EXPENSE';
    const ty = (type || 'EXPENSE') as GlType;
    setFormError('');
    setForm({
      id: '',
      code: nextCode(data.accounts, parent?.id ?? '', ty),
      name_en: '',
      name_am: '',
      type: ty,
      sub_type: parent?.sub_type ?? SUB_TYPES.find((s) => s.type === ty)!.code,
      normal_balance: GL_TYPES.find((g) => g.code === ty)!.normal,
      parent_id: parent?.id ?? '',
      is_header: false,
      description: '',
      is_active: true,
    });
  };

  const openEdit = (a: GlAccount) => {
    setFormError('');
    setForm({
      id: a.id, code: a.code, name_en: a.name_en, name_am: a.name_am, type: a.type, sub_type: a.sub_type,
      normal_balance: a.normal_balance, parent_id: a.parent_id ?? '', is_header: a.is_header, description: a.description, is_active: a.is_active,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setFormError('');
    const res = await saveGlAccount(form);
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setForm(null);
    say('success', t('Account saved', 'ሂሳቡ ተቀምጧል'));
    await reload();
  };

  const remove = async (a: GlAccount) => {
    if (!window.confirm(t(`Delete account ${a.code} ${a.name_en}?`, `ሂሳብ ${a.code} ${accountName(a, 'am')} ይሰረዝ?`))) return;
    const res = await deleteGlAccount(a.id);
    if (!res.ok) return say('error', res.error);
    say('success', t('Account deleted', 'ሂሳቡ ተሰርዟል'));
    await reload();
  };

  const exportChart = async (format: 'xlsx' | 'csv') => {
    await exportTable(
      'chart-of-accounts',
      ['Account no.', 'Name', 'የአማርኛ ስም', 'Type', 'Classification', 'Normal balance', 'Group', 'Parent', 'Active', 'Balance'],
      tree.map((a) => [
        a.code,
        `${'  '.repeat(a.depth)}${a.name_en}`,
        a.name_am,
        typeLabel(a.type, 'en'),
        subTypeLabel(a.sub_type, 'en'),
        a.normal_balance === 'DEBIT' ? 'Debit' : 'Credit',
        a.is_header ? 'Yes' : '',
        data.accounts.find((p) => p.id === a.parent_id)?.code ?? '',
        a.is_active ? 'Yes' : 'No',
        data.balances[a.id] ?? 0,
      ]),
      format,
      { sheet: 'Chart of accounts', widths: [12, 40, 32, 18, 26, 14, 8, 10, 8, 16] }
    );
  };

  // Account form helpers
  const groups = form ? data.accounts.filter((a) => a.is_header && a.type === form.type && a.id !== form.id && !(form.id && descendants(data.accounts, form.id).has(a.id))) : [];
  const setF = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const changeType = (type: GlType) =>
    setForm((f) =>
      f
        ? {
            ...f,
            type,
            sub_type: SUB_TYPES.find((s) => s.type === type)!.code,
            normal_balance: GL_TYPES.find((g) => g.code === type)!.normal,
            parent_id: '',
            code: f.id ? f.code : nextCode(data.accounts, '', type),
          }
        : f
    );
  const changeParent = (parentId: string) =>
    setForm((f) => {
      if (!f) return f;
      const parent = data.accounts.find((a) => a.id === parentId);
      return { ...f, parent_id: parentId, sub_type: parent?.sub_type ?? f.sub_type, code: f.id ? f.code : nextCode(data.accounts, parentId, f.type) };
    });
  const lockedType = Boolean(form?.id && used.has(form.id));
  const normalUsual = form ? GL_TYPES.find((g) => g.code === form.type)!.normal : 'DEBIT';

  return (
    <div className="space-y-5">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Accounting', 'የሂሳብ አያያዝ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Double-entry books: every income, expense, transfer and opening balance posts itself to these accounts',
              'ድርብ ምዝገባ፦ እያንዳንዱ ገቢ፣ ወጪ፣ ዝውውርና መነሻ ቀሪ በራሱ በእነዚህ ሂሳቦች ይመዘገባል'
            )}
          </p>
        </div>
        {canManage && tab === 'accounts' && (
          <button onClick={() => openNew()} disabled={mode !== 'live'} className="btn btn-primary text-xs inline-flex items-center gap-1.5 self-start disabled:opacity-50">
            <Plus size={14} /> {t('Add account', 'ሂሳብ ጨምር')}
          </button>
        )}
      </div>
      <GlNav />
      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && (
        <>
          <div className="flex gap-1">
            {(
              [
                ['accounts', 'Accounts', 'ሂሳቦች'],
                ['rules', 'Posting rules', 'የምዝገባ ደንቦች'],
                ['settings', 'Settings', 'ቅንብሮች'],
              ] as [Tab, string, string][]
            ).map(([k, en, am]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {t(en, am)}
              </button>
            ))}
          </div>

          {tab === 'accounts' && (
            <div className="card overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search number or name', 'በቁጥር ወይም በስም ፈልግ')} className="form-input text-sm pl-8" />
                </div>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as GlType | '')} className="form-input text-sm w-auto">
                  <option value="">{t('All types', 'ሁሉም ዓይነቶች')}</option>
                  {GL_TYPES.map((g) => (
                    <option key={g.code} value={g.code}>{locale === 'am' ? g.label[1] : g.label[0]}</option>
                  ))}
                </select>
                <label className="text-xs text-slate-600 inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t('Show inactive', 'ንቁ ያልሆኑትን አሳይ')}
                </label>
                <ExportButton onExport={exportChart} />
              </div>
              <div className="table-container rounded-none border-0">
                <table>
                  <thead>
                    <tr>
                      <th className="w-24">{t('No.', 'ቁጥር')}</th>
                      <th>{t('Account', 'ሂሳብ')}</th>
                      <th className="hidden md:table-cell">{t('Type · classification', 'ዓይነት · ምድብ')}</th>
                      <th className="hidden sm:table-cell">{t('Normal', 'መደበኛ')}</th>
                      <th className="text-right">{t('Balance', 'ቀሪ')}</th>
                      {canManage && <th className="w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a) => (
                      <tr key={a.id} className={`${a.is_header ? 'bg-slate-50/70' : ''} ${a.is_active ? '' : 'opacity-50'}`}>
                        <td className={`font-mono text-xs ${a.is_header ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{a.code}</td>
                        <td>
                          <div style={{ paddingLeft: `${a.depth * 16}px` }} className={a.is_header ? 'font-bold text-slate-900 text-sm' : 'text-sm text-slate-800'}>
                            {accountName(a, locale)}
                            {a.bank_account_id && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 align-middle">
                                <Landmark size={10} /> {data.bankNames[a.bank_account_id] ?? t('Bank', 'ባንክ')}
                              </span>
                            )}
                            {!a.is_active && <span className="ml-1.5 text-[10px] text-slate-500">({t('inactive', 'ንቁ ያልሆነ')})</span>}
                          </div>
                          {locale !== 'am' && a.name_am && <div style={{ paddingLeft: `${a.depth * 16}px` }} className="text-[11px] text-slate-400">{a.name_am}</div>}
                        </td>
                        <td className="hidden md:table-cell">
                          <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${TYPE_TONE[a.type]}`}>{typeLabel(a.type, locale)}</span>
                          <span className="ml-1.5 text-[11px] text-slate-500">{subTypeLabel(a.sub_type, locale)}</span>
                        </td>
                        <td className="hidden sm:table-cell text-xs text-slate-600">
                          {a.normal_balance === 'DEBIT' ? t('Debit', 'ዴቢት') : t('Credit', 'ክሬዲት')}
                          {a.normal_balance !== GL_TYPES.find((g) => g.code === a.type)!.normal && (
                            <span className="ml-1 text-[10px] text-amber-700">({t('contra', 'ተቃራኒ')})</span>
                          )}
                        </td>
                        <td className={`text-right font-mono text-sm ${a.is_header ? 'font-bold' : ''} ${(data.balances[a.id] ?? 0) < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                          {fmtAmount(data.balances[a.id] ?? 0, true) || <span className="text-slate-300">—</span>}
                        </td>
                        {canManage && (
                          <td className="text-right whitespace-nowrap">
                            {a.is_header && (
                              <button onClick={() => openNew(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50" title={t('Add a sub-account', 'ንዑስ ሂሳብ ጨምር')}>
                                <Plus size={14} />
                              </button>
                            )}
                            <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title={t('Edit', 'አርትዕ')}>
                              <Pencil size={14} />
                            </button>
                            {!used.has(a.id) && !a.bank_account_id && (
                              <button onClick={() => remove(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title={t('Delete', 'ሰርዝ')}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center text-sm text-slate-400 py-8">{t('No accounts match', 'የሚዛመድ ሂሳብ የለም')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t border-slate-100 text-[11px] text-slate-500">
                {t(
                  `Balances: assets, liabilities and net assets to date; income and expenses for this fiscal year (from ${data.fyStart}). Groups show the total of their accounts.`,
                  `ቀሪ፦ ሀብት፣ ዕዳና የተጣራ ሀብት እስከ ዛሬ፤ ገቢና ወጪ የዘንድሮ በጀት ዓመት (ከ${formatEthiopianDate(data.fyStart, 'am')})። ቡድኖች የሂሳቦቻቸውን ድምር ያሳያሉ።`
                )}
              </div>
            </div>
          )}

          {tab === 'rules' && <RulesTab data={data} canManage={canManage} onSaved={reload} say={say} />}
          {tab === 'settings' && <SettingsTab data={data} canManage={canManage} onSaved={reload} say={say} />}
        </>
      )}

      <Modal
        isOpen={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? t('Edit account', 'ሂሳብ አርትዕ') : t('New account', 'አዲስ ሂሳብ')}
        subtitle={t('The account number orders the chart; groups hold sub-accounts and take no entries', 'የሂሳብ ቁጥሩ ቅደም ተከተሉን ይወስናል፤ ቡድኖች ንዑስ ሂሳቦችን ይይዛሉ፣ ምዝገባ አይቀበሉም')}
        maxWidth="lg"
      >
        {form && (
          <form onSubmit={submit} className="space-y-4">
            {formError && <ErrorBox text={formError} />}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t('Account number', 'የሂሳብ ቁጥር') + ' *'}>
                <input required value={form.code} onChange={(e) => setF('code', e.target.value)} className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Name (English)', 'ስም (እንግሊዝኛ)') + ' *'} className="sm:col-span-2">
                <input required value={form.name_en} onChange={(e) => setF('name_en', e.target.value)} className="form-input text-sm" />
              </Field>
              <Field label={t('Name (Amharic)', 'ስም (አማርኛ)')} className="sm:col-span-3">
                <input value={form.name_am} onChange={(e) => setF('name_am', e.target.value)} className="form-input text-sm" />
              </Field>
              <Field label={t('Account type', 'የሂሳብ ዓይነት')}>
                <select value={form.type} disabled={lockedType} onChange={(e) => changeType(e.target.value as GlType)} className="form-input text-sm disabled:bg-slate-50">
                  {GL_TYPES.map((g) => (
                    <option key={g.code} value={g.code}>{locale === 'am' ? g.label[1] : g.label[0]}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('Classification (for the statements)', 'ምድብ (ለመግለጫዎቹ)')}>
                <select value={form.sub_type} onChange={(e) => setF('sub_type', e.target.value)} className="form-input text-sm">
                  {SUB_TYPES.filter((s) => s.type === form.type).map((s) => (
                    <option key={s.code} value={s.code}>{locale === 'am' ? s.label[1] : s.label[0]}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('Normal balance', 'መደበኛ ቀሪ')}>
                <select value={form.normal_balance} onChange={(e) => setF('normal_balance', e.target.value as 'DEBIT' | 'CREDIT')} className="form-input text-sm">
                  <option value="DEBIT">{t('Debit', 'ዴቢት')}{normalUsual === 'DEBIT' ? ` (${t('usual', 'የተለመደ')})` : ` (${t('contra account', 'ተቃራኒ ሂሳብ')})`}</option>
                  <option value="CREDIT">{t('Credit', 'ክሬዲት')}{normalUsual === 'CREDIT' ? ` (${t('usual', 'የተለመደ')})` : ` (${t('contra account', 'ተቃራኒ ሂሳብ')})`}</option>
                </select>
              </Field>
              <Field label={t('Group (parent account)', 'ቡድን (ዋና ሂሳብ)')} className="sm:col-span-2">
                <select value={form.parent_id} onChange={(e) => changeParent(e.target.value)} className="form-input text-sm">
                  <option value="">— {t('Top level', 'ከፍተኛ ደረጃ')} —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.code} · {accountName(g, locale)}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
                <input type="checkbox" checked={form.is_header} disabled={lockedType && !form.is_header} onChange={(e) => setF('is_header', e.target.checked)} />
                {t('Group heading (no entries)', 'የቡድን ርዕስ (ምዝገባ የለውም)')}
              </label>
            </div>
            {lockedType && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <Lock size={11} /> {t('This account has entries, so its type is fixed.', 'ይህ ሂሳብ ምዝገባ ስላለው ዓይነቱ አይቀየርም።')}
              </p>
            )}
            <Field label={t('Description / when to use it', 'መግለጫ / መቼ እንደሚጠቀሙበት')}>
              <textarea rows={2} value={form.description} onChange={(e) => setF('description', e.target.value)} className="form-input text-sm" />
            </Field>
            {form.id && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setF('is_active', e.target.checked)} />
                {t('Active (inactive accounts keep their history but take no new manual entries)', 'ንቁ (ንቁ ያልሆነ ሂሳብ ታሪኩን ይይዛል፣ አዲስ የእጅ ምዝገባ አይቀበልም)')}
              </label>
            )}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setForm(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ── Posting rules ────────────────────────────────────────────────────────────

function RulesTab({
  data,
  canManage,
  onSaved,
  say,
}: {
  data: ChartData;
  canManage: boolean;
  onSaved: () => Promise<void>;
  say: (kind: 'success' | 'error', text: string) => void;
}) {
  const { t, locale } = useLang();
  const [repostFrom, setRepostFrom] = useState(data.fyStart);
  const [busy, setBusy] = useState(false);
  const usable = chartOrder(data.accounts).filter((a) => !a.is_header && a.is_active);
  const ruleOf = (source: string, key: string) => data.mappings.find((m) => m.source === source && m.key === key)?.account_id ?? '';

  const save = async (source: 'DEFAULT' | 'INCOME_CATEGORY' | 'EXPENSE_CATEGORY', key: string, account_id: string) => {
    const res = await saveMapping({ source, key, account_id });
    if (!res.ok) return say('error', res.error);
    say('success', t('Rule saved — it applies to new records', 'ደንቡ ተቀምጧል — ለአዲስ መዝገቦች ይሠራል'));
    await onSaved();
  };

  const repost = async () => {
    if (!window.confirm(t(
      'Re-write the automatic entries from this date with the current rules? Their numbers stay the same; manual entries are not touched.',
      'ከዚህ ቀን ጀምሮ ያሉት ራስ-ሰር ምዝገባዎች በአሁኑ ደንቦች እንደገና ይጻፉ? ቁጥራቸው አይቀየርም፤ የእጅ ምዝገባዎች አይነኩም።'
    ))) return;
    setBusy(true);
    const res = await repostEntries(repostFrom);
    setBusy(false);
    if (!res.ok) return say('error', res.error);
    say('success', t(`${res.count} records re-posted`, `${res.count} መዝገቦች እንደገና ተመዝግበዋል`));
    await onSaved();
  };

  const select = (value: string, onChange: (v: string) => void, filter: (a: GlAccount) => boolean, allowDefault: boolean) => (
    <select value={value} disabled={!canManage} onChange={(e) => onChange(e.target.value)} className="form-input text-sm disabled:bg-slate-50">
      {allowDefault && <option value="">— {t('Default account', 'መደበኛው ሂሳብ')} —</option>}
      {usable.filter(filter).map((a) => (
        <option key={a.id} value={a.id}>{a.code} · {accountName(a, locale)}</option>
      ))}
    </select>
  );

  const notCash = (a: GlAccount) => a.sub_type !== 'CASH_BANK';
  const defaultFilter: Record<string, (a: GlAccount) => boolean> = {
    CASH: (a) => a.sub_type === 'CASH_BANK',
    INCOME: (a) => a.type === 'INCOME',
    EXPENSE: (a) => a.type === 'EXPENSE',
    OPENING_BALANCE: (a) => a.type === 'EQUITY',
  };

  return (
    <div className="space-y-5">
      <div className="card p-4 text-xs text-slate-600 leading-relaxed">
        {t(
          'Each income or expense record is posted as two lines: the money account (its bank account / cash box, or the default cash account) and the account its category points to. Bank accounts get their own account automatically. A category can also point to a balance-sheet account — e.g. “Equipment” to Furniture and equipment, to record a purchase as a fixed asset.',
          'እያንዳንዱ የገቢ ወይም የወጪ መዝገብ በሁለት መስመር ይመዘገባል፦ የገንዘብ ሂሳቡ (የባንክ ሂሳቡ / ካዝናው፣ ወይም መደበኛው የጥሬ ገንዘብ ሂሳብ) እና ዓይነቱ የሚያመለክተው ሂሳብ። የባንክ ሂሳቦች የራሳቸውን ሂሳብ በራሳቸው ያገኛሉ። አንድ ዓይነት ወደ ሀብት ሂሳብም ሊያመለክት ይችላል — ለምሳሌ «መሣሪያዎች» ወደ የቢሮ ዕቃዎችና መሣሪያዎች፣ ግዢውን እንደ ቋሚ ንብረት ለመመዝገብ።'
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm">{t('Default accounts', 'መደበኛ ሂሳቦች')}</div>
        <div className="divide-y divide-slate-100">
          {DEFAULT_KEYS.map((d) => (
            <div key={d.key} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
              <div>
                <div className="text-sm font-semibold text-slate-800">{locale === 'am' ? d.label[1] : d.label[0]}</div>
                <div className="text-[11px] text-slate-500">{locale === 'am' ? d.hint[1] : d.hint[0]}</div>
              </div>
              {select(ruleOf('DEFAULT', d.key), (v) => v && save('DEFAULT', d.key, v), defaultFilter[d.key], false)}
            </div>
          ))}
        </div>
      </div>

      {(
        [
          ['INCOME_CATEGORY', data.categories.income, 'Income categories', 'የገቢ ዓይነቶች'],
          ['EXPENSE_CATEGORY', data.categories.expense, 'Expense categories', 'የወጪ ዓይነቶች'],
        ] as const
      ).map(([source, cats, en, am]) => (
        <div key={source} className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm">{t(en, am)}</div>
          <div className="divide-y divide-slate-100">
            {cats.map((c) => (
              <div key={c} className="p-3 px-4 grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                <div className="text-sm text-slate-800">{categoryLabel(c, locale)}</div>
                {select(ruleOf(source, c), (v) => save(source, c, v), notCash, true)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {canManage && (
        <div className="card p-4 space-y-3">
          <div className="font-bold text-slate-800 text-sm flex items-center gap-2"><RefreshCw size={15} /> {t('Apply the rules to earlier records', 'ደንቦቹን ለቀደሙ መዝገቦች ተግብር')}</div>
          <p className="text-xs text-slate-500">
            {t(
              'Changed rules apply to new records. To re-post the records already in the books (e.g. after setting up the chart), choose a start date. Records in a closed period stay as they are.',
              'የተቀየሩ ደንቦች ለአዲስ መዝገቦች ይሠራሉ። በመዝገቡ ያሉትን መዝገቦች እንደገና ለመመዝገብ (ለምሳሌ የሂሳብ መደቡን ካዘጋጁ በኋላ) የመጀመሪያ ቀን ይምረጡ። በተዘጋ ጊዜ ያሉ መዝገቦች አይቀየሩም።'
            )}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('From', 'ከ')}>
              <input type="date" value={repostFrom} onChange={(e) => setRepostFrom(e.target.value)} className="form-input text-sm" />
            </Field>
            <button onClick={repost} disabled={busy} className="btn btn-secondary text-xs disabled:opacity-60">
              {busy ? t('Working…', 'በሂደት ላይ…') : t('Re-post automatic entries', 'ራስ-ሰር ምዝገባዎችን እንደገና መዝግብ')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsTab({
  data,
  canManage,
  onSaved,
  say,
}: {
  data: ChartData;
  canManage: boolean;
  onSaved: () => Promise<void>;
  say: (kind: 'success' | 'error', text: string) => void;
}) {
  const { t, locale } = useLang();
  const [fy, setFy] = useState(data.settings.fiscal_year_start);
  const [lock, setLock] = useState(data.settings.lock_date ?? '');
  const [approval, setApproval] = useState(data.settings.require_approval);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const preset = FISCAL_PRESETS.some((p) => p.value === fy);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock && !window.confirm(t(
      `Close the books up to ${lock}? Nothing dated on or before it can then be added, changed or removed until the date is moved back.`,
      `መዝገቡ እስከ ${formatEthiopianDate(lock, 'am')} ይዘጋ? ከዚያ በኋላ ቀኑ እስኪመለስ በዚያ ቀንና ከዚያ በፊት ያለ ምንም መዝገብ መጨመር፣ መለወጥ ወይም መሰረዝ አይቻልም።`
    ))) return;
    setBusy(true);
    setErr('');
    const res = await saveGlSettings({ fiscal_year_start: fy, lock_date: lock, require_approval: approval });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    say('success', t('Settings saved', 'ቅንብሮቹ ተቀምጠዋል'));
    await onSaved();
  };

  return (
    <form onSubmit={save} className="card p-5 space-y-5 max-w-2xl">
      {err && <ErrorBox text={err} />}
      <Field label={t('Fiscal year starts on', 'የበጀት ዓመቱ የሚጀምረው')}>
        <select
          value={preset ? fy : 'custom'}
          disabled={!canManage}
          onChange={(e) => e.target.value !== 'custom' && setFy(e.target.value)}
          className="form-input text-sm"
        >
          {FISCAL_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{locale === 'am' ? p.label[1] : p.label[0]} — {p.value}</option>
          ))}
          <option value="custom">{t('Another day (MM-DD)', 'ሌላ ቀን (ወወ-ቀቀ)')}</option>
        </select>
        {!preset && (
          <input value={fy} disabled={!canManage} onChange={(e) => setFy(e.target.value)} placeholder="07-08" className="form-input text-sm font-mono mt-2 w-32" />
        )}
        <p className="text-[11px] text-slate-500 mt-1">
          {t('Statements and balances of income and expenses start from this day each year.', 'የገቢና ወጪ መግለጫዎችና ቀሪዎች በየዓመቱ ከዚህ ቀን ይጀምራሉ።')}
        </p>
      </Field>

      <Field label={t('Books closed up to (lock date)', 'መዝገቡ የተዘጋው እስከ (የመዝጊያ ቀን)')}>
        <div className="flex items-center gap-2">
          <input type="date" value={lock} max={todayIso()} disabled={!canManage} onChange={(e) => setLock(e.target.value)} className="form-input text-sm" />
          {lock && canManage && (
            <button type="button" onClick={() => setLock('')} className="text-xs text-slate-500 hover:text-slate-800">{t('Open all', 'ሁሉንም ክፈት')}</button>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          {t(
            'After a period is audited or reported, close it: no income, expense, transfer or journal entry dated on or before this day can be added, changed or removed.',
            'አንድ ጊዜ ኦዲት ከተደረገ ወይም ሪፖርት ከተደረገ በኋላ ይዝጉት፦ በዚህ ቀንና ከዚያ በፊት የተደረገ ገቢ፣ ወጪ፣ ዝውውር ወይም የሂሳብ መዝገብ መጨመር፣ መለወጥ ወይም መሰረዝ አይቻልም።'
          )}
        </p>
      </Field>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" checked={approval} disabled={!canManage} onChange={(e) => setApproval(e.target.checked)} />
        <span>
          {t('Manual journal entries need a second person', 'የእጅ ምዝገባዎች ሁለተኛ ሰው ያስፈልጋቸዋል')}
          <span className="block text-[11px] text-slate-500">
            {t(
              'When on, the person who writes an entry cannot post it — another approver must. When off, approvers post their own entries directly.',
              'ሲበራ፣ ምዝገባውን የጻፈው ሰው ሊመዘግበው አይችልም — ሌላ አጽዳቂ ያስፈልጋል። ሲጠፋ፣ አጽዳቂዎች የራሳቸውን ምዝገባ በቀጥታ ይመዘግባሉ።'
            )}
          </span>
        </span>
      </label>

      {canManage && (
        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save settings', 'ቅንብሮቹን አስቀምጥ')}</button>
        </div>
      )}
    </form>
  );
}
