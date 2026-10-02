'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Download, Plus, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { recordTransaction, useFinance } from '@/lib/finance/client';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoryLabel,
  formatETB,
  type TxnType,
} from '@/lib/finance/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

/** Income or expense ledger: totals, filters, list, Excel export and a "record" form. */
export function LedgerPage({ type }: { type: TxnType }) {
  const { t, locale } = useLang();
  const { user, can } = useAuth();
  const fin = useFinance();
  const income = type === 'INCOME';
  const categories = income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [month, setMonth] = useState(''); // YYYY-MM or ''
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    date: todayIso(),
    category: categories[0][0],
    amount: '',
    party: '',
    receipt_no: '',
    unit_id: '',
    description: '',
  });

  const all = fin.transactions.filter((x) => x.type === type);
  const needle = search.toLowerCase();
  const rows = all.filter(
    (x) =>
      (categoryFilter === 'ALL' || x.category === categoryFilter) &&
      (!month || x.date.startsWith(month)) &&
      (x.description.toLowerCase().includes(needle) ||
        x.party.toLowerCase().includes(needle) ||
        x.receipt_no.toLowerCase().includes(needle) ||
        x.request_no.toLowerCase().includes(needle))
  );

  const year = String(new Date().getFullYear());
  const thisMonth = todayIso().slice(0, 7);
  const total = (list: typeof all) => list.reduce((s, x) => s + x.amount, 0);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    const res = await recordTransaction(
      { ...form, type, amount: Number(form.amount) },
      user?.person.full_name_en ?? ''
    );
    setBusy(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setFormOpen(false);
    setForm((f) => ({ ...f, amount: '', party: '', receipt_no: '', description: '' }));
    setToast({ kind: 'success', text: income ? t('Income recorded', 'ገቢው ተመዝግቧል') : t('Expense recorded', 'ወጪው ተመዝግቧል') });
    setTimeout(() => setToast(null), 3500);
  };

  const exportExcel = async () => {
    const header = [
      t('Date', 'ቀን'), t('Ethiopian date', 'የኢትዮጵያ ቀን'), t('Category', 'ዓይነት'), t('Amount (ETB)', 'መጠን (ብር)'),
      income ? t('Received from', 'ከማን') : t('Paid to', 'ለማን'), t('Receipt no.', 'ደረሰኝ'), t('Department', 'ክፍል'),
      t('Request', 'ጥያቄ'), t('Description', 'መግለጫ'), t('Recorded by', 'የመዘገበው'),
    ].map(headerCell);
    const body = rows.map((x) => [
      x.date, formatEthiopianDate(x.date, 'en'), categoryLabel(x.category, locale), x.amount,
      cell(x.party), x.receipt_no, x.unit, x.request_no, cell(x.description), x.recorded_by,
    ]);
    try {
      await downloadXlsx(`${income ? 'income' : 'expenses'}_${todayIso()}`, [header, ...body], {
        sheet: income ? 'Income' : 'Expenses',
        widths: [12, 20, 22, 14, 22, 14, 24, 14, 32, 20],
      });
    } catch {
      setToast({ kind: 'error', text: t('Could not create the Excel file.', 'የኤክሴል ፋይሉን መፍጠር አልተቻለም።') });
    }
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {income ? t('Income & Revenues', 'ገቢዎች') : t('Expenses & Payments', 'ወጪዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {income
              ? t('Contributions, donations and other money received', 'መዋጮ፣ ስጦታና ሌሎች የተገኙ ገቢዎች')
              : t('Money paid out — paid payment requests appear here automatically', 'የተከፈሉ ወጪዎች — የተከፈሉ የክፍያ ጥያቄዎች እዚህ በራሳቸው ይመዘገባሉ')}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}
          </button>
          {can('FINANCE_CREATE') && (
            <button
              onClick={() => {
                setFormError('');
                setFormOpen(true);
              }}
              disabled={fin.mode === 'loading' || fin.mode === 'error'}
              className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} /> {income ? t('Record Income', 'ገቢ መዝግብ') : t('Record Expense', 'ወጪ መዝግብ')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={fin.mode} error={fin.error} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className={`text-2xl font-bold ${income ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatETB(total(all.filter((x) => x.date.startsWith(year))))}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t(`Total in ${year}`, `በ${year} ጠቅላላ`)}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-800">{formatETB(total(all.filter((x) => x.date.startsWith(thisMonth))))}</div>
          <div className="text-xs text-slate-500 mt-1">{t('This month', 'በዚህ ወር')}</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-blue-600">{formatETB(total(rows))}</div>
          <div className="text-xs text-slate-500 mt-1">
            {t('Shown below', 'ከታች የሚታየው')} ({rows.length})
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t('Search...', 'ፈልግ...')} value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('All categories', 'ሁሉም ዓይነቶች')}</option>
              {categories.map(([en, am]) => (
                <option key={en} value={en}>{locale === 'am' ? am : en}</option>
              ))}
            </select>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="form-input text-xs py-1.5 px-3" />
          </div>
        </div>

        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Date', 'ቀን')}</th>
                <th>{t('Category', 'ዓይነት')}</th>
                <th>{t('Description', 'መግለጫ')}</th>
                <th>{income ? t('Received from', 'ከማን') : t('Paid to', 'ለማን')}</th>
                <th>{t('Receipt', 'ደረሰኝ')}</th>
                <th className="text-right">{t('Amount', 'መጠን')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td>
                    <div className="text-xs font-medium text-slate-800">{formatEthiopianDate(x.date, locale)}</div>
                    <div className="font-mono text-[11px] text-slate-400">{x.date}</div>
                  </td>
                  <td className="text-xs text-slate-700">{categoryLabel(x.category, locale)}</td>
                  <td className="text-xs text-slate-700">
                    {x.description || '—'}
                    {x.request_no && (
                      <Link href="/dashboard/finance/requests" className="ml-1 font-mono text-blue-600 hover:underline">
                        ({x.request_no})
                      </Link>
                    )}
                    {x.unit && <div className="text-[11px] text-slate-400">{x.unit}</div>}
                  </td>
                  <td className="text-xs text-slate-600">{x.party || '—'}</td>
                  <td className="text-xs font-mono text-slate-500">{x.receipt_no || '—'}</td>
                  <td className={`text-right font-mono font-semibold whitespace-nowrap ${income ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatETB(x.amount)}
                  </td>
                </tr>
              ))}
              {fin.mode !== 'loading' && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-8">
                    {t('Nothing recorded yet.', 'እስካሁን የተመዘገበ የለም።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={income ? t('Record Income', 'ገቢ መዝግብ') : t('Record Expense', 'ወጪ መዝግብ')}
        subtitle={
          income
            ? t('Money received by the Sunday school', 'ሰንበት ት/ቤቱ የተቀበለው ገንዘብ')
            : t('For spending without a payment request (e.g. utilities)', 'ያለ ክፍያ ጥያቄ ለሚወጣ ወጪ (ለምሳሌ፡ መብራት፣ ውሃ)')
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} /> {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('Date', 'ቀን') + ' *'}>
              <input type="date" required max={todayIso()} value={form.date} onChange={set('date')} className="form-input text-sm" />
            </Field>
            <Field label={t('Amount (ETB)', 'መጠን (ብር)') + ' *'}>
              <input type="number" required min="0.01" step="0.01" value={form.amount} onChange={set('amount')} className="form-input text-sm font-mono" />
            </Field>
            <Field label={t('Category', 'ዓይነት') + ' *'}>
              <select value={form.category} onChange={set('category')} className="form-input text-sm">
                {categories.map(([en, am]) => (
                  <option key={en} value={en}>{locale === 'am' ? am : en}</option>
                ))}
              </select>
            </Field>
            <Field label={income ? t('Received from', 'ከማን ተቀበልን') : t('Paid to', 'ለማን ተከፈለ')}>
              <input type="text" value={form.party} onChange={set('party')} className="form-input text-sm" />
            </Field>
            <Field label={t('Receipt no.', 'የደረሰኝ ቁጥር')}>
              <input type="text" value={form.receipt_no} onChange={set('receipt_no')} className="form-input text-sm font-mono" />
            </Field>
            <Field label={t('Department (optional)', 'ክፍል (ካለ)')}>
              <select value={form.unit_id} onChange={set('unit_id')} className="form-input text-sm">
                <option value="">—</option>
                {fin.units.map((u) => (
                  <option key={u.id} value={u.id}>{locale === 'am' ? u.name_am : u.name_en}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('Description', 'መግለጫ')}>
            <textarea rows={2} value={form.description} onChange={set('description')} className="form-input text-sm" />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="btn btn-secondary text-xs">
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
              {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save', 'መዝግብ')}
            </button>
          </div>
        </form>
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
