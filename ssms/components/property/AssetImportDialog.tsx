'use client';

import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { runProperty, useProperty } from '@/lib/property/client';
import { importAssets } from '@/app/dashboard/property/actions';
import { downloadBlob, safeFileName } from '@/lib/export/xlsx';
import { formatETB } from '@/lib/finance/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  MAX_IMPORT_ROWS,
  TEMPLATE_DEPARTMENTS,
  TEMPLATE_FILE_NAME,
  TEMPLATE_URL,
  parseAssetTemplate,
  type AssetImportRow,
} from '@/lib/import/assets';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type TemplateDepartment = (typeof TEMPLATE_DEPARTMENTS)[number];

/**
 * Download the official template exactly as stored (dropdowns, locked formulas,
 * logo and protection must survive, so it is never rebuilt in code). For a
 * department, its pre-filled file is used; until that file is added, the
 * blank template is downloaded instead and 'blank' is returned.
 */
export async function downloadAssetTemplate(dept?: TemplateDepartment): Promise<'department' | 'blank'> {
  if (dept) {
    const res = await fetch(`/templates/departments/${dept.code}.xlsx`);
    if (res.ok) {
      downloadBlob(await res.blob(), `${safeFileName(`ንብረት_መመዝገቢያ_ቅጽ_${dept.name}`)}.xlsx`);
      return 'department';
    }
  }
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('Template not found');
  downloadBlob(await res.blob(), TEMPLATE_FILE_NAME);
  return 'blank';
}

export function AssetImportDialog({
  departments,
  onClose,
  onDone,
}: {
  /** Template departments of the department chosen in the page filter (may be empty) */
  departments: TemplateDepartment[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useLang();
  const { assets, units, people } = useProperty();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<AssetImportRow[] | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const notTemplate = t(
    'This file is not the asset template. Please download the template and try again.',
    'ይህ ፋይል የንብረት መመዝገቢያ ቅጹ አይደለም። እባክዎ ቅጹን አውርደው እንደገና ይሞክሩ።'
  );

  const download = async (dept?: TemplateDepartment) => {
    setInfo('');
    try {
      const got = await downloadAssetTemplate(dept);
      if (dept && got === 'blank') {
        setInfo(t(`There is no pre-filled form for ${dept.name} yet — the blank template was downloaded.`, `ለ${dept.name} የተዘጋጀ ቅጽ ገና የለም — ባዶው ቅጽ ወርዷል።`));
      }
    } catch {
      setError(t('Could not download the template. Check your connection.', 'ቅጹን ማውረድ አልተቻለም። ግንኙነትዎን ያረጋግጡ።'));
    }
  };

  const reset = () => {
    setFileName('');
    setRows(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError(notTemplate);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t('The file is larger than 5 MB.', 'ፋይሉ ከ5 ሜባ በላይ ነው።'));
      return;
    }
    setBusy(true);
    try {
      // Loaded on demand so the Excel reader is not part of every page
      const { default: readXlsxFile } = await import('read-excel-file/universal');
      const sheets = (await readXlsxFile(file)) as { sheet: string; data: unknown[][] }[];
      const result = parseAssetTemplate(sheets, {
        units,
        people,
        existingTags: assets.map((a) => a.tag),
        today: todayIso(),
        t,
      });
      if (!result.ok) setError(notTemplate);
      else if (result.rows.length === 0) setError(t('No assets found. Fill in the rows below the grey example row.', 'ምንም ንብረት አልተገኘም። ከግራጫው ምሳሌ ረድፍ በታች ያሉትን ረድፎች ይሙሉ።'));
      else if (result.tooMany) setError(t(`Too many rows (${result.rows.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`, `ረድፎቹ በጣም ብዙ ናቸው (${result.rows.length})። በአንድ ጊዜ እስከ ${MAX_IMPORT_ROWS} ብቻ ያስገቡ።`));
      else setRows(result.rows);
    } catch {
      setError(notTemplate);
    } finally {
      setBusy(false);
    }
  };

  const valid = rows?.filter((r) => r.draft) ?? [];
  const invalid = rows?.filter((r) => !r.draft) ?? [];

  const submit = async () => {
    if (valid.length === 0) return;
    setBusy(true);
    const res = await runProperty(() => importAssets(valid.map((r) => r.draft!)));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(t(`${valid.length} assets imported`, `${valid.length} ንብረቶች ገብተዋል`));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Import assets from the template', 'ንብረቶችን ከቅጹ አስገባ')}
      subtitle={t('1. Download the template → 2. Fill it in → 3. Upload it', '1. ቅጹን ያውርዱ → 2. ይሙሉት → 3. ይስቀሉት')}
      maxWidth="2xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => download()} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
              <Download size={14} /> {t('Download template', 'ባዶ ቅጽ አውርድ')}
            </button>
            {departments.map((d) => (
              <button key={d.code} type="button" onClick={() => download(d)} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                <Download size={14} /> {t(`Download template for ${d.name}`, `የ${d.name} ቅጽ አውርድ`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {t(
              "Use only this template. The grey 'ምሳሌ' row is an example and is skipped on import.",
              'ይህንን ቅጽ ብቻ ይጠቀሙ። ግራጫው «ምሳሌ» ረድፍ ማሳያ ብቻ ነው፤ ሲገባ ይዘለላል።'
            )}
          </p>
          {info && <p className="text-xs text-amber-700">{info}</p>}
        </div>

        <label
          htmlFor="asset-template-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'}`}
        >
          <FileSpreadsheet size={26} className="text-slate-400" />
          <span className="text-xs text-slate-600">
            {busy ? t('Reading file…', 'ፋይሉን በማንበብ ላይ…') : fileName || t('Drop the filled-in template here, or click to choose it (.xlsx)', 'የተሞላውን ቅጽ እዚህ ይጣሉ ወይም ለመምረጥ ይጫኑ (.xlsx)')}
          </span>
        </label>
        <input
          id="asset-template-file"
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm" role="alert">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {rows && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-100 text-sm flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-semibold text-emerald-700">{valid.length} {t('ready to import', 'ለማስገባት ዝግጁ')}</span>
              {invalid.length > 0 && <span className="font-semibold text-red-600">{invalid.length} {t('with problems (will be skipped)', 'ችግር ያለባቸው (ይዘለላሉ)')}</span>}
            </div>
            <div className="table-container rounded-none border-0 max-h-[22rem] overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t('Row', 'ረድፍ')}</th>
                    <th>{t('Item', 'ዕቃ')}</th>
                    <th>{t('Department', 'ክፍል')}</th>
                    <th className="text-right">{t('Value', 'ዋጋ')}</th>
                    <th>{t('Result', 'ውጤት')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className={r.draft ? '' : 'bg-red-50/50'}>
                      <td className="text-xs text-slate-400 font-mono">{r.rowNumber}</td>
                      <td>
                        <div className="font-medium text-slate-900">{r.name || '—'}</div>
                        {r.draft?.tag && <div className="text-[11px] font-mono text-blue-600">{r.draft.tag}</div>}
                      </td>
                      <td className="text-xs text-slate-600">{r.department || '—'}</td>
                      <td className="text-right font-mono text-xs whitespace-nowrap">{r.draft ? formatETB(r.draft.value) : ''}</td>
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
          <button
            type="button"
            onClick={submit}
            disabled={busy || valid.length === 0}
            className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload size={14} />
            {busy && rows ? t('Saving…', 'በመመዝገብ ላይ…') : t(`Import ${valid.length} assets`, `${valid.length} ንብረቶችን አስገባ`)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
