'use client';

// Lending desk dialogs: give a copy to a person (take home / read here) and
// take a book back. Used by the library overview, books and loans pages.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Home, Search, UserRound } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { runLibrary, useLibrary } from '@/lib/library/client';
import { BORROWER_KINDS, daysLate, label, type BorrowerOption, type LibraryLoan, type LoanKind } from '@/lib/library/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { findBorrowers, lendBook, returnLoan } from '@/app/dashboard/library/actions';

const plusDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function LendDialog({
  initialCopyId,
  initialPerson,
  onClose,
  onDone,
}: {
  initialCopyId?: string;
  /** From a request: the person is already known */
  initialPerson?: BorrowerOption;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t, locale } = useLang();
  const lib = useLibrary();
  const today = todayIso();
  const [copyQuery, setCopyQuery] = useState('');
  const [copyId, setCopyId] = useState(initialCopyId ?? '');
  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState<BorrowerOption[]>([]);
  const [person, setPerson] = useState<BorrowerOption | null>(initialPerson ?? null);
  const [kind, setKind] = useState<LoanKind>('HOME');
  const [due, setDue] = useState(plusDays(today, lib.settings.loan_days));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const bookById = useMemo(() => new Map(lib.books.map((b) => [b.id, b])), [lib.books]);
  const q = copyQuery.trim().toLowerCase();
  const available = lib.copies
    .filter((c) => c.status === 'AVAILABLE')
    .filter((c) => {
      const b = bookById.get(c.book_id);
      return !q || c.copy_no.toLowerCase().includes(q) || (b && `${b.title} ${b.author} ${b.shelf}`.toLowerCase().includes(q));
    })
    .slice(0, 8);
  const chosen = lib.copies.find((c) => c.id === copyId);
  const chosenBook = chosen ? bookById.get(chosen.book_id) : undefined;

  // People: from the server as the name is typed (demo: the sample borrowers)
  useEffect(() => {
    const term = personQuery.trim();
    if (term.length < 2 || person) return;
    const timer = setTimeout(async () => {
      if (lib.mode !== 'live') {
        const seen = new Map<string, BorrowerOption>();
        for (const l of lib.loans) {
          if (`${l.person} ${l.person_am} ${l.phone}`.toLowerCase().includes(term.toLowerCase()) && !seen.has(l.person_id)) {
            seen.set(l.person_id, { id: l.person_id, name: l.person, name_am: l.person_am, phone: l.phone, reg_no: '', kind: l.borrower_kind, open: 0, overdue: 0 });
          }
        }
        setPeople([...seen.values()]);
        return;
      }
      const res = await findBorrowers(term);
      if (res.ok) setPeople(res.people);
    }, 300);
    return () => clearTimeout(timer);
  }, [personQuery, person, lib.mode, lib.loans]);

  const submit = async (override: boolean) => {
    if (!chosen || !person) return;
    setBusy(true);
    setError('');
    const res = await runLibrary(() => lendBook({ copy_id: chosen.id, person_id: person.id, kind, due_date: due, notes, override }));
    setBusy(false);
    if (!res.ok) {
      if ('needs_override' in res && res.needs_override) setWarning(res.error);
      else setError(res.error);
      return;
    }
    const name = locale === 'am' ? person.name_am : person.name;
    onDone(
      kind === 'HOME'
        ? t(`${chosen.copy_no} given to ${name} until ${formatEthiopianDate(due, 'en')}`, `${chosen.copy_no} ለ${name} እስከ ${formatEthiopianDate(due, 'am')} ተሰጥቷል`)
        : t(`${chosen.copy_no} given to ${name} to read here`, `${chosen.copy_no} ለ${name} እዚሁ እንዲያነቡ ተሰጥቷል`)
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Lend a book', 'መጽሐፍ አውስ')} subtitle={t('Choose the copy, the person, and whether it goes home', 'ቅጂውን፣ ሰውየውንና ወደ ቤት መሄዱን ይምረጡ')} maxWidth="xl">
      <div className="space-y-5 text-sm">
        {/* 1. Copy */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">1. {t('Book', 'መጽሐፍ')}</h4>
          {chosen && chosenBook ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{chosenBook.title}</div>
                <div className="text-xs text-slate-500"><span className="font-mono">{chosen.copy_no}</span>{chosenBook.author && ` · ${chosenBook.author}`}{chosenBook.shelf && ` · ${t('shelf', 'መደርደሪያ')} ${chosenBook.shelf}`}</div>
              </div>
              <button onClick={() => setCopyId('')} className="text-xs text-blue-600 hover:underline shrink-0">{t('Change', 'ቀይር')}</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input autoFocus value={copyQuery} onChange={(e) => setCopyQuery(e.target.value)} placeholder={t('Copy number (LIB-…), title or author', 'የቅጂ ቁጥር (LIB-…)፣ ርዕስ ወይም ደራሲ')} className="form-input pl-9 text-sm" />
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                {available.length === 0 && <div className="p-3 text-xs text-slate-400">{t('No copy on the shelf matches.', 'መደርደሪያ ላይ የሚዛመድ ቅጂ የለም።')}</div>}
                {available.map((c) => {
                  const b = bookById.get(c.book_id);
                  return (
                    <button key={c.id} onClick={() => setCopyId(c.id)} className="w-full text-left p-2.5 hover:bg-slate-50 flex items-center gap-3">
                      <BookOpen size={15} className="text-slate-400 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-800 truncate">{b?.title ?? '—'}</span>
                        <span className="block text-[11px] text-slate-500"><span className="font-mono">{c.copy_no}</span>{b?.shelf && ` · ${b.shelf}`}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* 2. Person */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">2. {t('Who takes it', 'የሚወስደው')}</h4>
          {person ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{locale === 'am' ? person.name_am : person.name}</div>
                <div className="text-xs text-slate-500">
                  {person === initialPerson ? t('Asked for this book', 'ይህን መጽሐፍ ጠይቀዋል') : label(BORROWER_KINDS[person.kind], locale)}{person.reg_no && ` · ${person.reg_no}`}{person.phone && ` · ${person.phone}`}
                  {person.open > 0 && ` · ${t(`${person.open} book(s) at home`, `${person.open} መጽሐፍ ቤት አለ`)}`}
                </div>
                {person.overdue > 0 && <div className="text-xs font-semibold text-red-600">{t(`${person.overdue} late book(s)`, `${person.overdue} ያለፈበት መጽሐፍ`)}</div>}
              </div>
              <button onClick={() => { setPerson(null); setWarning(''); }} className="text-xs text-blue-600 hover:underline shrink-0">{t('Change', 'ቀይር')}</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} placeholder={t('Name, phone or student number', 'ስም፣ ስልክ ወይም የተማሪ ቁጥር')} className="form-input pl-9 text-sm" />
              </div>
              {personQuery.trim().length >= 2 && (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                  {people.length === 0 && <div className="p-3 text-xs text-slate-400">{t('Nobody found yet…', 'ገና አልተገኘም…')}</div>}
                  {people.map((p) => (
                    <button key={p.id} onClick={() => { setPerson(p); setWarning(''); }} className="w-full text-left p-2.5 hover:bg-slate-50 flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-800">{locale === 'am' ? p.name_am : p.name}</span>
                        <span className="block text-[11px] text-slate-500">{[p.reg_no, p.phone].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="badge badge-info text-[10px] shrink-0">{label(BORROWER_KINDS[p.kind], locale)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* 3. How */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">3. {t('Where it will be read', 'የሚነበብበት')}</h4>
          <div className="grid grid-cols-2 gap-2">
            {(['HOME', 'READING'] as LoanKind[]).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setWarning(''); }}
                className={`rounded-xl border p-3 text-left ${kind === k ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  {k === 'HOME' ? <Home size={15} /> : <BookOpen size={15} />} {k === 'HOME' ? t('Take home', 'ወደ ቤት') : t('Read here', 'እዚሁ ማንበብ')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{k === 'HOME' ? t('Brought back by a date', 'በተወሰነ ቀን ይመለሳል') : t('In the library room, given back today', 'በቤተ መጻሕፍቱ ክፍል፣ ዛሬ ይመለሳል')}</div>
              </button>
            ))}
          </div>
          {kind === 'HOME' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">{t('Bring back by', 'የሚመለስበት')}</label>
              <input type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} className="form-input text-sm w-auto" />
              <span className="text-xs text-slate-500">{formatEthiopianDate(due, locale)}</span>
            </div>
          )}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Note (optional)', 'ማስታወሻ (ካለ)')} className="form-input text-sm" />
        </section>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</div>}
        {warning && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
            <div className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}</div>
            <button onClick={() => submit(true)} disabled={busy} className="btn btn-secondary text-xs">{t('Lend anyway', 'ቢሆንም አውስ')}</button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={() => submit(false)} disabled={busy || !chosen || !person || (kind === 'HOME' && !due)} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Check size={14} /> {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Lend', 'አውስ')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ReturnDialog({ loan: given, onClose, onDone }: { loan?: LibraryLoan; onClose: () => void; onDone: (message: string) => void }) {
  const { t, locale } = useLang();
  const lib = useLibrary();
  const today = todayIso();
  const [query, setQuery] = useState('');
  const [loanId, setLoanId] = useState(given?.id ?? '');
  const [condition, setCondition] = useState<'GOOD' | 'FAIR' | 'DAMAGED'>('GOOD');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titleOf = (bookId: string) => lib.books.find((b) => b.id === bookId)?.title ?? '—';
  const open = lib.loans.filter((l) => l.status === 'OUT');
  const q = query.trim().toLowerCase();
  // A full copy number picks the loan at once
  const exact = q ? open.find((l) => l.copy_no.toLowerCase() === q) : undefined;
  const matches = open.filter((l) => !q || `${l.copy_no} ${l.person} ${l.person_am} ${titleOf(l.book_id)}`.toLowerCase().includes(q)).slice(0, 8);
  const loan = lib.loans.find((l) => l.id === (loanId || exact?.id));

  const submit = async () => {
    if (!loan) return;
    setBusy(true);
    setError('');
    const res = await runLibrary(() => returnLoan(loan.id, condition, note));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t(`${loan.copy_no} is back${condition === 'DAMAGED' ? ' (marked damaged)' : ''}`, `${loan.copy_no} ተመልሷል${condition === 'DAMAGED' ? ' (እንደተበላሸ ተመዝግቧል)' : ''}`));
  };

  const late = loan ? daysLate(loan, today) : 0;
  return (
    <Modal isOpen onClose={onClose} title={t('Take a book back', 'መጽሐፍ ተቀበል')} subtitle={t('Type the copy number on the book, or find the person', 'በመጽሐፉ ላይ ያለውን የቅጂ ቁጥር ይጻፉ፣ ወይም ሰውየውን ይፈልጉ')}>
      <div className="space-y-4 text-sm">
        {!given && !loan && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('LIB-2026-0001, name or title', 'LIB-2026-0001፣ ስም ወይም ርዕስ')} className="form-input pl-9 text-sm font-mono" />
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
              {matches.length === 0 && <div className="p-3 text-xs text-slate-400">{t('No lent book matches.', 'የሚዛመድ የተዋሰ መጽሐፍ የለም።')}</div>}
              {matches.map((l) => (
                <button key={l.id} onClick={() => setLoanId(l.id)} className="w-full text-left p-2.5 hover:bg-slate-50">
                  <div className="font-medium text-slate-800 truncate">{titleOf(l.book_id)}</div>
                  <div className="text-[11px] text-slate-500">
                    <span className="font-mono">{l.copy_no}</span> · {locale === 'am' ? l.person_am : l.person} · {l.kind === 'HOME' ? t('at home', 'ቤት') : t('reading here', 'እዚሁ')}
                    {daysLate(l, today) > 0 && <span className="text-red-600 font-semibold"> · {t(`${daysLate(l, today)} days late`, `${daysLate(l, today)} ቀን አልፏል`)}</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {loan && (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-semibold text-slate-900">{titleOf(loan.book_id)}</div>
              <div className="text-xs text-slate-500">
                <span className="font-mono">{loan.copy_no}</span> · {locale === 'am' ? loan.person_am : loan.person} ({label(BORROWER_KINDS[loan.borrower_kind], locale)})
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {t('Given', 'የተሰጠው')} {formatEthiopianDate(loan.issued_at.slice(0, 10), locale)}
                {loan.due_date && <> · {t('due', 'የሚመለስበት')} {formatEthiopianDate(loan.due_date, locale)}</>}
              </div>
              {late > 0 && <div className="text-xs font-semibold text-red-600 mt-0.5">{t(`${late} days late`, `${late} ቀን አልፏል`)}</div>}
              {!given && <button onClick={() => { setLoanId(''); setQuery(''); }} className="mt-1 text-xs text-blue-600 hover:underline">{t('Another book', 'ሌላ መጽሐፍ')}</button>}
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1.5">{t('How is the book?', 'መጽሐፉ እንዴት ነው?')}</div>
              <div className="grid grid-cols-3 gap-2">
                {([['GOOD', t('Fine', 'ደህና')], ['FAIR', t('Worn', 'ያረጀ')], ['DAMAGED', t('Damaged', 'የተበላሸ')]] as ['GOOD' | 'FAIR' | 'DAMAGED', string][]).map(([c, l]) => (
                  <button key={c} onClick={() => setCondition(c)} className={`rounded-lg border py-2 text-xs font-semibold ${condition === c ? (c === 'DAMAGED' ? 'border-red-500 bg-red-50 text-red-700' : 'border-blue-500 bg-blue-50 text-blue-700') : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                ))}
              </div>
              {condition === 'DAMAGED' && <p className="text-[11px] text-red-600 mt-1">{t('A damaged copy leaves the shelf until it is repaired.', 'የተበላሸ ቅጂ እስኪጠገን ከመደርደሪያ ይወጣል።')}</p>}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)', 'ማስታወሻ (ካለ)')} className="form-input text-sm" />
          </>
        )}

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={submit} disabled={busy || !loan} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Check size={14} /> {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Take back', 'ተቀበል')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
