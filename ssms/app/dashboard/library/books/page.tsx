'use client';

// The catalogue: every title with its copies — where each copy is (shelf,
// at someone's home, being read here, damaged…), who has it, and how often
// the book has been read. Add books one by one or import them from Excel.

import React, { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { AdminModeNotice, AdminToast } from '@/components/admin/AdminModeNotice';
import { LendDialog } from '@/components/library/LoanDialogs';
import { BookImportDialog } from '@/components/library/BookImportDialog';
import { runLibrary, useLibrary } from '@/lib/library/client';
import {
  BOOK_AUDIENCES, BOOK_CATEGORIES, BOOK_LANGUAGES, BORROWER_KINDS, COPY_CONDITIONS, COPY_SOURCES, COPY_STATUS,
  categoryName, daysLate, label, type BookAudience, type BookLanguage, type CopyCondition, type CopySource, type LibraryBook, type LibraryCopy,
} from '@/lib/library/types';
import { cell, downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { addCopies, deleteBook, saveBook, updateCopy, type BookInput, type CopiesInput } from '../actions';

const EMPTY_BOOK: BookInput = {
  title: '', subtitle: '', author: '', category: 'GENERAL', language: 'AM', audience: 'ALL', isbn: '', publisher: '', published_year: '', shelf: '', description: '', is_active: true,
};
const NEW_COPIES: CopiesInput = { count: 1, source: 'PURCHASE', donor: '', acquired_on: '', condition: 'GOOD' };

export default function LibraryBooksPage() {
  const { t, locale } = useLang();
  const { can } = useAuth();
  const canManage = can('LIBRARY_MANAGE');
  const lib = useLibrary();
  const today = todayIso();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [language, setLanguage] = useState('ALL');
  const [shelfState, setShelfState] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [showRetired, setShowRetired] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ id: string | null; book: BookInput; copies: CopiesInput } | null>(null);
  const [importing, setImporting] = useState(false);
  const [lendCopy, setLendCopy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const say = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const copiesOf = useMemo(() => {
    const m = new Map<string, LibraryCopy[]>();
    for (const c of lib.copies) m.set(c.book_id, [...(m.get(c.book_id) ?? []), c]);
    return m;
  }, [lib.copies]);
  const readsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lib.loans) m.set(l.book_id, (m.get(l.book_id) ?? 0) + 1);
    return m;
  }, [lib.loans]);
  const openLoanOf = useMemo(() => new Map(lib.loans.filter((l) => l.status === 'OUT').map((l) => [l.copy_id, l])), [lib.loans]);

  const needle = search.trim().toLowerCase();
  const rows = lib.books
    .filter((b) => showRetired || b.is_active)
    .filter((b) => category === 'ALL' || b.category === category)
    .filter((b) => language === 'ALL' || b.language === language)
    .filter((b) => {
      if (shelfState === 'ALL') return true;
      const free = (copiesOf.get(b.id) ?? []).filter((c) => c.status === 'AVAILABLE').length;
      return shelfState === 'IN' ? free > 0 : free === 0;
    })
    .filter((b) => !needle || [b.title, b.subtitle, b.author, b.isbn, b.shelf, b.publisher, ...(copiesOf.get(b.id) ?? []).map((c) => c.copy_no)].some((v) => v.toLowerCase().includes(needle)));

  const book = lib.books.find((b) => b.id === openId) ?? null;

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');
    const res = await runLibrary(() => saveBook(form.id, form.book, form.id ? undefined : form.copies));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setForm(null);
    say('success', form.id ? t('Book saved', 'መጽሐፉ ተቀምጧል') : t('Book added', 'መጽሐፉ ተጨምሯል'));
  };

  const exportExcel = async () => {
    const header = [t('Title', 'ርዕስ'), t('Author', 'ደራሲ'), t('Category', 'ምድብ'), t('Language', 'ቋንቋ'), t('Shelf', 'መደርደሪያ'), t('Copies', 'ቅጂዎች'), t('On the shelf', 'መደርደሪያ ላይ'), t('Times given', 'የተሰጠበት ብዛት'), t('Copy numbers', 'የቅጂ ቁጥሮች')].map(headerCell);
    const body = rows.map((b) => {
      const cs = copiesOf.get(b.id) ?? [];
      return [cell(b.title), cell(b.author), categoryName(b.category, locale), label(BOOK_LANGUAGES[b.language], locale), b.shelf, cs.length, cs.filter((c) => c.status === 'AVAILABLE').length, readsOf.get(b.id) ?? 0, cs.map((c) => c.copy_no).join(', ')];
    });
    await downloadXlsx(`library_books_${today}`, [header, ...body], { sheet: 'Books', widths: [36, 24, 22, 12, 10, 8, 10, 10, 50] });
  };

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Books', 'መጻሕፍት')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Every title with its numbered copies and where each one is', 'እያንዳንዱ ርዕስ ከተቆጠሩ ቅጂዎቹና ያሉበት ቦታ ጋር')}</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button onClick={exportExcel} disabled={rows.length === 0} className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> {t('Export Excel', 'ወደ ኤክሴል')}</button>
          {canManage && <button onClick={() => setImporting(true)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5"><Upload size={14} /> {t('Import from Excel', 'ከኤክሴል አስገባ')}</button>}
          {canManage && (
            <button onClick={() => { setError(''); setForm({ id: null, book: EMPTY_BOOK, copies: NEW_COPIES }); }} className="btn btn-primary text-xs inline-flex items-center gap-1.5">
              <Plus size={14} /> {t('Add book', 'መጽሐፍ ጨምር')}
            </button>
          )}
        </div>
      </div>

      <AdminModeNotice mode={lib.mode} error={lib.error} />

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Title, author, shelf, copy number…', 'ርዕስ፣ ደራሲ፣ መደርደሪያ፣ የቅጂ ቁጥር…')} className="form-input pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('All categories', 'ሁሉም ምድቦች')}</option>
              {Object.entries(BOOK_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('All languages', 'ሁሉም ቋንቋዎች')}</option>
              {Object.entries(BOOK_LANGUAGES).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
            </select>
            <select value={shelfState} onChange={(e) => setShelfState(e.target.value as typeof shelfState)} className="form-input text-xs py-1.5 px-3">
              <option value="ALL">{t('On the shelf or not', 'መደርደሪያ ላይም ሆነ አልሆነ')}</option>
              <option value="IN">{t('A copy is on the shelf', 'ቅጂ መደርደሪያ ላይ አለ')}</option>
              <option value="OUT">{t('No copy on the shelf', 'መደርደሪያ ላይ ቅጂ የለም')}</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> {t('Not in use too', 'ያልተሠራባቸውንም')}</label>
            <span className="text-xs text-slate-400">{rows.length} {t('titles', 'ርዕሶች')}</span>
          </div>
        </div>
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Title', 'ርዕስ')}</th>
                <th>{t('Category', 'ምድብ')}</th>
                <th>{t('Shelf', 'መደርደሪያ')}</th>
                <th className="text-center">{t('On the shelf', 'መደርደሪያ ላይ')}</th>
                <th className="text-center">{t('Times given', 'የተሰጠበት')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const cs = (copiesOf.get(b.id) ?? []).filter((c) => c.status !== 'WITHDRAWN');
                const free = cs.filter((c) => c.status === 'AVAILABLE').length;
                return (
                  <tr key={b.id} className={`cursor-pointer ${b.is_active ? '' : 'opacity-60'}`} onClick={() => setOpenId(b.id)}>
                    <td>
                      <div className="font-semibold text-slate-900">{b.title}</div>
                      <div className="text-[11px] text-slate-500">{[b.author, label(BOOK_LANGUAGES[b.language], locale)].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="text-xs text-slate-600">{categoryName(b.category, locale)}</td>
                    <td className="text-xs font-mono text-slate-600">{b.shelf || '—'}</td>
                    <td className="text-center">
                      <span className={`text-sm font-bold ${free ? 'text-emerald-700' : 'text-red-600'}`}>{free}</span>
                      <span className="text-xs text-slate-400"> / {cs.length}</span>
                    </td>
                    <td className="text-center text-sm text-slate-700">{readsOf.get(b.id) ?? 0}</td>
                  </tr>
                );
              })}
              {lib.mode !== 'loading' && rows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-10">
                  {lib.books.length ? t('No book matches.', 'የሚዛመድ መጽሐፍ የለም።') : t('No books yet — add them one by one or import the list from Excel.', 'ገና መጽሐፍ የለም — አንድ በአንድ ይጨምሩ ወይም ዝርዝሩን ከኤክሴል ያስገቡ።')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* One book */}
      {book && (
        <BookView
          book={book}
          copies={copiesOf.get(book.id) ?? []}
          canManage={canManage}
          openLoanOf={openLoanOf}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setError('');
            setForm({ id: book.id, book: { ...book, published_year: book.published_year ?? '' }, copies: NEW_COPIES });
          }}
          onLend={(copyId) => setLendCopy(copyId)}
          say={say}
        />
      )}

      {/* Add / edit */}
      <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? t('Edit book', 'መጽሐፍ አርትዕ') : t('Add book', 'መጽሐፍ ጨምር')} maxWidth="xl">
        {form && (
          <form onSubmit={saveForm} className="space-y-4 text-sm">
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('Title', 'ርዕስ') + ' *'} wide>
                <input required value={form.book.title} onChange={(e) => setForm({ ...form, book: { ...form.book, title: e.target.value } })} className="form-input text-sm" />
              </Field>
              <Field label={t('Author', 'ደራሲ')}>
                <input value={form.book.author} onChange={(e) => setForm({ ...form, book: { ...form.book, author: e.target.value } })} className="form-input text-sm" />
              </Field>
              <Field label={t('Category', 'ምድብ')}>
                <select value={form.book.category} onChange={(e) => setForm({ ...form, book: { ...form.book, category: e.target.value } })} className="form-input text-sm">
                  {Object.entries(BOOK_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
                </select>
              </Field>
              <Field label={t('Language', 'ቋንቋ')}>
                <select value={form.book.language} onChange={(e) => setForm({ ...form, book: { ...form.book, language: e.target.value as BookLanguage } })} className="form-input text-sm">
                  {Object.entries(BOOK_LANGUAGES).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
                </select>
              </Field>
              <Field label={t('For', 'ለማን')}>
                <select value={form.book.audience} onChange={(e) => setForm({ ...form, book: { ...form.book, audience: e.target.value as BookAudience } })} className="form-input text-sm">
                  {Object.entries(BOOK_AUDIENCES).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
                </select>
              </Field>
              <Field label={t('Shelf', 'መደርደሪያ')}>
                <input value={form.book.shelf} onChange={(e) => setForm({ ...form, book: { ...form.book, shelf: e.target.value } })} placeholder="A-1" className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Publisher', 'አሳታሚ')}>
                <input value={form.book.publisher} onChange={(e) => setForm({ ...form, book: { ...form.book, publisher: e.target.value } })} className="form-input text-sm" />
              </Field>
              <Field label={t('Year', 'ዓመት')}>
                <input value={String(form.book.published_year ?? '')} onChange={(e) => setForm({ ...form, book: { ...form.book, published_year: e.target.value as unknown as number } })} inputMode="numeric" className="form-input text-sm" />
              </Field>
              <Field label="ISBN">
                <input value={form.book.isbn} onChange={(e) => setForm({ ...form, book: { ...form.book, isbn: e.target.value } })} className="form-input text-sm font-mono" />
              </Field>
              <Field label={t('Description', 'መግለጫ')} wide>
                <textarea rows={2} value={form.book.description} onChange={(e) => setForm({ ...form, book: { ...form.book, description: e.target.value } })} className="form-input text-sm" />
              </Field>
            </div>
            {form.id ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.book.is_active} onChange={(e) => setForm({ ...form, book: { ...form.book, is_active: e.target.checked } })} />
                {t('In use (shown in the catalogue)', 'በአገልግሎት ላይ (በዝርዝሩ ይታያል)')}
              </label>
            ) : (
              <CopiesFields value={form.copies} onChange={(copies) => setForm({ ...form, copies })} />
            )}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setForm(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">{busy ? t('Saving…', 'በማስቀመጥ ላይ…') : t('Save', 'አስቀምጥ')}</button>
            </div>
          </form>
        )}
      </Modal>

      {importing && <BookImportDialog onClose={() => setImporting(false)} onDone={(text) => { setImporting(false); say('success', text); }} />}
      {lendCopy && <LendDialog initialCopyId={lendCopy} onClose={() => setLendCopy(null)} onDone={(text) => { setLendCopy(null); say('success', text); }} />}
    </div>
  );
}

function BookView({
  book, copies, canManage, openLoanOf, onClose, onEdit, onLend, say,
}: {
  book: LibraryBook;
  copies: LibraryCopy[];
  canManage: boolean;
  openLoanOf: Map<string, ReturnType<typeof useLibrary>['loans'][number]>;
  onClose: () => void;
  onEdit: () => void;
  onLend: (copyId: string) => void;
  say: (kind: 'success' | 'error', text: string) => void;
}) {
  const { t, locale } = useLang();
  const lib = useLibrary();
  const today = todayIso();
  const [adding, setAdding] = useState<CopiesInput | null>(null);
  const [editingCopy, setEditingCopy] = useState<LibraryCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const history = lib.loans.filter((l) => l.book_id === book.id);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    const res = await runLibrary(action as () => Promise<{ ok: true } | { ok: false; error: string }>);
    setBusy(false);
    if (!res.ok) return say('error', res.error);
    say('success', success);
    setAdding(null);
    setEditingCopy(null);
  };

  return (
    <Modal isOpen onClose={onClose} title={book.title} subtitle={[book.author, categoryName(book.category, locale), book.shelf && `${t('shelf', 'መደርደሪያ')} ${book.shelf}`].filter(Boolean).join(' · ')} maxWidth="2xl">
      <div className="space-y-5 text-sm">
        {book.description && <p className="text-xs text-slate-600 whitespace-pre-line">{book.description}</p>}

        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('Copies', 'ቅጂዎች')} ({copies.length})</h4>
            {canManage && !adding && <button onClick={() => setAdding(NEW_COPIES)} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"><Plus size={12} /> {t('Add copies', 'ቅጂ ጨምር')}</button>}
          </div>
          {adding && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-2 space-y-2">
              <CopiesFields value={adding} onChange={setAdding} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(null)} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
                <button onClick={() => run(() => addCopies(book.id, adding), t('Copies added', 'ቅጂዎች ተጨምረዋል'))} disabled={busy || Number(adding.count) < 1} className="btn btn-primary text-xs disabled:opacity-50">{t('Add', 'ጨምር')}</button>
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {copies.length === 0 && <div className="p-3 text-xs text-slate-400">{t('No copies yet.', 'ገና ቅጂ የለም።')}</div>}
            {copies.map((c) => {
              const loan = openLoanOf.get(c.id);
              const late = loan ? daysLate(loan, today) : 0;
              return (
                <div key={c.id} className="p-3 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-slate-700 w-28">{c.copy_no}</span>
                  <span className={COPY_STATUS[c.status].badge + ' text-[11px]'}>{label(COPY_STATUS[c.status].label, locale)}</span>
                  <span className="text-xs text-slate-500 flex-1 min-w-0">
                    {loan ? (
                      <>
                        {locale === 'am' ? loan.person_am : loan.person} ({label(BORROWER_KINDS[loan.borrower_kind], locale)})
                        {loan.due_date && <> · {t('due', 'የሚመለስበት')} {formatEthiopianDate(loan.due_date, locale)}</>}
                        {late > 0 && <span className="text-red-600 font-semibold"> · {t(`${late} days late`, `${late} ቀን አልፏል`)}</span>}
                      </>
                    ) : (
                      <>{label(COPY_CONDITIONS[c.condition], locale)} · {label(COPY_SOURCES[c.source], locale)}{c.donor && ` (${c.donor})`}{c.notes && ` · ${c.notes}`}</>
                    )}
                  </span>
                  {canManage && c.status === 'AVAILABLE' && <button onClick={() => onLend(c.id)} className="btn btn-primary text-[11px] py-1 px-2">{t('Lend', 'አውስ')}</button>}
                  {canManage && !loan && <button onClick={() => setEditingCopy(c)} className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" title={t('Change', 'ቀይር')}><Pencil size={13} /></button>}
                </div>
              );
            })}
          </div>
          {editingCopy && (
            <CopyEditor
              copy={editingCopy}
              busy={busy}
              onCancel={() => setEditingCopy(null)}
              onSave={(u) => run(() => updateCopy(editingCopy.id, u), t('Copy saved', 'ቅጂው ተቀምጧል'))}
            />
          )}
        </section>

        <section>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">{t('Who read it', 'ያነበቡት')} ({history.length})</h4>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {history.length === 0 && <div className="p-3 text-xs text-slate-400">{t('Nobody yet.', 'ገና ማንም።')}</div>}
            {history.map((l) => (
              <div key={l.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-700">{locale === 'am' ? l.person_am : l.person} <span className="text-slate-400">· {label(BORROWER_KINDS[l.borrower_kind], locale)}</span></span>
                <span className="text-slate-500 text-right">
                  {l.kind === 'HOME' ? t('home', 'ቤት') : t('read here', 'እዚሁ')} · {formatEthiopianDate(l.issued_at.slice(0, 10), locale)}
                  {l.status === 'OUT' ? <span className="text-blue-600"> · {t('still out', 'ገና አልተመለሰም')}</span> : l.status === 'LOST' ? <span className="text-red-600"> · {t('lost', 'ጠፍቷል')}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        {canManage && (
          <div className="flex justify-between gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={async () => {
                if (!window.confirm(t('Remove this book and its copies? Only possible while it was never lent.', 'ይህ መጽሐፍና ቅጂዎቹ ይሰረዙ? የሚቻለው ተውሶ የማያውቅ ከሆነ ብቻ ነው።'))) return;
                await run(() => deleteBook(book.id), t('Book removed', 'መጽሐፉ ተሰርዟል'));
                onClose();
              }}
              disabled={busy || history.length > 0}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
              title={history.length ? t('It has been lent — switch it off instead', 'ተውሷል — ከአገልግሎት ያውጡት') : ''}
            >
              <Trash2 size={13} /> {t('Remove', 'ሰርዝ')}
            </button>
            <button onClick={onEdit} className="btn btn-primary text-xs inline-flex items-center gap-1.5"><Pencil size={13} /> {t('Edit book', 'መጽሐፍ አርትዕ')}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CopiesFields({ value, onChange }: { value: CopiesInput; onChange: (v: CopiesInput) => void }) {
  const { t, locale } = useLang();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Field label={t('Copies', 'የቅጂዎች ብዛት')}>
        <input type="number" min={0} max={200} value={String(value.count)} onChange={(e) => onChange({ ...value, count: e.target.value as unknown as number })} className="form-input text-sm" />
      </Field>
      <Field label={t('How we got them', 'የተገኙበት')}>
        <select value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value as CopySource })} className="form-input text-sm">
          {Object.entries(COPY_SOURCES).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
        </select>
      </Field>
      {value.source === 'DONATION' ? (
        <Field label={t('Donor', 'ለጋሽ')}>
          <input value={value.donor} onChange={(e) => onChange({ ...value, donor: e.target.value })} className="form-input text-sm" />
        </Field>
      ) : (
        <Field label={t('Condition', 'ሁኔታ')}>
          <select value={value.condition} onChange={(e) => onChange({ ...value, condition: e.target.value as CopyCondition })} className="form-input text-sm">
            {Object.entries(COPY_CONDITIONS).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
          </select>
        </Field>
      )}
      <Field label={t('Received on', 'የገቡበት ቀን')}>
        <input type="date" value={value.acquired_on} onChange={(e) => onChange({ ...value, acquired_on: e.target.value })} className="form-input text-sm" />
      </Field>
    </div>
  );
}

function CopyEditor({ copy, busy, onCancel, onSave }: {
  copy: LibraryCopy;
  busy: boolean;
  onCancel: () => void;
  onSave: (u: { status: 'AVAILABLE' | 'LOST' | 'DAMAGED' | 'WITHDRAWN'; condition: CopyCondition; notes: string }) => void;
}) {
  const { t, locale } = useLang();
  const [status, setStatus] = useState<'AVAILABLE' | 'LOST' | 'DAMAGED' | 'WITHDRAWN'>(copy.status === 'ON_LOAN' || copy.status === 'IN_LIBRARY' ? 'AVAILABLE' : copy.status);
  const [condition, setCondition] = useState<CopyCondition>(copy.condition);
  const [notes, setNotes] = useState(copy.notes);
  return (
    <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-700"><BookOpen size={12} className="inline mr-1" /> {copy.copy_no}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="form-input text-sm">
          {(['AVAILABLE', 'DAMAGED', 'LOST', 'WITHDRAWN'] as const).map((s) => <option key={s} value={s}>{label(COPY_STATUS[s].label, locale)}</option>)}
        </select>
        <select value={condition} onChange={(e) => setCondition(e.target.value as CopyCondition)} className="form-input text-sm">
          {Object.entries(COPY_CONDITIONS).map(([k, l]) => <option key={k} value={k}>{label(l, locale)}</option>)}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Note', 'ማስታወሻ')} className="form-input text-sm" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
        <button onClick={() => onSave({ status, condition, notes })} disabled={busy} className="btn btn-primary text-xs disabled:opacity-50">{t('Save', 'አስቀምጥ')}</button>
      </div>
    </div>
  );
}

function Field({ label: text, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{text}</label>
      {children}
    </div>
  );
}
