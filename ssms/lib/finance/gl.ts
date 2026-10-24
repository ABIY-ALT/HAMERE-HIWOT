// ─────────────────────────────────────────────────────────────────────────────
// General ledger (migration 044) — data shapes, labels and the financial
// statements. No server code: the server actions compute the reports with
// these functions and the pages use the labels.
//
// Signs: every amount is kept as debit − credit until it is shown.
//   • An account's balance is shown in its normal direction (a credit-normal
//     account with more credits shows a positive balance).
//   • Statements show each section in its own direction — assets and
//     expenses debit-positive, liabilities, net assets and income
//     credit-positive — so a contra account (accumulated depreciation) shows
//     as a negative amount in its section.
// Income and expense accounts are never closed by an entry: the balance sheet
// and the trial balance carry the surplus of earlier fiscal years as
// "Accumulated surplus" and the current year's as "Surplus for the year".
// ─────────────────────────────────────────────────────────────────────────────

export type GlType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type EntrySource = 'MANUAL' | 'TRANSACTION' | 'TRANSFER' | 'OPENING' | 'REVERSAL' | 'PLEDGE' | 'ASSET' | 'DEPRECIATION' | 'DISPOSAL';
export type EntryStatus = 'DRAFT' | 'PENDING' | 'POSTED';
export type Bilingual = [en: string, am: string];

export const GL_TYPES: { code: GlType; label: Bilingual; normal: NormalBalance }[] = [
  { code: 'ASSET', label: ['Asset', 'ሀብት'], normal: 'DEBIT' },
  { code: 'LIABILITY', label: ['Liability', 'ዕዳ'], normal: 'CREDIT' },
  { code: 'EQUITY', label: ['Net assets / equity', 'የተጣራ ሀብት'], normal: 'CREDIT' },
  { code: 'INCOME', label: ['Income', 'ገቢ'], normal: 'CREDIT' },
  { code: 'EXPENSE', label: ['Expense', 'ወጪ'], normal: 'DEBIT' },
];

export const SUB_TYPES: { code: string; type: GlType; label: Bilingual }[] = [
  { code: 'CASH_BANK', type: 'ASSET', label: ['Cash and bank', 'ጥሬ ገንዘብና ባንክ'] },
  { code: 'RECEIVABLE', type: 'ASSET', label: ['Receivables', 'ተሰብሳቢ ሂሳቦች'] },
  { code: 'CURRENT_ASSET', type: 'ASSET', label: ['Other current assets', 'ሌሎች የአጭር ጊዜ ሀብቶች'] },
  { code: 'FIXED_ASSET', type: 'ASSET', label: ['Fixed assets', 'ቋሚ ንብረቶች'] },
  { code: 'OTHER_ASSET', type: 'ASSET', label: ['Other non-current assets', 'ሌሎች የረጅም ጊዜ ሀብቶች'] },
  { code: 'CURRENT_LIABILITY', type: 'LIABILITY', label: ['Current liabilities', 'የአጭር ጊዜ ዕዳዎች'] },
  { code: 'LONG_TERM_LIABILITY', type: 'LIABILITY', label: ['Long-term liabilities', 'የረጅም ጊዜ ዕዳዎች'] },
  { code: 'NET_ASSETS', type: 'EQUITY', label: ['Unrestricted funds', 'ያልተገደበ ፈንድ'] },
  { code: 'RESTRICTED_FUND', type: 'EQUITY', label: ['Restricted funds', 'የተገደበ ፈንድ'] },
  { code: 'OPENING_BALANCE', type: 'EQUITY', label: ['Opening balances', 'የመነሻ ቀሪ ሂሳብ'] },
  { code: 'OPERATING_INCOME', type: 'INCOME', label: ['Operating income', 'የሥራ ገቢ'] },
  { code: 'OTHER_INCOME', type: 'INCOME', label: ['Other income', 'ሌላ ገቢ'] },
  { code: 'PROGRAM_EXPENSE', type: 'EXPENSE', label: ['Program expenses', 'የአገልግሎትና ፕሮግራም ወጪዎች'] },
  { code: 'ADMIN_EXPENSE', type: 'EXPENSE', label: ['Administrative expenses', 'የአስተዳደር ወጪዎች'] },
  { code: 'FUNDRAISING_EXPENSE', type: 'EXPENSE', label: ['Fundraising expenses', 'የገቢ ማሰባሰቢያ ወጪዎች'] },
  { code: 'OTHER_EXPENSE', type: 'EXPENSE', label: ['Other expenses', 'ሌሎች ወጪዎች'] },
];

