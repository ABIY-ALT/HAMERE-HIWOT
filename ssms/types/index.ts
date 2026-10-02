// ─────────────────────────────────────────────────────────────────────────────
// SSMS Core Type Definitions
// These types mirror the PostgreSQL schema exactly.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enumerations ─────────────────────────────────────────────────────────────

export type Gender = 'MALE' | 'FEMALE';

export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'TRANSFERRED' | 'DECEASED';

export type GovernanceRelationshipType =
  | 'PARENT_OF'
  | 'REPORTS_TO'
  | 'SUPERVISES'
  | 'COORDINATES'
  | 'OVERSEES'
  | 'ADVISES';

export type GovernanceMembershipStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'RESIGNED'
  | 'REMOVED';

export type WorkflowStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type AuditAction =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'APPROVE'
  | 'REJECT'
  | 'EXPORT';

// ── Permission Codes ──────────────────────────────────────────────────────────

export type PermissionCode =
  // Student
  | 'STUDENT_VIEW'
  | 'STUDENT_CREATE'
  | 'STUDENT_UPDATE'
  | 'STUDENT_DELETE'
  // Attendance
  | 'ATTENDANCE_VIEW'
  | 'ATTENDANCE_RECORD'
  | 'ATTENDANCE_UPDATE'
  // Grades
  | 'GRADE_VIEW'
  | 'GRADE_CREATE'
  | 'GRADE_UPDATE'
  | 'GRADE_APPROVE'
  // Finance
  | 'FINANCE_VIEW'
  | 'FINANCE_CREATE'
  | 'FINANCE_APPROVE'
  | 'FINANCE_REQUEST'
  // Assets
  | 'ASSET_VIEW'
  | 'ASSET_CREATE'
  | 'ASSET_ASSIGN'
  | 'ASSET_TRANSFER'
  // Audit
  | 'AUDIT_VIEW_ALL'
  // Governance
  | 'GOVERNANCE_VIEW'
  | 'GOVERNANCE_MANAGE'
  // Reports
  | 'REPORT_VIEW'
  | 'REPORT_EXPORT'
  // Members
  | 'MEMBER_VIEW'
  | 'MEMBER_CREATE'
  | 'MEMBER_UPDATE'
  // Administration
  | 'USER_MANAGE'
  | 'ROLE_MANAGE'
  | 'SYSTEM_CONFIGURE'
  // Programs
  | 'PROGRAM_VIEW'
  | 'PROGRAM_CREATE'
  | 'PROGRAM_MANAGE'
  | 'CHOIR_MANAGE'
  // HR
  | 'HR_VIEW'
  | 'HR_MANAGE';

// ── Organization ──────────────────────────────────────────────────────────────

export type OrganizationUnitType =
  | 'GENERAL_ASSEMBLY'
  | 'AUDIT_COMMITTEE'
  | 'MANAGEMENT_BOARD'
  | 'MANAGEMENT_SECRETARIAT'
  | 'ADVISORY_COUNCIL'
  | 'EXECUTIVE_COMMITTEE'
  | 'EXECUTIVE_SECRETARIAT'
  | 'COORDINATION'
  | 'DEPARTMENT'
  | 'SUB_COMMITTEE';

export interface OrganizationUnit {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  unit_type: OrganizationUnitType;
  ltree_path: string;
  parent_id: string | null;
  description_en: string | null;
  description_am: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRelationship {
  id: string;
  from_unit_id: string;
  to_unit_id: string;
  relationship_type: GovernanceRelationshipType;
  description_en: string | null;
  description_am: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Person / Member ───────────────────────────────────────────────────────────

export interface Person {
  id: string;
  membership_code: string;
  full_name_en: string;
  full_name_am: string | null;
  baptismal_name: string | null;
  gender: Gender;
  date_of_birth: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  father_of_confession: string | null;
  profile_photo_url: string | null;
  status: MemberStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── System User ───────────────────────────────────────────────────────────────

export interface SystemUser {
  id: string;
  auth_user_id: string; // links to Supabase auth.users.id
  person_id: string;
  username: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  person?: Person;
}

// ── Governance ────────────────────────────────────────────────────────────────

export interface GovernanceBody {
  id: string;
  organization_unit_id: string;
  name_en: string;
  name_am: string;
  description_en: string | null;
  description_am: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  organization_unit?: OrganizationUnit;
}

export interface GovernancePosition {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  authority_level: number;
  is_active: boolean;
  created_at: string;
}

export interface GovernanceMembership {
  id: string;
  body_id: string;
  person_id: string;
  position_id: string;
  appointment_date: string;
  term_start: string;
  term_end: string | null;
  status: GovernanceMembershipStatus;
  appointed_by: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  person?: Person;
  body?: GovernanceBody;
  position?: GovernancePosition;
}

export interface GovernanceBodyRule {
  id: string;
  body_id: string;
  rule_code: string; // e.g. 'EXACT_MEMBER_COUNT'
  rule_value: string; // e.g. '9'
  description_en: string;
  description_am: string;
  is_enforced: boolean;
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  description_en: string | null;
  description_am: string | null;
  is_system_role: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  code: PermissionCode;
  name_en: string;
  name_am: string;
  description_en: string | null;
  category: string;
  is_active: boolean;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  granted_at: string;
}

export interface UserUnitAssignment {
  id: string;
  system_user_id: string;
  organization_unit_id: string;
  role_id: string;
  assigned_at: string;
  expires_at: string | null;
  is_active: boolean;
  assigned_by: string | null;
  // Joined
  role?: Role;
  organization_unit?: OrganizationUnit;
}

// ── Auth Context ──────────────────────────────────────────────────────────────

export interface AuthUser {
  systemUser: SystemUser;
  person: Person;
  assignments: UserUnitAssignment[];
  permissions: Set<PermissionCode>;
  organizationIds: string[];
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  table_name: string;
  record_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  organization_unit_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined
  user?: SystemUser;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

export interface LocalizedString {
  en: string;
  am: string;
}

export type Locale = 'en' | 'am';

export interface SelectOption {
  value: string;
  label: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}
