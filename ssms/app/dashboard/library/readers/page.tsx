'use client';

// Readers: everyone who has borrowed or read a book (last 18 months) — how
// many times, at home or in the library, what they have now, anything late —
// and each person's full reading history.

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Search } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice } from '@/components/admin/AdminModeNotice';
import { useLibrary } from '@/lib/library/client';
import { BORROWER_KINDS, daysLate, label, type BorrowerKind, type LibraryLoan } from '@/lib/library/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { loadReaderHistory } from '../actions';

interface Reader {
  id: string;
  name: string;
  name_am: string;
  phone: string;
  kind: BorrowerKind;
  total: number;
  home: number;
  reading: number;
  open: number;
  late: number;
  books: number;
  last: string;
}

export default function LibraryReadersPage() {
  const { t, locale } = useLang();
  const lib = useLibrary();
  const today = todayIso();
  const initial = useSearchParams().get('kind') as BorrowerKind | null;
  const [kind, setKind] = useState<'ALL' | BorrowerKind>(initial && initial in BORROWER_KINDS ? initial : 'ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'total' | 'last' | 'name'>('total');
  const [person, setPerson] = useState<Reader | null>(null);
  const [history, setHistory] = useState<LibraryLoan[] | null>(null);

  const readers = useMemo(() => {
    const m = new Map<string, Reader & { bookIds: Set<string> }>();
    for (const l of lib.loans) {
      const r = m.get(l.person_id) ?? { id: l.person_id, name: l.person, name_am: l.person_am, phone: l.phone, kind: l.borrower_kind, total: 0, home: 0, reading: 0, open: 0, late: 0, books: 0, last: '', bookIds: new Set<string>() };
      r.total++;
      if (l.kind === 'HOME') r.home++;
      else r.reading++;
      if (l.status === 'OUT') r.open++;
      if (daysLate(l, today) > 0) r.late++;
      r.bookIds.add(l.book_id);
      if (l.issued_at > r.last) {
        r.last = l.issued_at;
        r.kind = l.borrower_kind; // what they were the last time
      }
      m.set(l.person_id, r);
    }
    return [...m.values()].map(({ bookIds, ...r }) => ({ ...r, books: bookIds.size }));
  }, [lib.loans, today]);

  const counts = (Object.keys(BORROWER_KINDS) as BorrowerKind[]).map((k) => [k, readers.filter((r) => r.kind === k).length] as const);
  const needle = search.trim().toLowerCase();
  const rows = readers
    .filter((r) => kind === 'ALL' || r.kind === kind)
    .filter((r) => !needle || `${r.name} ${r.name_am} ${r.phone}`.toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'total' ? b.total - a.total : sort === 'last' ? b.last.localeCompare(a.last) : a.name.localeCompare(b.name)));

  const open = async (r: Reader) => {
    setPerson(r);
    setHistory(lib.loans.filter((l) => l.person_id === r.id));
    // The whole history (also older than what the page loaded)
    if (lib.mode === 'live') {
      const res = await loadReaderHistory(r.id);
      if (res.ok) setHistory(res.loans);
    }
  };
  const titleOf = (id: string) => lib.books.find((b) => b.id === id)?.title ?? '—';

  const exportExcel = async () => {
    const header = [t('Name', 'ስም'), t('Type', 'ዓይነት'), t('Phone', 'ስልክ'), t('Times', 'ጊዜ'), t('Home', 'ቤት'), t('Read here', 'እዚሁ'), t('Different books', 'የተለያዩ መጻሕፍት'), t('Has now', 'አሁን ያለው'), t('Late', 'ያለፈበት'), t('Last time', 'መጨረሻ')].map(headerCell);
    const body = rows.map((r) => [cell(locale === 'am' ? r.name_am : r.name), label(BORROWER_KINDS[r.kind], locale), r.phone, r.total, r.home, r.reading, r.books, r.open, r.late, r.last.slice(0, 10)]);
    await downloadXlsx(`library_readers_${today}`, [header, ...body], { sheet: 'Readers', widths: [26, 10, 14, 8, 8, 10, 12, 10, 8, 12] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Readers', 'አንባቢዎች')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Everyone who borrowed or read a book in the last 18 months', 'ባለፉት 18 ወራት መጽሐፍ የተዋሱ ወይም ያነበቡ ሁሉ')}</p>
        </div>
        <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
      </div>

      <AdminModeNotice mode={lib.mode} error={lib.error} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <button onClick={() => setKind('ALL')} className={`card p-5 text-left ${kind === 'ALL' ? 'ring-2 ring-blue-500/40' : 'hover:shadow-md'}`}>
          <div className="text-2xl font-bold text-slate-900">{readers.length}</div>
          <div className="text-xs text-slate-500 mt-1">{t('All readers', 'ሁሉም አንባቢዎች')}</div>
        </button>
        {counts.map(([k, n]) => (
          <button key={k} onClick={() => setKind(k)} className={`card p-5 text-left ${kind === k ? 'ring-2 ring-blue-500/40' : 'hover:shadow-md'}`}>
            <div className="text-2xl font-bold text-slate-900">{n}</div>
            <div className="text-xs text-slate-500 mt-1">{label(BORROWER_KINDS[k], locale)}</div>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Name or phone…', 'ስም ወይም ስልክ…')} className="form-input pl-9 text-sm" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="form-input text-xs py-1.5 px-3 w-auto">
            <option value="total">{t('Most reading first', 'ብዙ ያነበቡ መጀመሪያ')}</option>
            <option value="last">{t('Latest first', 'የቅርብ ጊዜ መጀመሪያ')}</option>
            <option value="name">{t('By name', 'በስም')}</option>
          </select>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Reader', 'አንባቢ')}</th>
                <th className="text-center">{t('Times', 'ጊዜ')}</th>
                <th className="text-center">{t('Home / here', 'ቤት / እዚሁ')}</th>
                <th className="text-center">{t('Books', 'መጻሕፍት')}</th>
                <th className="text-center">{t('Has now', 'አሁን ያለው')}</th>
                <th>{t('Last time', 'መጨረሻ')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => open(r)}>
                  <td>
                    <div className="font-medium text-slate-900">{locale === 'am' ? r.name_am : r.name}</div>
                    <div className="text-[11px] text-slate-500">{label(BORROWER_KINDS[r.kind], locale)}{r.phone && ` · ${r.phone}`}</div>
                  </td>
                  <td className="text-center font-bold text-slate-900">{r.total}</td>
                  <td className="text-center text-xs text-slate-600">{r.home} / {r.reading}</td>
                  <td className="text-center text-xs text-slate-600">{r.books}</td>
                  <td className="text-center text-xs">
                    {r.open ? <span className={r.late ? 'text-red-600 font-semibold' : 'text-blue-700 font-semibold'}>{r.open}{r.late ? ` (${r.late} ${t('late', 'ያለፈ')})` : ''}</span> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="text-xs text-slate-600 whitespace-nowrap">{formatEthiopianDate(r.last.slice(0, 10), locale)}</td>
                </tr>
              ))}
              {lib.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-slate-400 py-10">{t('No readers yet.', 'ገና አንባቢ የለም።')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {person && (
        <Modal isOpen onClose={() => { setPerson(null); setHistory(null); }} title={locale === 'am' ? person.name_am : person.name} subtitle={`${label(BORROWER_KINDS[person.kind], locale)}${person.phone ? ` · ${person.phone}` : ''}`} maxWidth="xl">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[[person.total, t('Times', 'ጊዜ')], [person.home, t('Home', 'ቤት')], [person.reading, t('Read here', 'እዚሁ')], [person.books, t('Books', 'መጻሕፍት')]].map(([v, l]) => (
                <div key={String(l)} className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-slate-900">{v}</div><div className="text-[11px] text-slate-500">{l}</div></div>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {(history ?? []).map((l) => {
                const late = daysLate(l, today);
                return (
                  <div key={l.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{titleOf(l.book_id)}</div>
                      <div className="text-[11px] text-slate-500"><span className="font-mono">{l.copy_no}</span> · {l.kind === 'HOME' ? t('home', 'ቤት') : t('read here', 'እዚሁ')}</div>
                    </div>
                    <div className="text-xs text-right whitespace-nowrap">
                      <div className="text-slate-600">{formatEthiopianDate(l.issued_at.slice(0, 10), locale)}</div>
                      {l.status === 'OUT' ? (
                        <div className={late ? 'text-red-600 font-semibold' : 'text-blue-700'}>{late ? t(`${late} days late`, `${late} ቀን አልፏል`) : t('has it now', 'አሁን አለው')}</div>
                      ) : l.status === 'LOST' ? (
                        <div className="text-red-600">{t('lost', 'ጠፍቷል')}</div>
                      ) : (
                        <div className="text-emerald-700">{t('returned', 'ተመልሷል')}{l.returned_at ? ` ${formatEthiopianDate(l.returned_at.slice(0, 10), locale)}` : ''}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
