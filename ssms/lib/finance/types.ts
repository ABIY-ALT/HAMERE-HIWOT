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
}

export interface FinanceUnit {
  id: string;
  name_en: string;
  name_am: string;
}

export interface FinanceData {
  requests: FinanceRequest[];
  transactions: FinanceTxn[];
  units: FinanceUnit[];
}

export const EMPTY_FINANCE: FinanceData = { requests: [], transactions: [], units: [] };

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
  ['Other', 'ሌላ'],
];

export const INCOME_CATEGORIES: [string, string][] = [
  ['Member Contributions', 'የአባላት መዋጮ'],
  ['Donations', 'ስጦታ / ልገሳ'],
  ['Church Support', 'ከቤተ ክርስቲያን ድጋፍ'],
  ['Events & Programs', 'ከዝግጅቶች ገቢ'],
  ['Sales', 'ሽያጭ'],
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
