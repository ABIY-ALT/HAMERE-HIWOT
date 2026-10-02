// ─────────────────────────────────────────────────────────────────────────────
// Excel (.xlsx) export helpers.
//
// Uses the "/universal" build of write-excel-file, which works with plain
// Blobs and does not start Web Workers (those are awkward under Next.js).
// Text is always stored as text, never as a formula, so a name such as
// "=SUM(A1)" cannot execute when the file is opened.
// ─────────────────────────────────────────────────────────────────────────────

import writeExcelFile from 'write-excel-file/universal';
import type { SheetData } from 'write-excel-file/universal';

export type { SheetData };

type Cell = string | number | boolean | Date | null;

/** A bold header cell with a light background. */
export function headerCell(text: string) {
  return { value: text, fontWeight: 'bold' as const, backgroundColor: '#e8edf7' };
}

/** A bold plain cell, for titles and totals. */
export function boldCell(value: string | number) {
  return { value, fontWeight: 'bold' as const };
}

/** Plain value, with empty strings written as truly empty cells. */
export function cell(value: Cell | undefined) {
  return value === undefined || value === '' ? null : value;
}

/** Excel sheet names: max 31 characters, none of  [ ] : * ? / \  */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  return cleaned || 'Sheet1';
}

/** File names: keep letters (including Amharic), digits, dash and underscore. */
export function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'export';
}

export async function buildXlsx(
  data: SheetData,
  options: { sheet?: string; widths?: number[] } = {}
): Promise<Blob> {
  const sheetOptions = {
    sheet: safeSheetName(options.sheet ?? 'Sheet1'),
    columns: options.widths?.map((width) => ({ width })),
    // Excel requires an explicit format for Date cells
    dateFormat: 'yyyy-mm-dd',
  };
  return writeExcelFile(data, sheetOptions).toBlob();
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the URL
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadXlsx(
  filename: string,
  data: SheetData,
  options: { sheet?: string; widths?: number[] } = {}
): Promise<void> {
  const base = safeFileName(filename.replace(/\.xlsx$/i, ''));
  downloadBlob(await buildXlsx(data, options), `${base}.xlsx`);
}
