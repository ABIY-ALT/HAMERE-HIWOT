'use client';

// Import the library's book list from the template: one title per row with
// its number of copies (lib/import/books). Each copy gets its own LIB- number.

import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { runLibrary, useLibrary } from '@/lib/library/client';
import { BOOK_CATEGORIES, label } from '@/lib/library/types';
import { parseCsv } from '@/lib/import/csv';
import { BOOK_TEMPLATE_EXAMPLE, BOOK_TEMPLATE_HEADERS, MAX_BOOK_IMPORT, parseBookImport, type BookImportRow } from '@/lib/import/books';
import { downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { importBooks } from '@/app/dashboard/library/actions';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function BookImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t, locale } = useLang();
  const { books } = useLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BookImportRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () =>
    downloadXlsx('የመጻሕፍት_ማስገቢያ_ቅጽ', [BOOK_TEMPLATE_HEADERS.map(headerCell), BOOK_TEMPLATE_EXAMPLE], { sheet: 'መጻሕፍት', widths: [34, 24, 22, 12, 12, 10, 10, 18, 18, 20, 12, 16, 36] });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setRows(null);
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt');
    if (!isCsv && !lower.endsWith('.xlsx')) return setError(t('Choose the filled-in template (.xlsx) or a .csv file.', 'የተሞላውን ቅጽ (.xlsx) ወይም .csv ፋይል ይምረጡ።'));
    if (file.size > MAX_FILE_BYTES) return setError(t('The file is larger than 5 MB.', 'ፋይሉ ከ5 ሜባ በላይ ነው።'));
    setBusy(true);
    try {
      let data: unknown[][];
      if (isCsv) data = parseCsv(await file.text());
      else {
        const { readSheet } = await import('read-excel-file/universal');
        data = (await readSheet(file)) as unknown[][];
      }
      const result = parseBookImport(data, books.map((b) => ({ title: b.title, author: b.author })), t);
      if (!result.ok) setError(t('The “Title” column was not found. Download the template and use it.', '«ርዕስ» የሚል ዓምድ አልተገኘም። ቅጹን አውርደው ይጠቀሙ።'));
      else if (result.rows.length === 0) setError(t('No books found below the example row.', 'ከምሳሌው ረድፍ በታች መጽሐፍ አልተገኘም።'));
      else if (result.tooMany) setError(t(`Too many rows (${result.rows.length}). Import at most ${MAX_BOOK_IMPORT} at a time.`, `ረድፎቹ በጣም ብዙ ናቸው (${result.rows.length})። በአንድ ጊዜ እስከ ${MAX_BOOK_IMPORT} ብቻ ያስገቡ።`));
      else setRows(result.rows);
    } catch {
      setError(t('This file could not be read.', 'ፋይሉ ሊነበብ አልቻለም።'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const valid = rows?.filter((r) => r.draft) ?? [];
  const skipped = rows?.filter((r) => !r.draft) ?? [];
  const copies = valid.reduce((s, r) => s + r.copies, 0);

  const submit = async () => {
    setBusy(true);
    let message = '';
    const res = await runLibrary(async () => {
      const r = await importBooks(valid.map((x) => x.draft!));
      if (r.ok) message = t(`${r.books} books with ${r.copies} copies added`, `${r.books} መጻሕፍት ከ${r.copies} ቅጂዎች ጋር ገብተዋል`);
      return r.ok ? ({ ok: true } as const) : r;
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(message);
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Import books', 'መጻሕፍትን አስገባ')} subtitle={t('1. Download the template → 2. Fill it in → 3. Upload it', '1. ቅጹን ያውርዱ → 2. ይሙሉት → 3. ይስቀሉት')} maxWidth="2xl">
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-slate-200 p-4 space-y-2">
          <button type="button" onClick={downloadTemplate} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
            <Download size={14} /> {t('Download template (.xlsx)', 'ቅጽ አውርድ (.xlsx)')}
          </button>
          <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">
            <li>{t('One title per row; only the title is required. “Copies” is how many of that book you have (1 if empty).', 'በአንድ ረድፍ አንድ ርዕስ፤ የሚያስፈልገው ርዕሱ ብቻ ነው። «የቅጂዎች ብዛት» ያለዎት የዚያ መጽሐፍ ብዛት ነው (ባዶ ከሆነ 1)።')}</li>
            <li>{t('Categories: ', 'ምድቦች፦ ')}{Object.values(BOOK_CATEGORIES).map((l) => label(l, locale)).join('، ')}</li>
            <li>{t('Every copy gets its own number (LIB-…) to write inside the book.', 'እያንዳንዱ ቅጂ በመጽሐፉ ውስጥ የሚጻፍ የራሱ ቁጥር (LIB-…) ያገኛል።')}</li>
          </ul>
        </div>

        <label htmlFor="book-file" className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30">
          <FileSpreadsheet size={26} className="text-slate-400" />
          <span className="text-xs text-slate-600">{busy && !rows ? t('Reading file…', 'ፋይሉን በማንበብ ላይ…') : fileName || t('Choose the filled-in template', 'የተሞላውን ቅጽ ይምረጡ')}</span>
        </label>
        <input id="book-file" ref={inputRef} type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm" role="alert"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</div>}

        {rows && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-semibold text-emerald-700">{valid.length} {t('books', 'መጻሕፍት')} · {copies} {t('copies ready', 'ቅጂዎች ዝግጁ')}</span>
              {skipped.length > 0 && <span className="font-semibold text-red-600">{skipped.length} {t('skipped', 'ይዘለላሉ')}</span>}
            </div>
            <div className="table-container rounded-none border-0 max-h-[22rem] overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t('Row', 'ረድፍ')}</th>
                    <th>{t('Title', 'ርዕስ')}</th>
                    <th className="text-center">{t('Copies', 'ቅጂ')}</th>
                    <th>{t('Result', 'ውጤት')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className={r.draft ? '' : 'bg-red-50/50'}>
                      <td className="text-xs text-slate-400 font-mono">{r.rowNumber}</td>
                      <td>
                        <div className="font-medium text-slate-900">{r.title || '—'}</div>
                        {r.author && <div className="text-[11px] text-slate-500">{r.author}</div>}
                      </td>
                      <td className="text-center text-xs">{r.copies}</td>
                      <td className="text-xs">
                        {r.draft ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={13} /> {t('OK', 'ተስማሚ')}</span> : <ul className="text-red-700 space-y-0.5">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                        {r.warnings.length > 0 && <ul className="text-amber-700 space-y-0.5 mt-0.5">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button type="button" onClick={submit} disabled={busy || valid.length === 0} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Upload size={14} /> {busy && rows ? t('Saving…', 'በመመዝገብ ላይ…') : t(`Add ${valid.length} books`, `${valid.length} መጻሕፍት አስገባ`)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
