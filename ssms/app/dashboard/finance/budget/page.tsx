'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Download, Pencil, Wallet } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { loadBudget, setBudget, type BudgetView } from '../actions';
import { demoBudget, refreshFinance } from '@/lib/finance/client';
import { budgetRemaining, formatETB, type BudgetLine } from '@/lib/finance/types';
import type { LoadMode } from '@/lib/admin/types';
import { downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

const DEMO_VIEW: BudgetView = {
  years: [{ id: 'ay-001', name: '2025/2026', is_current: true, start_date: '2025-09-01', end_date: '2026-06-30' }],
  yearId: 'ay-001',
  lines: demoBudget(),
};

export default function BudgetPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canSet = can('FINANCE_APPROVE');

  const [mode, setMode] = useState<LoadMode>('loading');
  const [error, setError] = useState('');
  const [view, setView] = useState<BudgetView | null>(null);
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadBudget>>) => {
    if (res.mode === 'live') setView(res.data);
    else if (res.mode === 'demo') setView((v) => v ?? DEMO_VIEW);
    else setError(res.error);
    setMode(res.mode);
  }, []);

  useEffect(() => {
    loadBudget().then(apply);
  }, [apply]);

  const lines = view?.lines ?? [];
  const year = view?.years.find((y) => y.id === view.yearId) ?? null;
  const budgeted = lines.filter((l) => l.allocated !== null);
  const total = {
    allocated: budgeted.reduce((s, l) => s + (l.allocated ?? 0), 0),
    spent: lines.reduce((s, l) => s + l.spent, 0),
    committed: lines.reduce((s, l) => s + l.committed, 0),
    pending: lines.reduce((s, l) => s + l.pending, 0),
  };
  const unbudgetedSpending = lines
    .filter((l) => l.allocated === null)
    .reduce((s, l) => s + l.spent + l.committed, 0);

  const switchYear = async (id: string) => {
    setMode('loading');
    apply(await loadBudget(id));
  };

  const openEdit = (line: BudgetLine) => {
    setEditing(line);
    setAmount(line.allocated === null ? '' : String(line.allocated));
    setNotes(line.notes);
    setFormError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !view?.yearId) return;
    setFormError('');
    if (mode === 'live') {
      setBusy(true);
      const res = await setBudget({ year_id: view.yearId, unit_id: editing.unit_id, allocated: Number(amount), notes });
      setBusy(false);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      apply(await loadBudget(view.yearId));
      void refreshFinance(); // request forms show the new figure
    } else {
      setView((v) =>
        v && { ...v, lines: v.lines.map((l) => (l.unit_id === editing.unit_id ? { ...l, allocated: Number(amount), notes } : l)) }
      );
    }
    setEditing(null);
    setToast({ kind: 'success', text: t('Budget saved', 'በጀቱ ተመዝግቧል') });
    setTimeout(() => setToast(null), 3500);
  };

  const exportExcel = async () => {
    const header = [
      t('Department', 'ክፍል'), t('Budget', 'በጀት'), t('Spent', 'የወጣ'), t('Approved, unpaid', 'የጸደቀ ያልተከፈለ'),
      t('Remaining', 'ቀሪ'), t('Awaiting approval', 'ማጽደቅ የሚጠብቅ'), t('Used %', 'ጥቅም ላይ %'),
    ].map(headerCell);
    const body = lines.map((l) => {
      const rem = budgetRemaining(l);
      return [
        locale === 'am' ? l.unit_am : l.unit, l.allocated, l.spent, l.committed, rem, l.pending,
        l.allocated ? Math.round(((l.spent + l.committed) / l.allocated) * 100) : null,
      ];
    });
    await downloadXlsx(`budget_${year?.name.replace('/', '-') ?? ''}_${todayIso()}`, [header, ...body], {
      sheet: 'Budget',
      widths: [40, 14, 14, 16, 14, 16, 10],
    });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Department Budgets', 'የክፍሎች በጀት')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Each department’s allocation for the academic year, and how much is spent, committed and left.',
              'የእያንዳንዱ ክፍል የዓመት በጀት፣ የወጣው፣ የተያዘውና የቀረው።'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {view && view.years.length > 0 && (
            <select value={view.yearId ?? ''} onChange={(e) => switchYear(e.target.value)} className="form-input text-sm py-1.5">
              {view.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_current ? ` (${t('current', 'ወቅታዊ')})` : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={exportExcel} disabled={lines.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}
          </button>
        </div>
      </div>

      <AdminModeNotice mode={mode} error={error} />

      {mode === 'live' && view && !view.yearId && (
        <p className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800">
          {t('Budgets are set per academic year. Open one first: ', 'በጀት የሚመደበው በትምህርት ዓመት ነው። በመጀመሪያ ይክፈቱ፡ ')}
          <Link href="/dashboard/education/academic-years" className="font-semibold underline">
            {t('Academic Years', 'የትምህርት ዓመታት')}
          </Link>
        </p>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={t('Total budget', 'ጠቅላላ በጀት')} value={formatETB(total.allocated)} tone="text-slate-800" />
        <Kpi label={t('Spent', 'የወጣ')} value={formatETB(total.spent)} tone="text-red-500" />
        <Kpi label={t('Approved, unpaid', 'የጸደቀ ያልተከፈለ')} value={formatETB(total.committed)} tone="text-amber-600" />
        <Kpi
          label={t('Remaining', 'ቀሪ')}
          value={formatETB(total.allocated - budgeted.reduce((s, l) => s + l.spent + l.committed, 0))}
          tone="text-emerald-600"
        />
      </div>

      {unbudgetedSpending > 0 && (
        <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} />
          {t(
            `${formatETB(unbudgetedSpending)} was spent or approved for departments that have no budget set.`,
            `በጀት ላልተመደበላቸው ክፍሎች ${formatETB(unbudgetedSpending)} ወጪ ተደርጓል ወይም ጸድቋል።`
          )}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Department', 'ክፍል')}</th>
                <th className="text-right">{t('Budget', 'በጀት')}</th>
                <th className="text-right">{t('Spent', 'የወጣ')}</th>
                <th className="text-right">{t('Approved, unpaid', 'የጸደቀ ያልተከፈለ')}</th>
                <th className="text-right">{t('Remaining', 'ቀሪ')}</th>
                <th>{t('Used', 'ጥቅም ላይ')}</th>
                <th className="text-right">{t('Awaiting approval', 'ማጽደቅ የሚጠብቅ')}</th>
                {canSet && <th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const rem = budgetRemaining(l);
                const pct = l.allocated ? Math.round(((l.spent + l.committed) / l.allocated) * 100) : null;
                return (
                  <tr key={l.unit_id}>
                    <td>
                      <div className="font-medium text-slate-900">{locale === 'am' ? l.unit_am : l.unit}</div>
                      {l.notes && <div className="text-[11px] text-slate-400">{l.notes}</div>}
                    </td>
                    <td className="text-right font-mono text-sm">
                      {l.allocated === null ? <span className="text-slate-400 text-xs">{t('not set', 'አልተመደበም')}</span> : formatETB(l.allocated)}
                    </td>
                    <td className="text-right font-mono text-sm text-slate-700">{formatETB(l.spent)}</td>
                    <td className="text-right font-mono text-sm text-slate-700">{formatETB(l.committed)}</td>
                    <td className={`text-right font-mono text-sm font-semibold ${rem !== null && rem < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {rem === null ? '—' : formatETB(rem)}
                    </td>
                    <td className="min-w-[110px]">
                      {pct === null ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 w-9 text-right">{pct}%</span>
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono text-xs text-slate-500">{l.pending ? formatETB(l.pending) : '—'}</td>
                    {canSet && (
                      <td className="text-right">
                        <button
                          onClick={() => openEdit(l)}
                          disabled={!view?.yearId}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 inline-flex items-center gap-1 disabled:opacity-40"
                        >
                          <Pencil size={12} /> {l.allocated === null ? t('Set', 'መድብ') : t('Change', 'ቀይር')}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {mode !== 'loading' && lines.length === 0 && (
                <tr>
                  <td colSpan={canSet ? 8 : 7} className="text-center text-sm text-slate-400 py-8">
                    {t('No departments to show.', 'የሚታይ ክፍል የለም።')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          isOpen
          onClose={() => setEditing(null)}
          title={t('Set Department Budget', 'የክፍል በጀት መድብ')}
          subtitle={`${locale === 'am' ? editing.unit_am : editing.unit} • ${year?.name ?? ''}`}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle size={16} /> {formError}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Budget for the year (ETB)', 'የዓመቱ በጀት (ብር)')} *</label>
              <input type="number" required min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="form-input text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Notes (e.g. approved by the board on…)', 'ማስታወሻ (ለምሳሌ፡ በቦርድ የጸደቀበት ቀን…)')}</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="form-input text-sm" />
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Wallet size={13} />
              {t(
                `Already spent or approved: ${formatETB(editing.spent + editing.committed)}`,
                `እስካሁን የወጣ ወይም የጸደቀ፡ ${formatETB(editing.spent + editing.committed)}`
              )}
            </p>
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary text-xs">
                {t('Cancel', 'ሰርዝ')}
              </button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
                {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Budget', 'በጀት መዝግብ')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card p-5">
      <div className={`text-xl font-bold font-mono ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
