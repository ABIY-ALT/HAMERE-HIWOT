'use client';

// Library overview: what is on the shelf and out, who reads (students,
// teachers, members), which books are read most, at home or in the library,
// and which books are late.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookCopy, BookOpen, Clock, Home, LibraryBig, Undo2, Users } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { LendDialog, ReturnDialog } from '@/components/library/LoanDialogs';
import { RequestsPanel } from '@/components/library/RequestsPanel';
import { useLibrary } from '@/lib/library/client';
import { BORROWER_KINDS, categoryName, daysLate, label, libraryStats, type BorrowerKind, type LibraryLoan } from '@/lib/library/types';
import { ethiopianMonthName, formatEthiopianDate, isoToEthiopian, todayIso } from '@/lib/utils/ethiopian-calendar';

const PERIODS: [days: number, en: string, am: string][] = [
  [30, 'Last 30 days', 'ያለፉት 30 ቀናት'],
  [90, 'Last 3 months', 'ያለፉት 3 ወራት'],
  [365, 'Last 12 months', 'ያለፉት 12 ወራት'],
];
const KIND_COLOR: Record<BorrowerKind, string> = { STUDENT: 'bg-blue-500', TEACHER: 'bg-emerald-500', MEMBER: 'bg-amber-500', OTHER: 'bg-slate-400' };

