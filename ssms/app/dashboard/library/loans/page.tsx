'use client';

// The lending desk: books at people's homes, books being read in the library
// room now, late books and the history — take back, give more time, mark lost.
// The lending rules (days at home, books per person) are set here too.

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Download, Search, Settings2, Undo2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { LendDialog, ReturnDialog } from '@/components/library/LoanDialogs';
import { RequestsPanel } from '@/components/library/RequestsPanel';
import { runLibrary, useLibrary } from '@/lib/library/client';
import { BORROWER_KINDS, daysLate, label, type BorrowerKind, type LibraryLoan } from '@/lib/library/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { markLoanLost, renewLoan, saveLibrarySettings } from '../actions';

type Tab = 'HOME' | 'READING' | 'LATE' | 'HISTORY';

export default function LibraryLoansPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('LIBRARY_MANAGE');
  const lib = useLibrary();
  const today = todayIso();
  const initial = useSearchParams().get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && ['HOME', 'READING', 'LATE', 'HISTORY'].includes(initial) ? initial : 'HOME');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | BorrowerKind>('ALL');
  const [lending, setLending] = useState(false);
  const [returning, setReturning] = useState<LibraryLoan | 'pick' | null>(null);
  const [renewing, setRenewing] = useState<LibraryLoan | null>(null);
  const [rules, setRules] = useState<{ loan_days: string; max_home_loans: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };
  const done = (text: string) => {
    setLending(false);
    setReturning(null);
    say('success', text);
  };

  const titleOf = (id: string) => lib.books.find((b) => b.id === id)?.title ?? '—';
  const open = lib.loans.filter((l) => l.status === 'OUT');
  const lists: Record<Tab, LibraryLoan[]> = {
    HOME: open.filter((l) => l.kind === 'HOME').sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    READING: open.filter((l) => l.kind === 'READING'),
    LATE: open.filter((l) => daysLate(l, today) > 0).sort((a, b) => daysLate(b, today) - daysLate(a, today)),
    HISTORY: lib.loans.filter((l) => l.status !== 'OUT'),
  };
  const needle = search.trim().toLowerCase();
  const rows = lists[tab]
    .filter((l) => kindFilter === 'ALL' || l.borrower_kind === kindFilter)
    .filter((l) => !needle || `${l.person} ${l.person_am} ${l.phone} ${l.copy_no} ${titleOf(l.book_id)}`.toLowerCase().includes(needle));

  const lost = async (l: LibraryLoan) => {
    const note = window.prompt(t('What happened to the book?', 'መጽሐፉ ምን ሆነ?'));
    if (!note) return;
    const res = await runLibrary(() => markLoanLost(l.id, note));
    if (!res.ok) return say('error', res.error);
    say('success', t(`${l.copy_no} marked lost`, `${l.copy_no} እንደጠፋ ተመዝግቧል`));
  };

  const exportExcel = async () => {
    const header = [t('Book', 'መጽሐፍ'), t('Copy', 'ቅጂ'), t('Person', 'ሰው'), t('Type', 'ዓይነት'), t('Phone', 'ስልክ'), t('Where', 'የት'), t('Given', 'የተሰጠው'), t('Due', 'የሚመለስበት'), t('Returned', 'የተመለሰው'), t('Days late', 'ያለፈ ቀን'), t('Status', 'ሁኔታ')].map(headerCell);
    const body = rows.map((l) => [
      cell(titleOf(l.book_id)), l.copy_no, cell(locale === 'am' ? l.person_am : l.person), label(BORROWER_KINDS[l.borrower_kind], locale), l.phone,
      l.kind === 'HOME' ? t('Home', 'ቤት') : t('Read here', 'እዚሁ'), l.issued_at.slice(0, 10), l.due_date ?? '', l.returned_at?.slice(0, 10) ?? '', daysLate(l, today) || '', l.status,
    ]);
    await downloadXlsx(`library_loans_${tab.toLowerCase()}_${today}`, [header, ...body], { sheet: 'Loans', widths: [32, 14, 24, 10, 14, 10, 12, 12, 12, 8, 10] });
  };

  const tabs: [Tab, string][] = [
    ['HOME', t('At home', 'ቤት ያሉ')],
    ['READING', t('Read here now', 'አሁን እዚሁ')],
    ['LATE', t('Late', 'ያለፈባቸው')],
    ['HISTORY', t('History', 'ታሪክ')],
  ];

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Lending desk', 'የውሰት ጠረጴዛ')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(`Books go home for ${lib.settings.loan_days} days; up to ${lib.settings.max_home_loans} per person`, `መጻሕፍት ለ${lib.settings.loan_days} ቀን ወደ ቤት ይሄዳሉ፤ ለአንድ ሰው እስከ ${lib.settings.max_home_loans}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && (
            <>
              <button onClick={() => setRules({ loan_days: String(lib.settings.loan_days), max_home_loans: String(lib.settings.max_home_loans) })} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Settings2 size={14} /> {t('Rules', 'ደንቦች')}</button>
              <button onClick={() => setReturning('pick')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Undo2 size={14} /> {t('Take back', 'ተቀበል')}</button>
              <button onClick={() => setLending(true)} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><BookOpen size={14} /> {t('Lend a book', 'መጽሐፍ አውስ')}</button>
            </>
          )}
        </div>
      </div>

      <AdminModeNotice mode={lib.mode} error={lib.error} />

      <RequestsPanel canManage={canManage} onMessage={say} />

      <div className="card overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === k ? (k === 'LATE' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white') : 'text-slate-600 hover:bg-slate-100'}`}>
                {l} <span className="opacity-70">({lists[k].length})</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Person, book, copy…', 'ሰው፣ መጽሐፍ፣ ቅጂ…')} className="form-input pl-9 text-xs py-1.5 w-56" />
            </div>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('Everyone', 'ሁሉም')}</option>
              {(Object.keys(BORROWER_KINDS) as BorrowerKind[]).map((k) => <option key={k} value={k}>{label(BORROWER_KINDS[k], locale)}</option>)}
            </select>
          </div>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Book', 'መጽሐፍ')}</th>
                <th>{t('Person', 'ሰው')}</th>
                <th>{t('Given', 'የተሰጠው')}</th>
                <th>{tab === 'HISTORY' ? t('Back', 'የተመለሰው') : t('Due', 'የሚመለስበት')}</th>
                {canManage && tab !== 'HISTORY' && <th className="text-right">{t('Action', 'ተግባር')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const late = daysLate(l, today);
                return (
                  <tr key={l.id}>
                    <td>
                      <div className="font-medium text-slate-900">{titleOf(l.book_id)}</div>
                      <div className="text-[11px] text-slate-500"><span className="font-mono">{l.copy_no}</span> · {l.kind === 'HOME' ? t('home', 'ቤት') : t('read here', 'እዚሁ')}{l.renewals > 0 && ` · ${t(`more time ×${l.renewals}`, `ጊዜ ተራዝሟል ×${l.renewals}`)}`}</div>
                    </td>
                    <td>
                      <div className="text-sm text-slate-800">{locale === 'am' ? l.person_am : l.person}</div>
                      <div className="text-[11px] text-slate-500">{label(BORROWER_KINDS[l.borrower_kind], locale)}{l.phone && ` · ${l.phone}`}</div>
                    </td>
                    <td className="text-xs text-slate-600 whitespace-nowrap">{formatEthiopianDate(l.issued_at.slice(0, 10), locale)}</td>
                    <td className="text-xs whitespace-nowrap">
                      {tab === 'HISTORY' ? (
                        <span className={l.status === 'LOST' ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                          {l.status === 'LOST' ? t('Lost', 'ጠፍቷል') : l.returned_at ? formatEthiopianDate(l.returned_at.slice(0, 10), locale) : ''}
                          {l.condition_in === 'DAMAGED' && <span className="text-amber-700"> · {t('damaged', 'ተበላሽቷል')}</span>}
                        </span>
                      ) : l.due_date ? (
                        <>
                          <div className={late ? 'text-red-600 font-semibold' : 'text-slate-600'}>{formatEthiopianDate(l.due_date, locale)}</div>
                          {late > 0 && <div className="text-[11px] text-red-600">{t(`${late} days late`, `${late} ቀን አልፏል`)}</div>}
                        </>
                      ) : (
                        <span className="text-slate-400">{t('today', 'ዛሬ')}</span>
                      )}
                    </td>
                    {canManage && tab !== 'HISTORY' && (
                      <td className="text-right whitespace-nowrap">
                        <button onClick={() => setReturning(l)} className="btn btn-primary text-[11px] py-1 px-2">{t('Take back', 'ተቀበል')}</button>
                        {l.kind === 'HOME' && <button onClick={() => setRenewing(l)} className="ml-1 btn btn-secondary text-[11px] py-1 px-2">{t('More time', 'ጊዜ አራዝም')}</button>}
                        <button onClick={() => lost(l)} className="ml-1 text-[11px] text-slate-400 hover:text-red-600 px-1">{t('Lost', 'ጠፍቷል')}</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {lib.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-10">{tab === 'LATE' ? t('No book is late.', 'ጊዜው ያለፈ መጽሐፍ የለም።') : t('Nothing here.', 'ምንም የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lending && <LendDialog onClose={() => setLending(false)} onDone={done} />}
      {returning && <ReturnDialog loan={returning === 'pick' ? undefined : returning} onClose={() => setReturning(null)} onDone={done} />}

      {renewing && (
        <RenewDialog
          loan={renewing}
          title={titleOf(renewing.book_id)}
          defaultDays={lib.settings.loan_days}
          onClose={() => setRenewing(null)}
          onSave={async (due) => {
            const res = await runLibrary(() => renewLoan(renewing.id, due));
            if (!res.ok) return say('error', res.error);
            setRenewing(null);
            say('success', t(`New return date: ${formatEthiopianDate(due, 'en')}`, `አዲስ የመመለሻ ቀን፦ ${formatEthiopianDate(due, 'am')}`));
          }}
        />
      )}

      <Modal isOpen={Boolean(rules)} onClose={() => setRules(null)} title={t('Lending rules', 'የውሰት ደንቦች')}>
        {rules && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await runLibrary(() => saveLibrarySettings({ loan_days: rules.loan_days, max_home_loans: rules.max_home_loans }));
              setBusy(false);
              if (!res.ok) return say('error', res.error);
              setRules(null);
              say('success', t('Rules saved', 'ደንቦቹ ተቀምጠዋል'));
            }}
            className="space-y-4 text-sm"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Days a book may stay at home', 'መጽሐፍ ቤት የሚቆይበት ቀን')}</label>
                <input type="number" min={1} max={365} value={rules.loan_days} onChange={(e) => setRules({ ...rules, loan_days: e.target.value })} className="form-input text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Books at home per person', 'ለአንድ ሰው ቤት የሚሄዱ መጻሕፍት')}</label>
                <input type="number" min={1} max={50} value={rules.max_home_loans} onChange={(e) => setRules({ ...rules, max_home_loans: e.target.value })} className="form-input text-sm" />
              </div>
            </div>
            <p className="text-xs text-slate-500">{t('Someone at the limit, or with a late book, can still be given a book — the desk asks first.', 'ገደቡ ላይ የደረሰ ወይም ያለፈበት መጽሐፍ ያለው ሰው አሁንም ሊወስድ ይችላል — መጀመሪያ ይጠየቃል።')}</p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setRules(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{t('Save', 'አስቀምጥ')}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function RenewDialog({ loan, title, defaultDays, onClose, onSave }: { loan: LibraryLoan; title: string; defaultDays: number; onClose: () => void; onSave: (due: string) => void }) {
  const { t, locale } = useLang();
  const from = loan.due_date && loan.due_date > todayIso() ? loan.due_date : todayIso();
  const [due, setDue] = useState(new Date(Date.parse(from) + defaultDays * 86_400_000).toISOString().slice(0, 10));
  return (
    <Modal isOpen onClose={onClose} title={t('Give more time', 'ጊዜ አራዝም')} subtitle={`${title} · ${loan.copy_no}`}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-700">{t('New return date', 'አዲስ የመመለሻ ቀን')}</label>
          <input type="date" min={todayIso()} value={due} onChange={(e) => setDue(e.target.value)} className="form-input text-sm w-auto" />
          <span className="text-xs text-slate-500">{formatEthiopianDate(due, locale)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={() => onSave(due)} className="btn btn-primary text-xs">{t('Save', 'አስቀምጥ')}</button>
        </div>
      </div>
    </Modal>
  );
}
