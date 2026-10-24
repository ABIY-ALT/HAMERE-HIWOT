// ─────────────────────────────────────────────────────────────────────────────
// Fixed assets register and depreciation (migration 047) — data shapes and
// month helpers, with no server code. The database writes the entries
// (gl_post_asset, gl_post_depreciation, gl_post_disposal).
// ─────────────────────────────────────────────────────────────────────────────

import type { GlAccount } from './gl';

export const ASSETS_MIGRATION = 'Run database migration 047 (fixed assets and depreciation) first';

export interface FixedAsset {
  id: string;
  tag: string;
  name_en: string;
  name_am: string;
  category: string;
  status: string;
  unit: string;
  unit_am: string;
  acquisition_type: 'PURCHASE' | 'DONATION' | 'OTHER';
  /** Cost (assets.value) */
  cost: number | null;
  acquired_on: string | null;
  useful_life_months: number | null;
  salvage_value: number;
  depreciation_start: string | null;
  gl_account_id: string | null;
  booked_against_id: string | null;
  disposed_on: string | null;
  /** Depreciation posted so far */
  accumulated: number;
  /** The entry that put the cost in the books, and the disposal entry */
  entry_no: string | null;
  disposal_no: string | null;
}

export interface DepreciationRun {
  month: string; // YYYY-MM-01
  entry_no: string;
  total: number;
  entry_date: string;
}

export interface DepreciationLine {
  asset_id: string;
  tag: string;
  name_en: string;
  cost: number;
  salvage: number;
  life: number;
  months: number;
  booked: number;
  amount: number;
}

export interface FixedAssetsData {
  assets: FixedAsset[];
  runs: DepreciationRun[];
  /** Usable accounts, for the account choices */
  accounts: GlAccount[];
  /** Asset category → its fixed-asset account (rule), and the default */
  categoryAccount: Record<string, string>;
  defaultAccount: string | null;
  /** Suggested "booked against" accounts */
  suggestions: { opening: string | null; donations: string | null };
  lockDate: string | null;
  canManage: boolean;
}

/** YYYY-MM-01 of the month before the one `today` is in (the last month that has ended) */
export function lastEndedMonth(today: string): string {
  const [y, m] = today.split('-').map(Number);
  const total = y * 12 + (m - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** YYYY-MM-01 of the month after `month` */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + m;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" (depreciation runs by calendar month, like the statements) */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Book value: cost less depreciation; null when there is no cost */
export const bookValue = (a: FixedAsset) => (a.cost === null ? null : Math.round((a.cost - a.accumulated) * 100) / 100);
