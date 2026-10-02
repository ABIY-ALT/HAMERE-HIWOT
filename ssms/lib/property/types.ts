// ─────────────────────────────────────────────────────────────────────────────
// Property (assets, custody, maintenance, stocktake) — data shapes
// ─────────────────────────────────────────────────────────────────────────────

export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
export type AssetStatus = 'IN_USE' | 'IN_STORE' | 'UNDER_REPAIR' | 'DISPOSED' | 'LOST';
export type AcquisitionType = 'PURCHASE' | 'DONATION' | 'OTHER';
export type MaintenanceKind = 'REPAIR' | 'SERVICE' | 'INSPECTION';
export type MaintenanceStatus = 'OPEN' | 'DONE' | 'CANCELLED';

export interface Asset {
  id: string;
  tag: string;
  name_en: string;
  name_am: string;
  category: string;
  serial_no: string;
  condition: AssetCondition;
  status: AssetStatus;
  unit_id: string | null;
  unit: string;
  unit_am: string;
  custodian_id: string | null;
  custodian: string;
  location: string;
  acquired_on: string | null;
  acquisition_type: AcquisitionType;
  value: number | null;
  notes: string;
  last_verified_on: string | null;
}

export interface AssetMovement {
  id: string;
  asset_id: string;
  from_unit: string;
  to_unit: string;
  from_person: string;
  to_person: string;
  moved_on: string;
  reason: string;
  recorded_by: string;
}

export interface MaintenanceJob {
  id: string;
  asset_id: string;
  kind: MaintenanceKind;
  description: string;
  reported_on: string;
  completed_on: string | null;
  cost: number | null;
  handled_by: string;
  status: MaintenanceStatus;
  expense_booked: boolean;
}

export interface PropertyData {
  assets: Asset[];
  movements: AssetMovement[];
  maintenance: MaintenanceJob[];
  units: { id: string; name_en: string; name_am: string }[];
  people: { id: string; name: string }[];
}

export const EMPTY_PROPERTY: PropertyData = { assets: [], movements: [], maintenance: [], units: [], people: [] };

/** Stored in English; shown in Amharic when that language is chosen. */
export const ASSET_CATEGORIES: [string, string][] = [
  ['IT equipment', 'የኮምፒውተር ዕቃዎች'],
  ['Audio-visual & sound', 'የድምፅና የምስል መሣሪያዎች'],
  ['Musical instruments', 'የዜማ መሣሪያዎች (ከበሮ፣ ጸናጽል…)'],
  ['Liturgical items & vestments', 'ንዋያተ ቅድሳትና አልባሳት'],
  ['Books & library', 'መጻሕፍትና ቤተ መጻሕፍት'],
  ['Teaching materials', 'የማስተማሪያ ቁሳቁስ'],
  ['Furniture', 'የቤት ዕቃዎች'],
  ['Kitchen & catering', 'የወጥ ቤትና የመስተንግዶ ዕቃዎች'],
  ['Vehicles', 'ተሽከርካሪዎች'],
  ['Other', 'ሌላ'],
];

export function assetCategoryLabel(category: string, locale: string): string {
  if (locale !== 'am') return category;
  return ASSET_CATEGORIES.find(([en]) => en === category)?.[1] ?? category;
}

export const CONDITION_LABEL: Record<AssetCondition, [string, string]> = {
  NEW: ['New', 'አዲስ'],
  GOOD: ['Good', 'ጥሩ'],
  FAIR: ['Fair', 'መካከለኛ'],
  POOR: ['Poor', 'ደካማ'],
  DAMAGED: ['Damaged', 'የተበላሸ'],
};

export const STATUS_LABEL: Record<AssetStatus, [string, string]> = {
  IN_USE: ['In use', 'በአገልግሎት ላይ'],
  IN_STORE: ['In store', 'በመጋዘን'],
  UNDER_REPAIR: ['Under repair', 'በጥገና ላይ'],
  DISPOSED: ['Disposed', 'የተወገደ'],
  LOST: ['Lost', 'የጠፋ'],
};

export const STATUS_STYLE: Record<AssetStatus, string> = {
  IN_USE: 'badge badge-success',
  IN_STORE: 'badge badge-info',
  UNDER_REPAIR: 'badge badge-warning',
  DISPOSED: 'badge bg-slate-100 text-slate-500',
  LOST: 'badge badge-danger',
};

/** Assets still held by the Sunday school (not disposed or lost). */
export const isHeld = (a: Pick<Asset, 'status'>) => a.status !== 'DISPOSED' && a.status !== 'LOST';
