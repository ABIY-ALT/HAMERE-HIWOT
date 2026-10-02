// ─────────────────────────────────────────────────────────────────────────────
// Donations & pledges — data shapes and fixed lists
// ─────────────────────────────────────────────────────────────────────────────

export type DonationType = 'CASH' | 'BANK' | 'IN_KIND';
export type DonationStatus = 'PLEDGED' | 'RECEIVED' | 'CANCELLED';

export interface Donation {
  id: string;
  receipt_no: string;
  donor_name: string;
  donor_phone: string;
  donor_person_id: string | null;
  type: DonationType;
  purpose: string;
  amount: number;
  item_description: string;
  status: DonationStatus;
  pledged_on: string | null;
  received_on: string | null;
  notes: string;
  recorded_by: string;
  created_at: string;
}

export interface DonorOption {
  id: string;
  name: string;
  phone: string;
}

/** Stored in English; shown in Amharic when that language is chosen. */
export const DONATION_PURPOSES: [string, string][] = [
  ['General Fund', 'አጠቃላይ ፈንድ'],
  ['Building Fund', 'የሕንፃ ማሠሪያ'],
  ['Education Support', 'የትምህርት ድጋፍ'],
  ['Library / Books', 'ቤተ መጻሕፍት / መጻሕፍት'],
  ['Charity for the Needy', 'ለችግረኞች ድጋፍ'],
  ['Choir & Sacred Arts', 'መዝሙርና ኪነ ጥበብ'],
  ['Holidays & Events', 'በዓላትና ዝግጅቶች'],
  ['Other', 'ሌላ'],
];

export function purposeLabel(purpose: string, locale: string): string {
  if (locale !== 'am') return purpose;
  return DONATION_PURPOSES.find(([en]) => en === purpose)?.[1] ?? purpose;
}
