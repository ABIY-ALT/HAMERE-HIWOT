// ─────────────────────────────────────────────────────────────────────────────
// Bank accounts and bank reconciliation (migration 042) — shared types and the
// pure helpers used on both sides:
//   • reading a bank statement exported to Excel / CSV: finding the header
//     row, guessing which column is what, reading dates and amounts the way
//     Ethiopian banks write them (05/10/2026, 05-Oct-2026, 1,250.00, (300.00),
//     300.00 DR, separate Debit / Credit columns or one signed Amount);
//   • the fingerprint that keeps a line once when statements overlap;
//   • suggesting which ledger records a statement line is.
// Money in is positive on a statement line, money out negative.
// ─────────────────────────────────────────────────────────────────────────────

import type { TxnType } from './types';

export type AccountKind = 'BANK' | 'CASH' | 'MOBILE';
export type StatementStatus = 'OPEN' | 'RECONCILED';
export type LineStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED';

export const ACCOUNT_KINDS: [AccountKind, string, string][] = [
  ['BANK', 'Bank account', 'የባንክ ሂሳብ'],
  ['CASH', 'Cash box', 'ጥሬ ገንዘብ (ካዝና)'],
  ['MOBILE', 'Mobile money (Telebirr…)', 'የሞባይል ገንዘብ (ቴሌብር…)'],
];

export interface BankAccount {
  id: string;
  name: string;
  kind: AccountKind;
  bank_name: string;
  account_number: string;
  branch: string;
  currency: string;
  opening_balance: number;
  opening_date: string;
  is_active: boolean;
  notes: string;
  /** Book balance: opening + income − expenses ± transfers, from the ledger */
  balance: number;
  income: number;
  expense: number;
  /** The newest imported statement */
  last_statement: { period_end: string | null; closing_balance: number | null; status: StatementStatus } | null;
  /** Statement lines not matched yet */
  open_lines: number;
}

export interface AccountTransfer {
  id: string;
  from_id: string;
  from: string;
  to_id: string;
  to: string;
  amount: number;
  date: string;
  reference: string;
  notes: string;
  recorded_by: string;
}

export interface BankingData {
  accounts: BankAccount[];
  transfers: AccountTransfer[];
  /** Ledger records not given to any account yet */
  unassigned: { count: number; income: number; expense: number };
}

export interface StatementRow {
  id: string;
  account_id: string;
  file_name: string;
  period_start: string | null;
  period_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  line_count: number;
  skipped_count: number;
  status: StatementStatus;
  imported_by: string;
  imported_at: string;
  reconciled_by: string;
  reconciled_at: string | null;
  matched: number;
  unmatched: number;
  ignored: number;
}

/** A ledger record as reconciliation shows it */
export interface LedgerItem {
  id: string;
  type: TxnType;
  category: string;
  amount: number;
  date: string;
  description: string;
  party: string;
  receipt_no: string;
  request_no: string;
  bank_account_id: string | null;
  statement_line_id: string | null;
}

export interface StatementLine {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  balance: number | null;
  status: LineStatus;
  note: string;
  transfer_id: string | null;
  /** Ledger records matched to it */
  txns: LedgerItem[];
}

export interface ReconcileSummary {
  /** Bank balance at the end of the statement (its last balance, or typed in) */
  bank_closing: number | null;
  /** The books' balance of this account on the same day */
  book_balance: number;
  /** In the bank, not in the books (unmatched lines) */
  bank_only: number;
  /** In the books (this account, up to the end date), not on any statement */
  book_only: number;
}

export interface ReconcileView {
  account: BankAccount;
  statements: StatementRow[];
  statement: StatementRow | null;
  lines: StatementLine[];
  /** Ledger records that may still be matched: this account's or no account's, not matched yet */
  candidates: LedgerItem[];
  /** Transfers of this account, for lines that are a transfer */
  transfers: AccountTransfer[];
  /** This account's ledger records up to the end date that no statement shows yet */
  outstanding: LedgerItem[];
  summary: ReconcileSummary | null;
}

// ── Reading a statement file ─────────────────────────────────────────────────

export type ColumnRole = 'date' | 'description' | 'reference' | 'debit' | 'credit' | 'amount' | 'balance' | 'ignore';

export const COLUMN_ROLES: [ColumnRole, string, string][] = [
  ['ignore', '— not used —', '— አያስፈልግም —'],
  ['date', 'Date', 'ቀን'],
  ['description', 'Description', 'መግለጫ'],
  ['reference', 'Reference', 'ማጣቀሻ'],
  ['credit', 'Money in (credit)', 'ገቢ (ክሬዲት)'],
  ['debit', 'Money out (debit)', 'ወጪ (ዴቢት)'],
  ['amount', 'Amount (+ in, − out)', 'መጠን (+ ገቢ፣ − ወጪ)'],
  ['balance', 'Balance', 'ቀሪ ሂሳብ'],
];

