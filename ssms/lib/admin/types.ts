// ─────────────────────────────────────────────────────────────────────────────
// Administration data shapes shared by the admin pages and their server actions
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  username: string; // phone number in Supabase mode
  name: string;
  name_am: string;
  role_id: string | null;
  role: string;
  role_am: string;
  org_id: string | null;
  org: string;
  org_am: string;
  last_login: string | null; // ISO timestamp
  is_active: boolean;
  permissions: string[];
  /** Every active role the account holds, each in a unit, some until a date */
  assignments: AdminAssignment[];
}

/** One role held in one unit (user_unit_assignments) */
export interface AdminAssignment {
  id: string;
  role_id: string;
  role: string;
  role_am: string;
  unit_id: string;
  unit: string;
  unit_am: string;
  /** ISO timestamp, or null for no end */
  expires_at: string | null;
}

export interface AdminRoleRow {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  description_en: string | null;
  description_am: string | null;
  is_system_role: boolean;
  is_active: boolean;
  permissions: string[]; // permission codes
  /** Who holds this role now (active, unexpired assignments) */
  holders?: { user_id: string; name: string; name_am: string; unit: string; unit_am: string }[];
}

export interface AdminPermissionRow {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  category: string;
  is_active: boolean;
  /** Its module is not in this Sunday school's plan: holding it does nothing for now */
  unavailable?: boolean;
}

export interface AdminUnitRow {
  id: string;
  name_en: string;
  name_am: string;
}

export interface ParishSettings {
  parish_name_en: string;
  parish_name_am: string;
  diocese: string;
  foundation_year: string;
  motto: string;
}

/** system_settings key of the parish profile (Administration → Settings; also the public website) */
export const PARISH_SETTINGS_KEY = 'parish_profile';

export const DEFAULT_PARISH_SETTINGS: ParishSettings = {
  parish_name_en: 'Sallo Debre Tsehay Saint George Church Hamere Hiwot Sabbath School',
  parish_name_am: 'ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን ሐመረ ሕይወት ሰንበት ትምህርት ቤት',
  diocese: 'Addis Ababa Diocese (አዲስ አበባ ሀገረ ስብከት)',
  foundation_year: '፲፱፻፺፪ ዓ.ም (1992 E.C.)',
  motto: 'ነህ 2፥20 (Nehemiah 2:20)',
};

/** Result of loading a page's data: demo mode, live data, or a load error. */
export type Loaded<T> =
  | { mode: 'demo' }
  | { mode: 'live'; data: T }
  | { mode: 'error'; error: string };

export type LoadMode = 'loading' | Loaded<unknown>['mode'];

export type ActionResult = { ok: true } | { ok: false; error: string };
