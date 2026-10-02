// ─────────────────────────────────────────────────────────────────────────────
// Minimal CSV parser (RFC 4180 style): quoted fields, doubled quotes,
// newlines inside quotes, CRLF/LF, UTF-8 BOM. The delimiter (comma,
// semicolon or tab) is detected from the header line, because Excel in some
// regional settings saves ".csv" files with semicolons.
// ─────────────────────────────────────────────────────────────────────────────

export type Row = string[];

function detectDelimiter(text: string): string {
  // Look only at the first line, ignoring anything inside quotes
  let inQuotes = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/** Parse CSV text into rows of strings. Fully empty rows are dropped. */
export function parseCsv(input: string): Row[] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: Row[] = [];
  let row: Row = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
