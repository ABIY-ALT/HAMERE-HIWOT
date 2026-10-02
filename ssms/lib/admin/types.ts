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
}

export interface AdminPermissionRow {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  category: string;
  is_active: boolean;
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