/** Checked in this order: "Debit amount" is a debit column, not an amount column. */
const HEADER_WORDS: [ColumnRole, RegExp][] = [
  ['balance', /balance|\bbal\b|ቀሪ/i],
  ['debit', /debit|withdraw|\bdr\b|paid\s*out|money\s*out|outflow|ወጪ/i],
  ['credit', /credit|deposit|\bcr\b|paid\s*in|money\s*in|inflow|ገቢ/i],
  ['date', /date|time|ቀን/i],
  ['reference', /\bref|cheque|\bchq|transaction\s*(id|no|number)|txn\s*(id|no)|voucher|ማጣቀሻ/i],
  ['description', /desc|narrat|particular|detail|remark|memo|purpose|መግለጫ/i],
  ['amount', /amount|\bamt\b|መጠን/i],
];

const text = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v)).trim();

/** The row that names the columns: the first of the top rows with at least two known column names. */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const known = new Set(rows[i].map((c) => HEADER_WORDS.find(([, re]) => re.test(text(c)))?.[0]).filter(Boolean));
    if (known.size >= 2 && known.has('date')) return i;
  }
  return 0;
}

/** A first guess at each column, from its name. Every role but "ignore" is used once. */
export function guessMapping(header: unknown[]): ColumnRole[] {
  const used = new Set<ColumnRole>();
  return header.map((h) => {
    const name = text(h);
    const role = HEADER_WORDS.find(([r, re]) => !used.has(r) && re.test(name))?.[0];
    if (!role) return 'ignore';
    used.add(role);
    return role;
  });
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function isoOf(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** A Gregorian date as YYYY-MM-DD, or null. dayFirst: 05/10/2026 is 5 October (not May 10). */
export function parseDate(v: unknown, dayFirst = true): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoOf(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  // An Excel day number that was not read as a date
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = text(v);
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(s);
  if (m) return dayFirst ? isoOf(+m[3], +m[2], +m[1]) : isoOf(+m[3], +m[1], +m[2]);
  m = /^(\d{1,2})[-\s/.]([A-Za-z]{3,})[-\s/.,]+(\d{2,4})\b/.exec(s);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return isoOf(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return isoOf(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  return null;
}

/** "1,250.00", "(300.00)", "-300", "300.00 DR", "ETB 45" → a number; empty → null. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = text(v);
  if (!s || s === '-') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(s)) sign = -1;
  s = s.replace(/\b(cr|dr)\.?$/i, '');
  if (s.trim().startsWith('-')) sign = -sign;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? sign * n : null;
}

export interface ParsedLine {
  date: string;
  description: string;
  reference: string;
  amount: number;
  balance: number | null;
}

export interface ParseResult {
  lines: ParsedLine[];
  /** Rows that look like money lines but could not be read (1-based row numbers of the file) */
  errors: { row: number; message: string }[];
}

/** The money lines under the header, read with this column mapping. Empty and total rows are left out. */
export function parseLines(rows: unknown[][], headerIndex: number, mapping: ColumnRole[], dayFirst = true): ParseResult {
  const col = (role: ColumnRole) => mapping.indexOf(role);
  const [cDate, cDesc, cRef, cDebit, cCredit, cAmount, cBal] = (['date', 'description', 'reference', 'debit', 'credit', 'amount', 'balance'] as ColumnRole[]).map(col);
  const lines: ParsedLine[] = [];
  const errors: ParseResult['errors'] = [];
  if (cDate < 0) return { lines, errors: [{ row: headerIndex + 1, message: 'Choose the date column' }] };
  if (cAmount < 0 && cDebit < 0 && cCredit < 0) return { lines, errors: [{ row: headerIndex + 1, message: 'Choose the amount column, or the money in / money out columns' }] };

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const at = (c: number) => (c >= 0 ? r[c] : null);
    if (r.every((c) => text(c) === '')) continue;
    let amount: number | null;
    if (cAmount >= 0) amount = parseAmount(at(cAmount));
    else {
      const credit = parseAmount(at(cCredit)) ?? 0;
      const debit = parseAmount(at(cDebit)) ?? 0;
      amount = Math.abs(credit) - Math.abs(debit);
    }
    const date = parseDate(at(cDate), dayFirst);
    // "Opening balance", "Total" and similar rows carry no movement
    if (!amount) {
      continue;
    }
    // "Total", "Closing balance"… under the lines: no digits where the date belongs
    if (!date && !/\d/.test(text(at(cDate)))) continue;
    if (!date) {
      errors.push({ row: i + 1, message: `Date not understood: “${text(at(cDate)) || 'empty'}”` });
      continue;
    }
    lines.push({
      date,
      description: text(at(cDesc)).slice(0, 500),
      reference: text(at(cRef)).slice(0, 120),
      amount: Math.round(amount * 100) / 100,
      balance: cBal >= 0 ? parseAmount(at(cBal)) : null,
    });
  }
  return { lines, errors };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * One fingerprint per line. Lines that look exactly alike in one file are
 * numbered (#1, #2…), so two equal deposits on one day stay two lines — and
 * importing an overlapping statement numbers them the same way again.
 */
export function fingerprints(lines: ParsedLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = [l.date, l.amount.toFixed(2), norm(l.reference), norm(l.description).slice(0, 120), l.balance == null ? '' : l.balance.toFixed(2)].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

// ── Suggesting matches ───────────────────────────────────────────────────────

const DAY = 86_400_000;
export const MATCH_WINDOW_DAYS = 14;
const AUTO_WINDOW_DAYS = 7;

const days = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY);
const cents = (n: number) => Math.round(n * 100);

/** Does the bank's text name this record (its receipt, request number or payer)? */
function named(line: Pick<StatementLine, 'description' | 'reference'>, item: LedgerItem): boolean {
  const hay = norm(`${line.reference} ${line.description}`).replace(/[^a-z0-9ሀ-ፚ ]/g, '');
  const keys = [item.receipt_no, item.request_no].map((k) => norm(k).replace(/[^a-z0-9ሀ-ፚ]/g, '')).filter((k) => k.length >= 3);
  if (keys.some((k) => hay.replace(/ /g, '').includes(k))) return true;
  const party = norm(item.party);
  return party.length >= 4 && hay.includes(party);
}

export interface Suggestion {
  item: LedgerItem;
  score: number;
  named: boolean;
  days: number;
}

/** Ledger records with the same direction and amount, near the date, best first. */
export function suggest(line: Pick<StatementLine, 'amount' | 'date' | 'description' | 'reference'>, items: LedgerItem[], accountId: string): Suggestion[] {
  const type: TxnType = line.amount > 0 ? 'INCOME' : 'EXPENSE';
  const want = cents(Math.abs(line.amount));
  return items
    .filter((x) => x.type === type && cents(x.amount) === want && !x.statement_line_id && days(x.date, line.date) <= MATCH_WINDOW_DAYS)
    .map((item) => {
      const d = days(item.date, line.date);
      const n = named(line, item);
      return { item, named: n, days: d, score: 100 - d * 4 + (n ? 40 : 0) + (item.bank_account_id === accountId ? 10 : 0) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Safe automatic matches: a line gets a record when that record is clearly it —
 * the bank names it, or it is the only record with that amount within a week.
 * Each record goes to one line at most.
 */
export function autoMatches(lines: StatementLine[], items: LedgerItem[], accountId: string): { lineId: string; txnId: string }[] {
  const taken = new Set<string>();
  const out: { lineId: string; txnId: string }[] = [];
  const open = lines.filter((l) => l.status === 'UNMATCHED');
  const ranked = open
    .map((l) => ({ l, s: suggest(l, items, accountId).filter((x) => x.days <= AUTO_WINDOW_DAYS) }))
    .filter(({ s }) => s.length > 0 && (s[0].named || s.length === 1))
    .sort((a, b) => b.s[0].score - a.s[0].score);
  for (const { l, s } of ranked) {
    const pick = s.find((x) => !taken.has(x.item.id) && (x.named || s.length === 1));
    if (!pick) continue;
    taken.add(pick.item.id);
    out.push({ lineId: l.id, txnId: pick.item.id });
  }
  return out;
}

/** Transfers that could be this line: into this account for money in, out of it for money out. */
export function transferCandidates(line: Pick<StatementLine, 'amount' | 'date'>, transfers: AccountTransfer[], accountId: string): AccountTransfer[] {
  const want = cents(Math.abs(line.amount));
  return transfers.filter(
    (t) => cents(t.amount) === want && (line.amount > 0 ? t.to_id === accountId : t.from_id === accountId) && days(t.date, line.date) <= MATCH_WINDOW_DAYS
  );
}

export const accountKindLabel = (kind: AccountKind, locale: string) => {
  const k = ACCOUNT_KINDS.find(([code]) => code === kind);
  return k ? (locale === 'am' ? k[2] : k[1]) : kind;
};
