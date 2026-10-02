// ─────────────────────────────────────────────────────────────────────────────
// Audit trail data shapes
// ─────────────────────────────────────────────────────────────────────────────

export type AuditActionType = 'INSERT' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT' | 'EXPORT';

export interface AuditEntry {
  id: string;
  created_at: string;
  action: AuditActionType;
  table_name: string;
  record_id: string;
  record_label: string;
  actor_id: string | null;
  actor: string; // '' = system / database
  unit: string;
  ip: string;
  user_agent: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

export interface AuditFilter {
  table?: string;
  action?: string;
  actorId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  /** Keyset cursor: load entries older than this one. */
  before?: { created_at: string; id: string };
}

export interface AuditPage {
  entries: AuditEntry[];
  hasMore: boolean;
  actors: { id: string; name: string }[];
}

/** Friendly names for the logged tables (English, Amharic). */
export const AUDIT_AREAS: Record<string, [string, string]> = {
  persons: ['People / members', 'ሰዎች / አባላት'],
  system_users: ['User accounts & sign-ins', 'የተጠቃሚ መለያዎችና መግቢያ'],
  user_unit_assignments: ['Role assignments', 'የሚና ምደባዎች'],
  roles: ['Roles', 'ሚናዎች'],
  role_permissions: ['Role permissions', 'የሚና ፈቃዶች'],
  permissions: ['Permissions', 'ፈቃዶች'],
  organization_units: ['Organization units', 'የድርጅት ክፍሎች'],
  governance_bodies: ['Governance bodies', 'የአስተዳደር አካላት'],
  governance_body_rules: ['Governance rules', 'የአስተዳደር ደንቦች'],
  governance_memberships: ['Governance appointments', 'የአስተዳደር ሹመቶች'],
  academic_years: ['Academic years', 'የትምህርት ዓመታት'],
  classes: ['Classes', 'ክፍሎች'],
  subjects: ['Subjects', 'የትምህርት ዓይነቶች'],
  students: ['Students', 'ተማሪዎች'],
  enrollments: ['Class enrollments', 'የክፍል ምዝገባ'],
  grades: ['Grades', 'ውጤቶች'],
  attendance_sessions: ['Attendance', 'ክትትል'],
  finance_requests: ['Payment requests', 'የክፍያ ጥያቄዎች'],
  finance_transactions: ['Income & expenses', 'ገቢና ወጪ'],
  budget_allocations: ['Budgets', 'በጀት'],
  system_settings: ['System settings', 'የስርዓት ቅንብሮች'],
};

/** Fields that are not worth showing in a change list. */
export const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at']);