export const SOURCE_LABEL: Record<EntrySource, Bilingual> = {
  MANUAL: ['Manual', 'በእጅ'],
  TRANSACTION: ['Income / expense', 'ገቢ / ወጪ'],
  TRANSFER: ['Transfer', 'ዝውውር'],
  OPENING: ['Opening balance', 'መነሻ ቀሪ'],
  REVERSAL: ['Reversal', 'መሰረዣ'],
  PLEDGE: ['Pledge', 'የስጦታ ቃል'],
  ASSET: ['Fixed asset', 'ቋሚ ንብረት'],
  DEPRECIATION: ['Depreciation', 'የእርጅና ቅናሽ'],
  DISPOSAL: ['Asset disposal', 'ንብረት ማስወገድ'],
};

export const STATUS_LABEL: Record<EntryStatus, Bilingual> = {
  DRAFT: ['Draft', 'ረቂቅ'],
  PENDING: ['Waiting for approval', 'ማጽደቅ ይጠብቃል'],
  POSTED: ['Posted', 'ተመዝግቧል'],
};

/** Default accounts the automatic postings fall back to (gl_mappings DEFAULT) */
export const DEFAULT_KEYS: { key: string; label: Bilingual; hint: Bilingual }[] = [
  { key: 'CASH', label: ['Cash (no account given)', 'ጥሬ ገንዘብ (ሂሳብ ሳይሰጥ)'], hint: ['Records without a bank account post here', 'የባንክ ሂሳብ ያልተሰጣቸው መዝገቦች እዚህ ይመዘገባሉ'] },
  { key: 'INCOME', label: ['Income without a rule', 'ደንብ የሌለው ገቢ'], hint: ['Income categories without their own rule', 'የራሳቸው ደንብ የሌላቸው የገቢ ዓይነቶች'] },
  { key: 'EXPENSE', label: ['Expense without a rule', 'ደንብ የሌለው ወጪ'], hint: ['Expense categories without their own rule', 'የራሳቸው ደንብ የሌላቸው የወጪ ዓይነቶች'] },
  { key: 'OPENING_BALANCE', label: ['Opening balances', 'የመነሻ ቀሪ ሂሳብ'], hint: ['The other side of each bank account’s opening balance', 'የእያንዳንዱ የባንክ ሂሳብ መነሻ ቀሪ ተቃራኒ ጎን'] },
  { key: 'PLEDGES_RECEIVABLE', label: ['Pledges receivable', 'ቃል የተገባ ስጦታ (ተሰብሳቢ)'], hint: ['What donors promised and have not paid yet (047)', 'ለጋሾች ቃል የገቡትና ገና ያልከፈሉት (047)'] },
  { key: 'FIXED_ASSETS', label: ['Fixed assets', 'ቋሚ ንብረቶች'], hint: ['The cost of assets whose category has no rule of its own', 'የራሱ ደንብ የሌለው ዓይነት ንብረት ዋጋ'] },
  { key: 'DEPRECIATION', label: ['Depreciation expense', 'የእርጅና ቅናሽ ወጪ'], hint: ['The monthly depreciation of fixed assets', 'የቋሚ ንብረቶች ወርሃዊ የእርጅና ቅናሽ'] },
  { key: 'ACCUMULATED_DEPRECIATION', label: ['Accumulated depreciation', 'የተጠራቀመ የእርጅና ቅናሽ'], hint: ['The contra account that lowers the fixed assets', 'የቋሚ ንብረቶችን ዋጋ የሚቀንሰው ተቃራኒ ሂሳብ'] },
  { key: 'DISPOSAL_LOSS', label: ['Loss on disposal', 'ንብረት በማስወገድ የደረሰ ኪሳራ'], hint: ['What was not yet depreciated when an asset is disposed of or lost', 'ንብረት ሲወገድ ወይም ሲጠፋ ገና ያልተቀነሰው ዋጋ'] },
];

