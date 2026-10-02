'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { enrollStudents, useEducation } from '@/lib/education/client';
import { EducationNotice } from '@/components/education/EducationNotice';
import { parseCsv } from '@/lib/import/csv';
import {
  MAX_IMPORT_ROWS,
  TEMPLATE_EXAMPLES,
  TEMPLATE_HEADERS,
  parseStudentImport,
  type ImportParseResult,
} from '@/lib/import/students';
import { downloadXlsx, headerCell } from '@/lib/export/xlsx';
import { todayIso } from '@/lib/utils/ethiopian-calendar';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function ImportStudentsPage() {
  const { t } = useLang();
  const { students, classes } = useEducation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  const reset = () => {
    setFileName('');
    setParsed(null);
    setReadError('');
    setImported(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadTemplate = async () => {
    await downloadXlsx(
      'student_import_template',
      [TEMPLATE_HEADERS.map(headerCell), ...TEMPLATE_EXAMPLES],
      { sheet: 'Students', widths: [24, 24, 16, 10, 24, 22, 18, 16] }
    );
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);

    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt');
    const isXlsx = lower.endsWith('.xlsx');
    if (!isCsv && !isXlsx) {
      setReadError(
        t(
          'Please choose an .xlsx or .csv file. Older .xls files must be re-saved as .xlsx first.',
          'እባክዎ .xlsx ወይም .csv ፋይል ይምረጡ። የቆዩ .xls ፋይሎችን በመጀመሪያ እንደ .xlsx ያስቀምጡ።'
        )
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setReadError(t('The file is larger than 5 MB.', 'ፋይሉ ከ5 ሜባ በላይ ነው።'));
      return;
    }

    setBusy(true);
    try {
      let rows: unknown[][];
      if (isCsv) {
        rows = parseCsv(await file.text());
      } else {
        // Loaded on demand so the Excel reader is not part of every page
        const { readSheet } = await import('read-excel-file/universal');
        rows = (await readSheet(file)) as unknown[][];
      }
      setParsed(
        parseStudentImport(rows, { classes, existing: students, today: todayIso() })
      );
    } catch {
      setReadError(
        t(
          'Could not read this file. Make sure it is a valid, unprotected .xlsx or .csv file.',
          'ይህን ፋይል ማንበብ አልተቻለም። ትክክለኛ እና ያልተቆለፈ .xlsx ወይም .csv ፋይል መሆኑን ያረጋግጡ።'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const valid = parsed?.results.filter((r) => r.draft) ?? [];
  const invalid = parsed?.results.filter((r) => !r.draft) ?? [];

  const handleImport = async () => {
    if (valid.length === 0) return;
    setBusy(true);
    const res = await enrollStudents(valid.map((r) => r.draft as NonNullable<typeof r.draft>));
    setBusy(false);
    if (!res.ok) {
      setReadError(
        t(`Could not save the students: ${res.error}`, `ተማሪዎችን ማስቀመጥ አልተቻለም: ${res.error}`)
      );
      return;
    }
    setImported(valid.length);
    setParsed(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadErrors = async () => {
    const header = [t('Row', 'ረድፍ'), ...TEMPLATE_HEADERS, t('Problems', 'ችግሮች')].map(headerCell);
    const body = invalid.map((r) => [
      r.rowNumber,
      ...TEMPLATE_HEADERS.map((_, i) => r.cells[i] ?? ''),
      r.errors.join('; '),
    ]);
    await downloadXlsx('student_import_errors', [header, ...body], { sheet: 'Errors' });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/people/students"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mb-2"
        >
          <ArrowLeft size={14} />
          {t('Back to students', 'ወደ ተማሪዎች ተመለስ')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('Import Students from Excel', 'ተማሪዎችን ከኤክሴል አስገባ')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            `Upload an .xlsx or .csv file with up to ${MAX_IMPORT_ROWS} students. You will see a preview and any problems before anything is saved.`,
            `እስከ ${MAX_IMPORT_ROWS} ተማሪዎች ያሉት .xlsx ወይም .csv ፋይል ይስቀሉ። ከማስቀመጥ በፊት ቅድመ-እይታ እና ችግሮች ይታያሉ።`
          )}
        </p>
      </div>

      <EducationNotice needs="classes" demoSavedInBrowser />

      {imported !== null && (
        <div className="card p-5 flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50">
          <span className="inline-flex items-center gap-2 text-emerald-800 text-sm font-semibold" role="status">
            <CheckCircle2 size={18} />
            {t(`${imported} students imported.`, `${imported} ተማሪዎች ተመዝግበዋል።`)}
          </span>
          <Link href="/dashboard/people/students" className="btn btn-primary text-xs">
            {t('View students', 'ተማሪዎችን ተመልከት')}
          </Link>
        </div>
      )}

      {/* Step 1 + 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">{t('1. Get the template', '1. ቅጹን ያውርዱ')}</h2>
          <p className="text-xs text-slate-500">
            {t(
              'Fill in one student per row. Required columns: Name (English), Gender (Male / Female) and Class (for example "Grade 3"). Phone numbers can be written as 0911223344 or +251911223344.',
              'በአንድ ረድፍ አንድ ተማሪ ይሙሉ። አስፈላጊ አምዶች፦ ስም (እንግሊዝኛ)፣ ፆታ (ወንድ / ሴት) እና ክፍል (ለምሳሌ "Grade 3")። ስልክ 0911223344 ወይም +251911223344 ሊጻፍ ይችላል።'
            )}
          </p>
          <button onClick={downloadTemplate} className="btn btn-secondary text-xs inline-flex items-center gap-2">
            <Download size={14} />
            {t('Download template (.xlsx)', 'ቅጽ አውርድ (.xlsx)')}
          </button>
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">{t('2. Upload your file', '2. ፋይልዎን ይስቀሉ')}</h2>
          <label
            htmlFor="student-file"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <FileSpreadsheet size={26} className="text-slate-400" />
            <span className="text-xs text-slate-600">
              {fileName || t('Choose an .xlsx or .csv file', '.xlsx ወይም .csv ፋይል ይምረጡ')}
            </span>
          </label>
          <input
            id="student-file"
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.txt"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {busy && <p className="text-xs text-slate-500">{t('Reading file…', 'ፋይሉን በማንበብ ላይ…')}</p>}
        </div>
      </div>

      {readError && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 text-sm flex items-start gap-2" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {readError}
        </div>
      )}

      {parsed && parsed.fileErrors.length > 0 && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 text-sm space-y-1" role="alert">
          {parsed.fileErrors.map((e) => (
            <p key={e} className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {e}
            </p>
          ))}
        </div>
      )}

      {/* Preview */}
      {parsed && parsed.fileErrors.length === 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold text-emerald-700">
                {valid.length} {t('ready to import', 'ለማስገባት ዝግጁ')}
              </span>
              {invalid.length > 0 && (
                <span className="ml-3 font-semibold text-red-600">
                  {invalid.length} {t('with problems (will be skipped)', 'ችግር ያለባቸው (ይዘለላሉ)')}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {invalid.length > 0 && (
                <button onClick={downloadErrors} className="btn btn-secondary text-xs inline-flex items-center gap-2">
                  <Download size={14} />
                  {t('Download problems', 'ችግሮችን አውርድ')}
                </button>
              )}
              <button onClick={reset} className="btn btn-secondary text-xs">
                {t('Cancel', 'ሰርዝ')}
              </button>
              <button
                onClick={handleImport}
                disabled={valid.length === 0 || busy}
                className="btn btn-primary text-xs inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={14} />
                {t(`Import ${valid.length} students`, `${valid.length} ተማሪዎችን አስገባ`)}
              </button>
            </div>
          </div>

          <div className="table-container rounded-none border-0 max-h-[28rem] overflow-auto">
            <table>
              <thead>
                <tr>
                  <th>{t('Row', 'ረድፍ')}</th>
                  <th>{t('Name', 'ስም')}</th>
                  <th>{t('Gender', 'ፆታ')}</th>
                  <th>{t('Class', 'ክፍል')}</th>
                  <th>{t('Guardian', 'ወላጅ')}</th>
                  <th>{t('Phone', 'ስልክ')}</th>
                  <th>{t('Result', 'ውጤት')}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.results.map((r) => (
                  <tr key={r.rowNumber} className={r.draft ? '' : 'bg-red-50/50'}>
                    <td className="text-xs text-slate-400 font-mono">{r.rowNumber}</td>
                    <td className="font-medium text-slate-900">{r.draft?.name_en ?? r.cells[0] ?? ''}</td>
                    <td className="text-xs">{r.draft ? (r.draft.gender === 'MALE' ? t('Male', 'ወንድ') : t('Female', 'ሴት')) : ''}</td>
                    <td className="text-xs">{r.draft?.class ?? ''}</td>
                    <td className="text-xs">{r.draft?.parent ?? ''}</td>
                    <td className="text-xs font-mono">{r.draft?.phone ?? ''}</td>
                    <td className="text-xs">
                      {r.draft ? (
                        <span className="text-emerald-700 font-semibold">{t('OK', 'ተስማሚ')}</span>
                      ) : (
                        <ul className="text-red-700 space-y-0.5">
                          {r.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
