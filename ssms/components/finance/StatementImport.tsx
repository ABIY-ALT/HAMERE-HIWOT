'use client';

// Import a bank statement exported from the bank (Excel .xlsx or CSV): the
// header row and the columns are guessed (lib/finance/banking), shown for
// checking, and only the money lines are sent. Lines imported before (an
// overlapping statement) are skipped by the server; clear matches are made at once.

import React, { useMemo, useState } from 'react';
import { AlertCircle, FileSpreadsheet, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { parseCsv } from '@/lib/import/csv';
import { formatETB } from '@/lib/finance/types';
import { COLUMN_ROLES, findHeaderRow, guessMapping, parseLines, type ColumnRole } from '@/lib/finance/banking';
import { importStatement } from '@/app/dashboard/finance/banking/actions';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function StatementImport({
  accountId,
  accountName,
  onClose,
  onImported,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
  onImported: (statementId: string, message: string) => void;
}) {
  const { t, locale } = useLang();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<unknown[][]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnRole[]>([]);
  const [dayFirst, setDayFirst] = useState(true);
  const [closing, setClosing] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const header = rows[headerIndex] ?? [];
  const parsed = useMemo(() => (rows.length ? parseLines(rows, headerIndex, mapping, dayFirst) : null), [rows, headerIndex, mapping, dayFirst]);
  const lines = parsed?.lines ?? [];
  const moneyIn = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const moneyOut = lines.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0);
  const lastBalance = [...lines].reverse().find((l) => l.balance != null)?.balance ?? null;
  const dates = lines.map((l) => l.date).sort();

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setRows([]);
    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt');
    if (!isCsv && !lower.endsWith('.xlsx')) {
      return setError(t('Choose an .xlsx or .csv file. Save older .xls files as .xlsx first. PDF statements cannot be read — ask the bank for Excel.', '.xlsx ወይም .csv ፋይል ይምረጡ። የቆዩ .xls ፋይሎችን እንደ .xlsx ያስቀምጡ። PDF መግለጫ አይነበብም — ባንኩን Excel ይጠይቁ።'));
    }
    if (file.size > MAX_FILE_BYTES) return setError(t('The file is larger than 5 MB.', 'ፋይሉ ከ5 ሜባ በላይ ነው።'));
    setBusy(true);
    try {
      let data: unknown[][];
      if (isCsv) data = parseCsv(await file.text());
      else {
        const { readSheet } = await import('read-excel-file/universal');
        data = (await readSheet(file)) as unknown[][];
      }
      const h = findHeaderRow(data);
      setFileName(file.name);
      setRows(data);
      setHeaderIndex(h);
      setMapping(guessMapping(data[h] ?? []));
      setClosing('');
    } catch {
      setError(t('This file could not be read.', 'ፋይሉ ሊነበብ አልቻለም።'));
    } finally {
      setBusy(false);
    }
  };

  const changeHeader = (i: number) => {
    setHeaderIndex(i);
    setMapping(guessMapping(rows[i] ?? []));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    const typed = closing.trim() === '' ? null : Number(closing.replace(/,/g, ''));
    const res = await importStatement({ account_id: accountId, file_name: fileName, lines, closing_balance: typed != null && Number.isFinite(typed) ? typed : null });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onImported(
      res.statement_id,
      t(
        `${res.added} lines imported${res.skipped ? `, ${res.skipped} already there` : ''}; ${res.matched} matched automatically`,
        `${res.added} መስመሮች ገብተዋል${res.skipped ? `፣ ${res.skipped} ቀድሞ የነበሩ` : ''}፤ ${res.matched} በራሱ ታርቋል`
      )
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Import bank statement', 'የባንክ መግለጫ አስገባ')} subtitle={accountName} maxWidth="2xl">
      <div className="space-y-4 text-sm">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-xs">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40">
          <FileSpreadsheet className="text-slate-400" size={28} />
          <span className="font-semibold text-slate-700">{fileName || t('Choose the statement file (.xlsx or .csv)', 'የመግለጫውን ፋይል ይምረጡ (.xlsx ወይም .csv)')}</span>
          <span className="text-xs text-slate-500">
            {t('Download it from internet banking (CBE Birr, Awash, Dashen…) as Excel.', 'ከኢንተርኔት ባንኪንግ (ንግድ ባንክ፣ አዋሽ፣ ዳሽን…) በExcel ያውርዱት።')}
          </span>
          <input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Column names are on row', 'የዓምድ ስሞቹ ያሉበት ረድፍ')}</label>
                <select value={headerIndex} onChange={(e) => changeHeader(Number(e.target.value))} className="form-input text-sm">
                  {rows.slice(0, 25).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {r.map((c) => String(c ?? '')).filter(Boolean).join(' | ').slice(0, 70)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('Dates like 05/10/2026 are', '05/10/2026 የመሰሉ ቀኖች')}</label>
                <select value={dayFirst ? 'd' : 'm'} onChange={(e) => setDayFirst(e.target.value === 'd')} className="form-input text-sm">
                  <option value="d">{t('day / month / year (5 October)', 'ቀን / ወር / ዓመት (ጥቅምት 5)')}</option>
                  <option value="m">{t('month / day / year (May 10)', 'ወር / ቀን / ዓመት')}</option>
                </select>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1">{t('What each column is', 'እያንዳንዱ ዓምድ ምን እንደሆነ')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {header.map((h, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-2">
                    <div className="text-[11px] text-slate-500 truncate" title={String(h ?? '')}>{String(h ?? '') || `${t('Column', 'ዓምድ')} ${i + 1}`}</div>
                    <select
                      value={mapping[i] ?? 'ignore'}
                      onChange={(e) => setMapping((m) => m.map((r, j) => (j === i ? (e.target.value as ColumnRole) : r === e.target.value && e.target.value !== 'ignore' ? 'ignore' : r)))}
                      className={`form-input text-xs py-1 mt-1 ${mapping[i] && mapping[i] !== 'ignore' ? 'border-blue-300 bg-blue-50/50' : ''}`}
                    >
                      {COLUMN_ROLES.map(([role, en, am]) => (
                        <option key={role} value={role}>{locale === 'am' ? am : en}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {parsed && parsed.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-0.5">
                <div className="font-semibold">{t(`${parsed.errors.length} row(s) left out`, `${parsed.errors.length} ረድፍ(ፎች) ቀርተዋል`)}</div>
                {parsed.errors.slice(0, 4).map((e) => (
                  <div key={e.row}>{t('Row', 'ረድፍ')} {e.row}: {e.message}</div>
                ))}
              </div>
            )}

            {lines.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <Stat label={t('Lines', 'መስመሮች')} value={String(lines.length)} />
                  <Stat label={t('Dates', 'ቀኖች')} value={`${dates[0]} → ${dates[dates.length - 1]}`} small />
                  <Stat label={t('Money in', 'ገቢ')} value={formatETB(moneyIn)} tone="text-emerald-700" small />
                  <Stat label={t('Money out', 'ወጪ')} value={formatETB(moneyOut)} tone="text-red-600" small />
                </div>
                <div className="table-container max-h-56 overflow-y-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Date', 'ቀን')}</th>
                        <th>{t('Description', 'መግለጫ')}</th>
                        <th>{t('Reference', 'ማጣቀሻ')}</th>
                        <th className="text-right">{t('Amount', 'መጠን')}</th>
                        <th className="text-right">{t('Balance', 'ቀሪ')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.slice(0, 50).map((l, i) => (
                        <tr key={i}>
                          <td className="text-xs font-mono whitespace-nowrap">{l.date}</td>
                          <td className="text-xs text-slate-700 max-w-[16rem] truncate">{l.description || '—'}</td>
                          <td className="text-xs font-mono text-slate-500">{l.reference || '—'}</td>
                          <td className={`text-right text-xs font-mono font-semibold ${l.amount > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right text-xs font-mono text-slate-500">{l.balance == null ? '—' : l.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lines.length > 50 && <p className="text-[11px] text-slate-400">{t(`First 50 of ${lines.length} lines`, `ከ${lines.length} መስመሮች የመጀመሪያዎቹ 50`)}</p>}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {t('Bank balance at the end of the statement', 'በመግለጫው መጨረሻ የባንኩ ቀሪ ሂሳብ')}
                  </label>
                  <input
                    value={closing}
                    onChange={(e) => setClosing(e.target.value)}
                    placeholder={lastBalance != null ? lastBalance.toFixed(2) : t('As printed on the statement', 'በመግለጫው ላይ እንደተጻፈው')}
                    className="form-input text-sm font-mono max-w-xs"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {lastBalance != null
                      ? t('Leave empty to use the last balance in the file.', 'ባዶ ከተተወ በፋይሉ ያለው የመጨረሻ ቀሪ ይወሰዳል።')
                      : t('The file has no balance column — type it to compare with the books.', 'ፋይሉ የቀሪ ሂሳብ ዓምድ የለውም — ከመዝገቡ ጋር ለማነጻጸር ይጻፉት።')}
                  </p>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
          <button onClick={submit} disabled={busy || lines.length === 0} className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
            <Upload size={14} /> {busy ? t('Working…', 'በሂደት ላይ…') : t(`Import ${lines.length || ''} lines`, `${lines.length || ''} መስመሮች አስገባ`)}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone = 'text-slate-900', small = false }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className={`font-bold font-mono ${small ? 'text-xs' : 'text-lg'} ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