export const FISCAL_PRESETS: { value: string; label: Bilingual }[] = [
  { value: '07-08', label: ['Hamle 1 (Ethiopian government fiscal year)', 'ሐምሌ 1 (የመንግሥት በጀት ዓመት)'] },
  { value: '09-11', label: ['Meskerem 1 (Ethiopian new year)', 'መስከረም 1 (አዲስ ዓመት)'] },
  { value: '01-01', label: ['January 1', 'ጃንዋሪ 1'] },
];

export interface GlAccount {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  type: GlType;
  sub_type: string;
  normal_balance: NormalBalance;
  parent_id: string | null;
  is_header: boolean;
  bank_account_id: string | null;
  description: string;
  is_active: boolean;
}

export interface GlSettings {
  fiscal_year_start: string;
  lock_date: string | null;
  require_approval: boolean;
  /** Pledges are posted as money owed when made (047) */
  accrue_pledges: boolean;
}

export interface GlMapping {
  source: 'DEFAULT' | 'INCOME_CATEGORY' | 'EXPENSE_CATEGORY' | 'ASSET_CATEGORY';
  key: string;
  account_id: string;
}

/** One posted journal line, as the reports read it */
export interface PostedLine {
  entry_id: string;
  date: string;
  account_id: string;
  debit: number;
  credit: number;
  unit_id: string | null;
  source: EntrySource;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function typeLabel(type: GlType, locale: string): string {
  const l = GL_TYPES.find((t) => t.code === type)?.label ?? [type, type];
  return locale === 'am' ? l[1] : l[0];
}

export function subTypeLabel(code: string, locale: string): string {
  const l = SUB_TYPES.find((s) => s.code === code)?.label ?? [code, code];
  return locale === 'am' ? l[1] : l[0];
}

export function accountName(a: Pick<GlAccount, 'name_en' | 'name_am'>, locale: string): string {
  return locale === 'am' ? a.name_am || a.name_en : a.name_en;
}

export const isBalanceSheet = (type: GlType) => type === 'ASSET' || type === 'LIABILITY' || type === 'EQUITY';

/** debit − credit turned into the account's normal direction */
export function natural(a: Pick<GlAccount, 'normal_balance'>, net: number): number {
  return a.normal_balance === 'DEBIT' ? net : -net;
}

/** debit − credit turned into the direction of the account's statement section */
export function sectionAmount(type: GlType, net: number): number {
  return type === 'ASSET' || type === 'EXPENSE' ? net : -net;
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** Start of the fiscal year a date falls in ('07-08' = 8 July). */
export function fiscalYearStart(date: string, start: string): string {
  const year = Number(date.slice(0, 4));
  const candidate = `${year}-${start}`;
  return date >= candidate ? candidate : `${year - 1}-${start}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addYears(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  const rest = iso.slice(4);
  // 29 Feb → 28 Feb in a year that has none
  return rest === '-02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? `${y}-02-28` : `${y}${rest}`;
}

export function fiscalYearEnd(date: string, start: string): string {
  return addDays(addYears(fiscalYearStart(date, start), 1), -1);
}

/** The period just before [from, to], of the same length */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -days), to: prevTo };
}

// ── The chart as a tree ──────────────────────────────────────────────────────

export interface TreeAccount extends GlAccount {
  depth: number;
}

/** Accounts in chart order: each group followed by its sub-accounts, by code. */
export function chartOrder(accounts: GlAccount[]): TreeAccount[] {
  const byParent = new Map<string | null, GlAccount[]>();
  const ids = new Set(accounts.map((a) => a.id));
  for (const a of accounts) {
    const key = a.parent_id && ids.has(a.parent_id) ? a.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), a]);
  }
  const out: TreeAccount[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const a of (byParent.get(parent) ?? []).sort((x, y) => x.code.localeCompare(y.code, 'en', { numeric: true }))) {
      out.push({ ...a, depth });
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Ids of an account and every account below it */
export function descendants(accounts: GlAccount[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of accounts) {
      if (a.parent_id && out.has(a.parent_id) && !out.has(a.id)) {
        out.add(a.id);
        grew = true;
      }
    }
  }
  return out;
}

// ── Reports ──────────────────────────────────────────────────────────────────

function sumBy(lines: PostedLine[], keep: (l: PostedLine) => boolean): Map<string, { dr: number; cr: number }> {
  const out = new Map<string, { dr: number; cr: number }>();
  for (const l of lines) {
    if (!keep(l)) continue;
    const s = out.get(l.account_id) ?? { dr: 0, cr: 0 };
    s.dr += l.debit;
    s.cr += l.credit;
    out.set(l.account_id, s);
  }
  return out;
}

const net = (s: { dr: number; cr: number } | undefined) => (s ? s.dr - s.cr : 0);

export interface TrialRow {
  /** null for the computed accumulated-surplus row */
  account: Pick<GlAccount, 'id' | 'code' | 'name_en' | 'name_am' | 'type' | 'normal_balance'> | null;
  /** debit − credit */
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

export interface TrialBalance {
  from: string;
  to: string;
  rows: TrialRow[];
  totals: { openingDr: number; openingCr: number; debit: number; credit: number; closingDr: number; closingCr: number };
}

/**
 * Opening balance, movement and closing balance of every account. Income and
 * expense accounts start at the beginning of the fiscal year; what they held
 * before it is one "Accumulated surplus" row, so the columns still balance.
 */
export function trialBalance(accounts: GlAccount[], lines: PostedLine[], from: string, to: string, fyStart: string): TrialBalance {
  const boundary = from < fyStart ? from : fyStart;
  const pl = new Set(accounts.filter((a) => !isBalanceSheet(a.type)).map((a) => a.id));
  const opening = sumBy(lines, (l) => l.date < from && (!pl.has(l.account_id) || l.date >= boundary));
  const moves = sumBy(lines, (l) => l.date >= from && l.date <= to);
  let retained = 0;
  for (const l of lines) if (l.date < boundary && pl.has(l.account_id)) retained += l.debit - l.credit;

  const rows: TrialRow[] = [];
  for (const a of chartOrder(accounts)) {
    if (a.is_header) continue;
    const o = round2(net(opening.get(a.id)));
    const m = moves.get(a.id) ?? { dr: 0, cr: 0 };
    if (o === 0 && m.dr === 0 && m.cr === 0) continue;
    rows.push({
      account: { id: a.id, code: a.code, name_en: a.name_en, name_am: a.name_am, type: a.type, normal_balance: a.normal_balance },
      opening: o,
      debit: round2(m.dr),
      credit: round2(m.cr),
      closing: round2(o + m.dr - m.cr),
    });
  }
  retained = round2(retained);
  if (retained !== 0) rows.push({ account: null, opening: retained, debit: 0, credit: 0, closing: retained });

  const totals = { openingDr: 0, openingCr: 0, debit: 0, credit: 0, closingDr: 0, closingCr: 0 };
  for (const r of rows) {
    if (r.opening > 0) totals.openingDr += r.opening;
    else totals.openingCr -= r.opening;
    totals.debit += r.debit;
    totals.credit += r.credit;
    if (r.closing > 0) totals.closingDr += r.closing;
    else totals.closingCr -= r.closing;
  }
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = round2(totals[k]);
  return { from, to, rows, totals };
}

export interface StatementLine {
  account: Pick<GlAccount, 'id' | 'code' | 'name_en' | 'name_am'> | null;
  /** For computed lines (surplus rows) */
  label?: Bilingual;
  amount: number;
  compare: number | null;
}

export interface StatementGroup {
  code: string;
  label: Bilingual;
  lines: StatementLine[];
  total: number;
  compareTotal: number | null;
}

/** Lines of one section, grouped by sub-type in chart order, with totals. */
function groupLines(
  accounts: GlAccount[],
  types: GlType[],
  amountOf: (a: GlAccount) => number,
  compareOf: ((a: GlAccount) => number) | null
): StatementGroup[] {
  const groups: StatementGroup[] = [];
  for (const sub of SUB_TYPES.filter((s) => types.includes(s.type))) {
    const lines: StatementLine[] = [];
    for (const a of chartOrder(accounts)) {
      if (a.is_header || a.sub_type !== sub.code) continue;
      const amount = round2(amountOf(a));
      const compare = compareOf ? round2(compareOf(a)) : null;
      if (amount === 0 && !compare) continue;
      lines.push({ account: { id: a.id, code: a.code, name_en: a.name_en, name_am: a.name_am }, amount, compare });
    }
    if (!lines.length) continue;
    groups.push({
      code: sub.code,
      label: sub.label,
      lines,
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      compareTotal: compareOf ? round2(lines.reduce((s, l) => s + (l.compare ?? 0), 0)) : null,
    });
  }
  return groups;
}

const groupTotal = (groups: StatementGroup[], key: 'total' | 'compareTotal') =>
  round2(groups.reduce((s, g) => s + (g[key] ?? 0), 0));

export interface IncomeStatement {
  from: string;
  to: string;
  compare: { from: string; to: string } | null;
  income: StatementGroup[];
  expenses: StatementGroup[];
  totalIncome: number;
  totalExpenses: number;
  surplus: number;
  compareIncome: number | null;
  compareExpenses: number | null;
  compareSurplus: number | null;
}

/** Statement of activities: income and expenses of a period (optionally of one department). */
export function incomeStatement(
  accounts: GlAccount[],
  lines: PostedLine[],
  from: string,
  to: string,
  compare: { from: string; to: string } | null,
  unitId?: string
): IncomeStatement {
  const inUnit = (l: PostedLine) => !unitId || l.unit_id === unitId;
  const cur = sumBy(lines, (l) => l.date >= from && l.date <= to && inUnit(l));
  const prev = compare ? sumBy(lines, (l) => l.date >= compare.from && l.date <= compare.to && inUnit(l)) : null;
  const amount = (m: Map<string, { dr: number; cr: number }>) => (a: GlAccount) => sectionAmount(a.type, net(m.get(a.id)));
  const income = groupLines(accounts, ['INCOME'], amount(cur), prev ? amount(prev) : null);
  const expenses = groupLines(accounts, ['EXPENSE'], amount(cur), prev ? amount(prev) : null);
  const totalIncome = groupTotal(income, 'total');
  const totalExpenses = groupTotal(expenses, 'total');
  const compareIncome = prev ? groupTotal(income, 'compareTotal') : null;
  const compareExpenses = prev ? groupTotal(expenses, 'compareTotal') : null;
  return {
    from,
    to,
    compare,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    surplus: round2(totalIncome - totalExpenses),
    compareIncome,
    compareExpenses,
    compareSurplus: prev ? round2((compareIncome ?? 0) - (compareExpenses ?? 0)) : null,
  };
}

export interface BalanceSheet {
  asOf: string;
  compareAsOf: string | null;
  currentAssets: StatementGroup[];
  nonCurrentAssets: StatementGroup[];
  currentLiabilities: StatementGroup[];
  longTermLiabilities: StatementGroup[];
  netAssets: StatementGroup[];
  totalAssets: number;
  totalLiabilities: number;
  totalNetAssets: number;
  compareTotalAssets: number | null;
  compareTotalLiabilities: number | null;
  compareTotalNetAssets: number | null;
  /** Assets − (liabilities + net assets); 0 when the books are in order */
  difference: number;
}

/** Statement of financial position on a date (optionally compared with another date). */
export function balanceSheet(
  accounts: GlAccount[],
  lines: PostedLine[],
  asOf: string,
  compareAsOf: string | null,
  fyStartOf: (date: string) => string
): BalanceSheet {
  const at = (date: string) => {
    const fy = fyStartOf(date);
    const balances = sumBy(lines, (l) => l.date <= date);
    const pl = new Set(accounts.filter((a) => !isBalanceSheet(a.type)).map((a) => a.id));
    let prior = 0;
    let year = 0;
    for (const l of lines) {
      if (l.date > date || !pl.has(l.account_id)) continue;
      if (l.date < fy) prior += l.credit - l.debit;
      else year += l.credit - l.debit;
    }
    return { balances, prior: round2(prior), year: round2(year) };
  };
  const cur = at(asOf);
  const prev = compareAsOf ? at(compareAsOf) : null;
  const amount = (s: ReturnType<typeof at>) => (a: GlAccount) => sectionAmount(a.type, net(s.balances.get(a.id)));
  const pick = (subs: string[]) => accounts.filter((a) => subs.includes(a.sub_type));
  const build = (subs: string[], types: GlType[]) => groupLines(pick(subs), types, amount(cur), prev ? amount(prev) : null);

  const currentAssets = build(['CASH_BANK', 'RECEIVABLE', 'CURRENT_ASSET'], ['ASSET']);
  const nonCurrentAssets = build(['FIXED_ASSET', 'OTHER_ASSET'], ['ASSET']);
  const currentLiabilities = build(['CURRENT_LIABILITY'], ['LIABILITY']);
  const longTermLiabilities = build(['LONG_TERM_LIABILITY'], ['LIABILITY']);
  const netAssets = build(['NET_ASSETS', 'RESTRICTED_FUND', 'OPENING_BALANCE'], ['EQUITY']);

  const surplusRows: StatementLine[] = [
    { account: null, label: ['Accumulated surplus (earlier years)', 'የተጠራቀመ ትርፍ (ያለፉት ዓመታት)'], amount: cur.prior, compare: prev ? prev.prior : null },
    { account: null, label: ['Surplus (deficit) for the year', 'የዓመቱ ትርፍ (ጉድለት)'], amount: cur.year, compare: prev ? prev.year : null },
  ];
  const surplusLines = surplusRows.filter((l) => l.amount !== 0 || (l.compare ?? 0) !== 0);
  if (surplusLines.length) {
    netAssets.push({
      code: 'SURPLUS',
      label: ['Surplus', 'ትርፍ'],
      lines: surplusLines,
      total: round2(surplusLines.reduce((s, l) => s + l.amount, 0)),
      compareTotal: prev ? round2(surplusLines.reduce((s, l) => s + (l.compare ?? 0), 0)) : null,
    });
  }

  const totalAssets = round2(groupTotal(currentAssets, 'total') + groupTotal(nonCurrentAssets, 'total'));
  const totalLiabilities = round2(groupTotal(currentLiabilities, 'total') + groupTotal(longTermLiabilities, 'total'));
  const totalNetAssets = groupTotal(netAssets, 'total');
  const cmp = (groups: StatementGroup[][]) => (prev ? round2(groups.reduce((s, g) => s + groupTotal(g, 'compareTotal'), 0)) : null);
  return {
    asOf,
    compareAsOf,
    currentAssets,
    nonCurrentAssets,
    currentLiabilities,
    longTermLiabilities,
    netAssets,
    totalAssets,
    totalLiabilities,
    totalNetAssets,
    compareTotalAssets: cmp([currentAssets, nonCurrentAssets]),
    compareTotalLiabilities: cmp([currentLiabilities, longTermLiabilities]),
    compareTotalNetAssets: cmp([netAssets]),
    difference: round2(totalAssets - totalLiabilities - totalNetAssets),
  };
}

export type CashSection = 'OPERATING' | 'INVESTING' | 'FINANCING' | 'OPENING';

export const CASH_SECTION_LABEL: Record<CashSection, Bilingual> = {
  OPERATING: ['Cash flows from operating activities', 'ከመደበኛ ሥራ የገንዘብ ፍሰት'],
  INVESTING: ['Cash flows from investing activities', 'ከኢንቨስትመንት የገንዘብ ፍሰት'],
  FINANCING: ['Cash flows from financing activities', 'ከፋይናንስ የገንዘብ ፍሰት'],
  OPENING: ['Opening balances recorded in the period', 'በጊዜው የተመዘገቡ መነሻ ቀሪዎች'],
};

function cashSection(a: GlAccount): CashSection {
  if (a.sub_type === 'OPENING_BALANCE') return 'OPENING';
  if (a.sub_type === 'FIXED_ASSET' || a.sub_type === 'OTHER_ASSET') return 'INVESTING';
  if (a.sub_type === 'LONG_TERM_LIABILITY' || a.type === 'EQUITY') return 'FINANCING';
  return 'OPERATING';
}

export interface CashFlowRow {
  account: Pick<GlAccount, 'id' | 'code' | 'name_en' | 'name_am'>;
  /** Positive = cash received, negative = cash paid */
  amount: number;
}

export interface CashFlow {
  from: string;
  to: string;
  opening: number;
  sections: { code: CashSection; rows: CashFlowRow[]; total: number }[];
  netChange: number;
  closing: number;
  /** Cash balance in the books on `to`; equals closing when every entry is balanced */
  bookClosing: number;
}

/**
 * Direct-method cash flow: the cash side of every entry that moved money,
 * shown against the accounts on the other side. Moves between two cash /
 * bank accounts are not flows.
 */
export function cashFlow(accounts: GlAccount[], lines: PostedLine[], from: string, to: string): CashFlow {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const isCash = (id: string) => byId.get(id)?.sub_type === 'CASH_BANK';
  let opening = 0;
  let bookClosing = 0;
  const entries = new Map<string, PostedLine[]>();
  for (const l of lines) {
    if (l.date > to) continue;
    if (isCash(l.account_id)) {
      bookClosing += l.debit - l.credit;
      if (l.date < from) opening += l.debit - l.credit;
    }
    if (l.date >= from) entries.set(l.entry_id, [...(entries.get(l.entry_id) ?? []), l]);
  }

  // An entry balances, so the cash it moved equals the sum of credit − debit
  // of its other lines: each of those lines is that much cash in (or out).
  const totals = new Map<string, number>();
  for (const group of entries.values()) {
    const cashNet = group.filter((l) => isCash(l.account_id)).reduce((s, l) => s + l.debit - l.credit, 0);
    if (Math.abs(cashNet) < 0.005) continue;
    for (const l of group) {
      if (!isCash(l.account_id)) totals.set(l.account_id, (totals.get(l.account_id) ?? 0) + l.credit - l.debit);
    }
  }

  const sections: CashFlow['sections'] = (['OPERATING', 'INVESTING', 'FINANCING', 'OPENING'] as CashSection[]).map((code) => {
    const rows: CashFlowRow[] = [];
    for (const a of chartOrder(accounts)) {
      const amount = round2(totals.get(a.id) ?? 0);
      if (amount === 0 || cashSection(a) !== code) continue;
      rows.push({ account: { id: a.id, code: a.code, name_en: a.name_en, name_am: a.name_am }, amount });
    }
    return { code, rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)) };
  }).filter((s) => s.rows.length > 0);

  const netChange = round2(sections.reduce((s, x) => s + x.total, 0));
  return { from, to, opening: round2(opening), sections, netChange, closing: round2(opening + netChange), bookClosing: round2(bookClosing) };
}

// ── What the pages receive ───────────────────────────────────────────────────

export interface GlUnit {
  id: string;
  name_en: string;
  name_am: string;
}

export interface ChartData {
  accounts: GlAccount[];
  /** bank_accounts id → name */
  bankNames: Record<string, string>;
  mappings: GlMapping[];
  settings: GlSettings;
  /** Categories in the fixed lists and in the records */
  categories: { income: string[]; expense: string[]; asset: string[] };
  /** Balance in the account's normal direction (income / expense: this fiscal year) */
  balances: Record<string, number>;
  /** Accounts that have journal lines */
  used: string[];
  fyStart: string;
}

export interface JournalLineView {
  account_id: string;
  code: string;
  name_en: string;
  name_am: string;
  debit: number;
  credit: number;
  description: string;
  unit_id: string | null;
  unit: string;
}

export interface JournalEntryView {
  id: string;
  entry_no: string;
  date: string;
  memo: string;
  reference: string;
  source: EntrySource;
  status: EntryStatus;
  total: number;
  lines: JournalLineView[];
  created_by_id: string | null;
  created_by: string;
  posted_by: string;
  posted_at: string | null;
  review_note: string;
  /** Entry number this one reverses / is reversed by */
  reverses: string;
  reversed_by: string;
}

export interface JournalData {
  /** Posted entries of the period, newest first */
  entries: JournalEntryView[];
  /** Drafts and entries waiting for approval (any date) */
  open: JournalEntryView[];
  accounts: GlAccount[];
  units: GlUnit[];
  settings: GlSettings;
  from: string;
  to: string;
}

export interface LedgerRow {
  entry_id: string;
  entry_no: string;
  date: string;
  memo: string;
  reference: string;
  source: EntrySource;
  description: string;
  unit: string;
  debit: number;
  credit: number;
  /** Running balance in the account's normal direction */
  balance: number;
}

export interface LedgerSection {
  account: GlAccount;
  opening: number;
  rows: LedgerRow[];
  debit: number;
  credit: number;
  closing: number;
}

export interface LedgerData {
  accounts: GlAccount[];
  settings: GlSettings;
  sections: LedgerSection[];
  from: string;
  to: string;
}

export type ReportKind = 'trial' | 'income' | 'balance' | 'cashflow';

export interface StatementsData {
  tenant: Bilingual;
  units: GlUnit[];
  settings: GlSettings;
  report: ReportKind;
  trial?: TrialBalance;
  income?: IncomeStatement;
  balance?: BalanceSheet;
  cashflow?: CashFlow;
}

// ── Display ──────────────────────────────────────────────────────────────────

/** 1,234.50 — negatives in brackets, as statements show them: (1,234.50) */
export function fmtAmount(n: number, blankZero = false): string {
  if (blankZero && Math.abs(n) < 0.005) return '';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < -0.004 ? `(${s})` : s;
}

/** A balance with its side: "1,234.50 Dr" */
export function fmtSide(net: number): string {
  if (Math.abs(net) < 0.005) return '0.00';
  return `${fmtAmount(Math.abs(net))} ${net > 0 ? 'Dr' : 'Cr'}`;
}

export interface PeriodPreset {
  key: string;
  label: Bilingual;
  from: string;
  to: string;
}

/** Quick choices for a report period, from the fiscal year setting */
export function periodPresets(today: string, fyStartSetting: string): PeriodPreset[] {
  const fy = fiscalYearStart(today, fyStartSetting);
  const lastFy = fiscalYearStart(addDays(fy, -1), fyStartSetting);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  const quarterStart = (() => {
    // Fiscal quarters: three-month blocks counted from the fiscal year start
    let q = fy;
    while (addDays(addMonths(q, 3), -1) < today) q = addMonths(q, 3);
    return q;
  })();
  return [
    { key: 'fy', label: ['This fiscal year', 'የዘንድሮ በጀት ዓመት'], from: fy, to: today },
    { key: 'lastfy', label: ['Last fiscal year', 'ያለፈው በጀት ዓመት'], from: lastFy, to: addDays(fy, -1) },
    { key: 'quarter', label: ['This quarter', 'የዚህ ሩብ ዓመት'], from: quarterStart, to: today },
    { key: 'month', label: ['This month', 'የዚህ ወር'], from: monthStart, to: today },
    { key: 'lastmonth', label: ['Last month', 'ያለፈው ወር'], from: lastMonthStart, to: lastMonthEnd },
  ];
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
