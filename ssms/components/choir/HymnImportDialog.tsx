'use client';

// Import hymns from the template: 1. download it, 2. fill it in (lyrics on
// several lines in one cell: Alt+Enter), 3. upload — a preview shows what will
// be added and what is skipped (lib/import/hymns).

import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { runChoir, useChoir } from '@/lib/choir/client';
import { HYMN_CATEGORIES } from '@/lib/choir/types';
import { parseCsv } from '@/lib/import/csv';
import { HYMN_TEMPLATE_EXAMPLE, HYMN_TEMPLATE_HEADERS, MAX_HYMN_IMPORT, parseHymnImport, type HymnImportRow } from '@/lib/import/hymns';
import { downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { importHymns } from '@/app/dashboard/sacred-arts/actions';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function HymnImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t, locale } = useLang();
  const { hymns } = useChoir();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<HymnImportRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const downloadTemplate = () =>
    downloadXlsx('መዝሙር_ማስገቢያ_ቅጽ', [HYMN_TEMPLATE_HEADERS.map(headerCell), HYMN_TEMPLATE_EXAMPLE], { sheet: 'መዝሙራት', widths: [34, 30, 14, 16, 60, 34] });

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
      const result = parseHymnImport(data, hymns.map((h) => h.title_am), t);
      if (!result.ok) setError(t('The “Title (Amharic)” column was not found. Download the template and use it.', '«ርዕስ (አማርኛ)» የሚል ዓምድ አልተገኘም። ቅጹን አውርደው ይጠቀሙ።'));
      else if (result.rows.length === 0) setError(t('No hymns found below the example row.', 'ከምሳሌው ረድፍ በታች መዝሙር አልተገኘም።'));
      else if (result.tooMany) setError(t(`Too many rows (${result.rows.length}). Import at most ${MAX_HYMN_IMPORT} at a time.`, `ረድፎቹ በጣም ብዙ ናቸው (${result.rows.length})። በአንድ ጊዜ እስከ ${MAX_HYMN_IMPORT} ብቻ ያስገቡ።`));
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

  const submit = async () => {
    setBusy(true);
    let added = 0;
    const res = await runChoir(async () => {
      const r = await importHymns(valid.map((x) => x.draft!));
      if (r.ok) added = r.added;
      return r.ok ? { ok: true } : r;
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t(`${added} hymns added to the library`, `${added} መዝሙራት ወደ ማውጫው ገብተዋል`));
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Import hymns', 'መዝሙራትን አስገባ')} subtitle={t('1. Download the template → 2. Fill it in → 3. Upload it', '1. ቅጹን ያውርዱ → 2. ይሙሉት → 3. ይስቀሉት')} maxWidth="2xl">
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-slate-200 p-4 space-y-2">
          <button type="button" onClick={downloadTemplate} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
            <Download size={14} /> {t('Download template (.xlsx)', 'ቅጽ አውርድ (.xlsx)')}
          </button>
          <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">
            <li>{t('One hymn per row. Only the Amharic title is required.', 'በአንድ ረድፍ አንድ መዝሙር። የሚያስፈልገው የአማርኛ ርዕስ ብቻ ነው።')}</li>
            <li>{t('Type: ', 'ዓይነት፦ ')}{Object.values(HYMN_CATEGORIES).map(([en, am]) => (locale === 'am' ? am : `${am} (${en.split(' (')[0]})`)).join('، ')} — {t('empty means መዝሙር', 'ባዶ ከሆነ መዝሙር')}</li>
            <li>{t('Write the lyrics in one cell; press Alt+Enter for a new line.', 'ግጥሙን በአንድ ሴል ይጻፉ፤ አዲስ መስመር ለመጀመር Alt+Enter ይጫኑ።')}</li>
            <li>{t('The example row is skipped. Hymns already in the library are not added twice.', 'የምሳሌው ረድፍ አይገባም። በማውጫው ያሉ መዝሙራት ሁለት ጊዜ አይገቡም።')}</li>
          </ul>
        </div>

        <label
          htmlFor="hymn-file"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'}`}
        >
          <FileSpreadsheet size={26} className="text-slate-400" />
          <span className="text-xs text-slate-600">{busy && !rows ? t('Reading file…', 'ፋይሉን በማንበብ ላይ…') : fileName || t('Drop the filled-in template here, or click to choose it', 'የተሞላውን ቅጽ እዚህ ይጣሉ ወይም ለመምረጥ ይጫኑ')}</span>
        </label>
        <input id="hymn-file" ref={inputRef} type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm" role="alert">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {rows && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-semibold text-emerald-700">{valid.length} {t('ready to add', 'ለማስገባት ዝግጁ')}</span>
              {skipped.length > 0 && <span className="font-semibold text-red-600">{skipped.length} {t('skipped', 'ይዘለላሉ')}</span>}
            </div>
            <div className="table-container rounded-none border-0 max-h-[22rem] overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t('Row', 'ረድፍ')}</th>
                    <th>{t('Title', 'ርዕስ')}</th>
                    <th>{t('Type', 'ዓይነት')}</th>
                    <th>{t('Result', 'ውጤት')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className={r.draft ? '' : 'bg-red-50/50'}>
                      <td className="text-xs text-slate-400 font-mono">{r.rowNumber}</td>
                      <td className="font-medium text-slate-900">{r.title || '—'}</td>
                      <td className="text-xs text-slate-600">{r.category ? (locale === 'am' ? HYMN_CATEGORIES[r.category][1] : HYMN_CATEGORIES[r.category][0]) : '—'}</td>
                      <td className="text-xs">
                        {r.draft ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={13} /> {t('OK', 'ተስማሚ')}</span>
                        ) : (
                          <ul className="text-red-700 space-y-0.5">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                        )}
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
            <Upload size={14} /> {busy && rows ? t('Saving…', 'በመመዝገብ ላይ…') : t(`Add ${valid.length} hymns`, `${valid.length} መዝሙራት አስገባ`)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
