// ─────────────────────────────────────────────────────────────────────────────
// Finance module data shapes (payment requests + income/expense ledger)
// ─────────────────────────────────────────────────────────────────────────────

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'COMPLETED' | 'CANCELLED';
export type RequestPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TxnType = 'INCOME' | 'EXPENSE';

export interface FinanceRequest {
  id: string;
  request_no: string;
  unit_id: string;
  unit: string;
  unit_am: string;
  requested_by_id: string;
  requested_by: string;
  title: string;
  category: string;
  amount: number;
  needed_by: string | null;
  justification: string;
  priority: RequestPriority;
  status: RequestStatus;
  review_note: string;
  reviewed_by: string;
  reviewed_at: string | null;
  paid_at: string | null;
  payment_reference: string;
  created_at: string;
}

export interface FinanceTxn {
  id: string;
  type: TxnType;
  category: string;
  amount: number;
  date: string;
  description: string;
  party: string;
  receipt_no: string;
  unit: string;
  request_no: string;
  recorded_by: string;
  /** Bank account / cash box it went through ('' = not given; migration 042) */
  account?: string;
}

/** An account money can go through (migration 042) */
export interface FinanceAccount {
  id: string;
  name: string;
  kind: 'BANK' | 'CASH' | 'MOBILE';
}

export interface FinanceUnit {
  id: string;
  name_en: string;
  name_am: string;
}

/** One department's budget for an academic year, with what has been used. */
export interface BudgetLine {
  unit_id: string;
  unit: string;
  unit_am: string;
  unit_type: string;
  allocated: number | null; // null = no budget set
  notes: string;
  spent: number; // paid expenses
  committed: number; // approved requests not yet paid
  pending: number; // requests awaiting approval
}

export interface BudgetYear {
  id: string;
  name: string;
  is_current: boolean;
  start_date: string;
  end_date: string;
}

/** Money still free: allocation minus spent and committed. null when no budget is set. */
export function budgetRemaining(line: Pick<BudgetLine, 'allocated' | 'spent' | 'committed'>): number | null {
  return line.allocated === null ? null : line.allocated - line.spent - line.committed;
}

export interface FinanceData {
  requests: FinanceRequest[];
  transactions: FinanceTxn[];
  units: FinanceUnit[];
  /** Current academic year's budget for the units this user may see. */
  budget: BudgetLine[];
  budgetYear: string | null;
  /** Active accounts for the "paid from / received into" choice; empty before migration 042 */
  accounts: FinanceAccount[];
}

export const EMPTY_FINANCE: FinanceData = { requests: [], transactions: [], units: [], budget: [], budgetYear: null, accounts: [] };

/** Stored in English; shown in Amharic when that language is chosen. */
export const EXPENSE_CATEGORIES: [string, string][] = [
  ['Stationery & Supplies', 'የጽሕፈት መሣሪያና ቁሳቁስ'],
  ['Teaching Materials', 'የማስተማሪያ ቁሳቁስ'],
  ['Programs & Events', 'ፕሮግራምና ዝግጅቶች'],
  ['Transport', 'ትራንስፖርት'],
  ['Food & Refreshments', 'ምግብና መስተንግዶ'],
  ['Equipment', 'መሣሪያዎች'],
  ['Maintenance & Repair', 'ጥገና'],
  ['Printing & Media', 'ሕትመትና ሚዲያ'],
  ['Utilities', 'አገልግሎቶች (መብራት፣ ውሃ)'],
  ['Charity & Support', 'የበጎ አድራጎት ድጋፍ'],
  ['Bank Charges', 'የባንክ ክፍያ'],
  ['Other', 'ሌላ'],
];

export const INCOME_CATEGORIES: [string, string][] = [
  ['Member Contributions', 'የአባላት መዋጮ'],
  ['Donations', 'ስጦታ / ልገሳ'],
  ['Church Support', 'ከቤተ ክርስቲያን ድጋፍ'],
  ['Events & Programs', 'ከዝግጅቶች ገቢ'],
  ['Sales', 'ሽያጭ'],
  ['Bank Interest', 'የባንክ ወለድ'],
  ['Other', 'ሌላ'],
];

export function categoryLabel(category: string, locale: string): string {
  if (locale !== 'am') return category;
  const found = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find(([en]) => en === category);
  return found ? found[1] : category;
}

export function formatETB(amount: number): string {
  return `ETB ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