export default function LibraryOverviewPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('LIBRARY_MANAGE');
  const lib = useLibrary();
  const today = todayIso();
  const [period, setPeriod] = useState(365);
  const [lending, setLending] = useState(false);
  const [returning, setReturning] = useState<LibraryLoan | 'pick' | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const since = useMemo(() => new Date(Date.parse(today) - period * 86_400_000).toISOString().slice(0, 10), [today, period]);
  const stats = useMemo(() => libraryStats(lib, since), [lib, since]);
  const bookById = useMemo(() => new Map(lib.books.map((b) => [b.id, b])), [lib.books]);

  const copies = lib.copies.filter((c) => c.status !== 'WITHDRAWN');
  const onShelf = copies.filter((c) => c.status === 'AVAILABLE').length;
  const open = lib.loans.filter((l) => l.status === 'OUT');
  const atHome = open.filter((l) => l.kind === 'HOME');
  const readingNow = open.filter((l) => l.kind === 'READING');
  const late = atHome.filter((l) => daysLate(l, today) > 0).sort((a, b) => daysLate(b, today) - daysLate(a, today));
  const maxMonth = Math.max(1, ...stats.months.map((m) => m.home + m.reading));
  const maxCat = Math.max(1, ...stats.byCategory.map((c) => c.count));

  const done = (text: string) => {
    setLending(false);
    setReturning(null);
    setToast({ kind: 'success', text });
    setTimeout(() => setToast(null), 4000);
  };
  const monthLabel = (ym: string) => {
    const e = isoToEthiopian(`${ym}-15`);
    return e ? ethiopianMonthName(e.month, locale).slice(0, locale === 'am' ? 3 : 4) : ym;
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Library', 'ቤተ መጻሕፍት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Books, who reads them, and what is out', 'መጻሕፍት፣ የሚያነቧቸውና የተዋሱት')}</p>
        </div>
        {canManage && (
          <div className="flex gap-2 self-start sm:self-auto">
            <button onClick={() => setReturning('pick')} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Undo2 size={14} /> {t('Take back', 'ተቀበል')}</button>
            <button onClick={() => setLending(true)} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><BookOpen size={14} /> {t('Lend a book', 'መጽሐፍ አውስ')}</button>
          </div>
        )}
      </div>

      <AdminModeNotice mode={lib.mode} error={lib.error} />

      <RequestsPanel
        canManage={canManage}
        onMessage={(kind, text) => {
          setToast({ kind, text });
          setTimeout(() => setToast(null), 4000);
        }}
      />

      {/* Now */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tile icon={LibraryBig} value={lib.books.filter((b) => b.is_active).length} label={t('Titles', 'ርዕሶች')} href="/dashboard/library/books" />
        <Tile icon={BookCopy} value={`${onShelf} / ${copies.length}`} label={t('Copies on the shelf', 'መደርደሪያ ላይ ያሉ ቅጂዎች')} href="/dashboard/library/books" />
        <Tile icon={Home} value={atHome.length} label={t('Taken home now', 'አሁን ቤት ያሉ')} href="/dashboard/library/loans" tone="text-blue-700" />
        <Tile icon={BookOpen} value={readingNow.length} label={t('Being read here now', 'አሁን እዚሁ እየተነበቡ')} href="/dashboard/library/loans?tab=READING" tone="text-violet-700" />
        <Tile icon={Clock} value={late.length} label={t('Late', 'ጊዜያቸው ያለፈ')} href="/dashboard/library/loans?tab=LATE" tone={late.length ? 'text-red-600' : 'text-slate-900'} />
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(([d, en, am]) => (
          <button key={d} onClick={() => setPeriod(d)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${period === d ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {t(en, am)}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-1">
          {t(`${stats.loans} times a book was given — ${stats.home} home, ${stats.reading} read here`, `${stats.loans} ጊዜ መጽሐፍ ተሰጥቷል — ${stats.home} ወደ ቤት፣ ${stats.reading} እዚሁ`)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Readers */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Users size={15} /> {t('Readers', 'አንባቢዎች')}</h2>
            <Link href="/dashboard/library/readers" className="text-xs text-blue-600 hover:underline">{t('All readers', 'ሁሉም አንባቢዎች')} →</Link>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{stats.readersTotal}</div>
          <div className="text-xs text-slate-500">{t('different people borrowed or read', 'የተለያዩ ሰዎች ተውሰዋል ወይም አንብበዋል')}</div>
          <div className="mt-4 flex h-2.5 rounded-full overflow-hidden bg-slate-100">
            {(Object.keys(BORROWER_KINDS) as BorrowerKind[]).map((k) =>
              stats.readers[k] ? <div key={k} className={KIND_COLOR[k]} style={{ width: `${(stats.readers[k] / stats.readersTotal) * 100}%` }} /> : null
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(Object.keys(BORROWER_KINDS) as BorrowerKind[]).map((k) => (
              <Link key={k} href={`/dashboard/library/readers?kind=${k}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50">
                <span className={`w-2.5 h-2.5 rounded-full ${KIND_COLOR[k]}`} />
                <span className="text-xs text-slate-600 flex-1">{label(BORROWER_KINDS[k], locale)}</span>
                <span className="text-sm font-bold text-slate-900">{stats.readers[k]}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Month by month */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-bold text-slate-800 text-sm">{t('Books given, month by month', 'በየወሩ የተሰጡ መጻሕፍት')}</h2>
          <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> {t('Home', 'ወደ ቤት')}</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-400" /> {t('Read here', 'እዚሁ')}</span>
          </div>
          {stats.months.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">{t('No books given in this period.', 'በዚህ ጊዜ የተሰጠ መጽሐፍ የለም።')}</p>
          ) : (
            <div className="mt-4 h-40 flex items-end gap-1.5">
              {stats.months.map((m) => (
                <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`${m.month}: ${m.home} + ${m.reading}`}>
                  <span className="text-[10px] text-slate-500">{m.home + m.reading}</span>
                  <div className="w-full max-w-10 flex flex-col justify-end rounded-t overflow-hidden" style={{ height: `${((m.home + m.reading) / maxMonth) * 110}px` }}>
                    <div className="bg-violet-400" style={{ height: `${(m.reading / (m.home + m.reading)) * 100}%` }} />
                    <div className="bg-blue-500 flex-1" />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate w-full text-center">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Most read */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-bold text-slate-800 text-sm">{t('Most read books', 'በብዛት የተነበቡ መጻሕፍት')}</h2>
          {stats.topBooks.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">{t('Nothing yet.', 'ገና የለም።')}</p>
          ) : (
            <ol className="mt-3 divide-y divide-slate-100">
              {stats.topBooks.map((b, i) => {
                const book = bookById.get(b.book_id);
                return (
                  <li key={b.book_id} className="py-2 flex items-center gap-3">
                    <span className="w-5 text-xs font-bold text-slate-400">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{book?.title ?? '—'}</div>
                      <div className="text-[11px] text-slate-500">{[book?.author, book && categoryName(book.category, locale)].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-bold text-slate-900">{b.count}×</div>
                      <div className="text-slate-500">{b.home} {t('home', 'ቤት')} · {b.reading} {t('here', 'እዚሁ')}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Top readers + categories */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-bold text-slate-800 text-sm">{t('Top readers', 'ብዙ ያነበቡ')}</h2>
            <ol className="mt-3 space-y-1.5">
              {stats.topReaders.slice(0, 6).map((r) => (
                <li key={r.person_id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">{locale === 'am' ? r.person_am : r.person} <span className="text-slate-400">· {label(BORROWER_KINDS[r.kind], locale)}</span></span>
                  <span className="font-bold text-slate-900">{r.count}</span>
                </li>
              ))}
              {stats.topReaders.length === 0 && <li className="text-sm text-slate-400">{t('Nothing yet.', 'ገና የለም።')}</li>}
            </ol>
          </div>
          <div className="card p-5">
            <h2 className="font-bold text-slate-800 text-sm">{t('What is read, by category', 'የሚነበበው በምድብ')}</h2>
            <div className="mt-3 space-y-2">
              {stats.byCategory.map((c) => (
                <div key={c.category} className="text-xs">
                  <div className="flex justify-between text-slate-600"><span className="truncate">{categoryName(c.category, locale)}</span><span className="font-semibold">{c.count}</span></div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
                </div>
              ))}
              {stats.byCategory.length === 0 && <p className="text-sm text-slate-400">{t('Nothing yet.', 'ገና የለም።')}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Late */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm">{t('Late books', 'ጊዜያቸው ያለፈ መጻሕፍት')} ({late.length})</h2>
          <Link href="/dashboard/library/loans?tab=LATE" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">{t('All loans', 'ሁሉም ውሰቶች')} <ArrowRight size={12} /></Link>
        </div>
        {late.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">{t('No book is late.', 'ጊዜው ያለፈ መጽሐፍ የለም።')}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {late.slice(0, 8).map((l) => (
              <div key={l.id} className="p-3 px-4 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">{bookById.get(l.book_id)?.title ?? '—'} <span className="font-mono text-[11px] text-slate-400">{l.copy_no}</span></div>
                  <div className="text-xs text-slate-500">{locale === 'am' ? l.person_am : l.person} · {label(BORROWER_KINDS[l.borrower_kind], locale)}{l.phone && ` · ${l.phone}`}</div>
                </div>
                <div className="text-xs text-right">
                  <div className="font-bold text-red-600">{t(`${daysLate(l, today)} days late`, `${daysLate(l, today)} ቀን አልፏል`)}</div>
                  <div className="text-slate-500">{t('due', 'የሚመለስበት')} {l.due_date ? formatEthiopianDate(l.due_date, locale) : ''}</div>
                </div>
                {canManage && <button onClick={() => setReturning(l)} className="btn btn-secondary text-xs">{t('Take back', 'ተቀበል')}</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {lending && <LendDialog onClose={() => setLending(false)} onDone={done} />}
      {returning && <ReturnDialog loan={returning === 'pick' ? undefined : returning} onClose={() => setReturning(null)} onDone={done} />}
    </div>
  );
}

function Tile({ icon: Icon, value, label: text, href, tone = 'text-slate-900' }: { icon: React.ElementType; value: React.ReactNode; label: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="card p-5 hover:shadow-md transition">
      <Icon size={18} className="text-slate-400" />
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{text}</div>
    </Link>
  );
}
