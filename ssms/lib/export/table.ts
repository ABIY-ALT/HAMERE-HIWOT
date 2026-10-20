// ─────────────────────────────────────────────────────────────────────────────
// One table → Excel (.xlsx) or CSV, for the Export buttons.
// CSV: UTF-8 with a BOM (so Excel shows Amharic correctly), and text that
// starts like a formula (= + - @) gets a leading ' so it can never run.
// ─────────────────────────────────────────────────────────────────────────────

import { cell, downloadBlob, downloadXlsx, headerCell, safeFileName } from './xlsx';

export type ExportFormat = 'xlsx' | 'csv';
export type ExportCell = string | number | null | undefined;

function csvValue(v: ExportCell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: ExportCell[][]): string {
  return [header, ...rows].map((r) => r.map(csvValue).join(',')).join('\r\n');
}

/** Download the table in the chosen format. `widths`: Excel column widths (characters). */
export async function exportTable(
  filename: string,
  header: string[],
  rows: ExportCell[][],
  format: ExportFormat,
  options: { sheet?: string; widths?: number[] } = {}
): Promise<void> {
  if (format === 'csv') {
    const blob = new Blob(['﻿', toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${safeFileName(filename)}.csv`);
    return;
  }
  await downloadXlsx(filename, [header.map(headerCell), ...rows.map((r) => r.map((v) => cell(v ?? null)))], options);
}
