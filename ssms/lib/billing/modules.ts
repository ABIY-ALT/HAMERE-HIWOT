// ─────────────────────────────────────────────────────────────────────────────
// Feature modules a plan can include (platform_modules, migration 041).
// Everything not listed here (members, governance, organization, users and
// roles, settings, reports) is core and always on.
//
// A module missing from the tenant's plan switches off:
//   • its permissions (PERMISSION_MODULE) — removed when the session loads, so
//     every authorize(), page and menu check already respects the plan;
//   • its pages (moduleForPath) and the server actions behind them
//     (authorizeIn(module, …) in lib/auth/authorize.ts), for modules whose
//     pages share permissions with others.
// ─────────────────────────────────────────────────────────────────────────────

import type { PermissionCode } from '@/types';

export const MODULE_CODES = [
  'education', 'online_exams', 'portals', 'programs', 'check_in', 'sacred_arts', 'hr', 'finance',
  'dues', 'property', 'library', 'tasks', 'telegram', 'website', 'reports_export', 'audit', 'automation',
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

export function isModuleCode(code: string): code is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(code);
}

export const MODULE_LABELS: Record<ModuleCode, [en: string, am: string]> = {
  education: ['Education', 'ትምህርት'],
  online_exams: ['Online exams', 'የኦንላይን ፈተና'],
  portals: ['Student & parent portals', 'የተማሪና ወላጅ መግቢያ'],
  programs: ['Programs & events', 'ፕሮግራሞች'],
  check_in: ['Check-in', 'መገኘት መመዝገቢያ'],
  sacred_arts: ['Choir & sacred arts', 'ዜማና ቅዱስ ጥበብ'],
  hr: ['Human resources', 'የሰው ሀብት'],
  finance: ['Finance & budget', 'ፋይናንስ'],
  dues: ['Member dues', 'ወርሃዊ መዋጮ'],
  property: ['Property & assets', 'ንብረት'],
  library: ['Library', 'ቤተ መጻሕፍት'],
  tasks: ['Tasks, plans & questions', 'ተግባራትና እቅድ'],
  telegram: ['Telegram bot', 'ቴሌግራም ቦት'],
  website: ['Public website', 'ድረ ገጽ'],
  reports_export: ['Advanced reports & exports', 'ሪፖርትና መላክ'],
  audit: ['Audit trail', 'የኦዲት መዝገብ'],
  automation: ['Daily automation & reminders', 'ራስ-ሰር ማስታወሻ'],
};

/** A module that only works together with another one. */
export const MODULE_REQUIRES: Partial<Record<ModuleCode, ModuleCode[]>> = {
  online_exams: ['education'],
  portals: ['education'],
  dues: ['finance'],
};

export const PERMISSION_MODULE: Partial<Record<PermissionCode, ModuleCode>> = {
  STUDENT_VIEW: 'education',
  STUDENT_CREATE: 'education',
  STUDENT_UPDATE: 'education',
  STUDENT_DELETE: 'education',
  ATTENDANCE_VIEW: 'education',
  ATTENDANCE_RECORD: 'education',
  ATTENDANCE_UPDATE: 'education',
  GRADE_VIEW: 'education',
  GRADE_CREATE: 'education',
  GRADE_UPDATE: 'education',
  GRADE_APPROVE: 'education',
  STUDENT_PORTAL: 'portals',
  PARENT_PORTAL: 'portals',
  FINANCE_VIEW: 'finance',
  FINANCE_CREATE: 'finance',
  FINANCE_APPROVE: 'finance',
  FINANCE_REQUEST: 'finance',
  ASSET_VIEW: 'property',
  ASSET_CREATE: 'property',
  ASSET_ASSIGN: 'property',
  ASSET_TRANSFER: 'property',
  LIBRARY_VIEW: 'library',
  LIBRARY_MANAGE: 'library',
  PROGRAM_VIEW: 'programs',
  PROGRAM_CREATE: 'programs',
  PROGRAM_MANAGE: 'programs',
  CHOIR_MANAGE: 'sacred_arts',
  HR_VIEW: 'hr',
  HR_MANAGE: 'hr',
  TASK_ASSIGN: 'tasks',
  TASK_REPORT: 'tasks',
  WEBSITE_MANAGE: 'website',
  REPORT_EXPORT: 'reports_export',
};

/** Longest prefix first; matched on whole path segments. */
const ROUTE_MODULES: [prefix: string, module: ModuleCode][] = [
  ['/dashboard/education/exams', 'online_exams'],
  ['/dashboard/people/students/logins', 'portals'],
  ['/dashboard/people/students/parents', 'portals'],
  ['/dashboard/finance/dues', 'dues'],
  ['/dashboard/admin/automation', 'automation'],
  ['/dashboard/admin/telegram', 'telegram'],
  ['/dashboard/people/students', 'education'],
  ['/dashboard/people/teachers', 'hr'],
  ['/dashboard/people/choir', 'sacred_arts'],
  ['/dashboard/education', 'education'],
  ['/dashboard/my', 'portals'],
  ['/dashboard/family', 'portals'],
  ['/dashboard/programs', 'programs'],
  ['/dashboard/check-in', 'check_in'],
  ['/dashboard/sacred-arts', 'sacred_arts'],
  ['/dashboard/my-service', 'sacred_arts'],
  ['/dashboard/hr', 'hr'],
  ['/dashboard/finance', 'finance'],
  ['/dashboard/property', 'property'],
  ['/dashboard/library', 'library'],
  ['/dashboard/tasks', 'tasks'],
  ['/dashboard/my-tasks', 'tasks'],
  ['/dashboard/plans', 'tasks'],
  ['/dashboard/questions', 'tasks'],
  ['/dashboard/telegram', 'telegram'],
  ['/dashboard/website', 'website'],
  ['/dashboard/audit', 'audit'],
  ['/exam', 'online_exams'],
];

/** The module a page belongs to, or null for core pages. */
export function moduleForPath(pathname: string): ModuleCode | null {
  for (const [prefix, code] of ROUTE_MODULES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return code;
  }
  return null;
}

/** Drops the permissions of modules the tenant does not have. */
export function permissionsForModules<P extends string>(permissions: P[], modules: ReadonlySet<string>): P[] {
  return permissions.filter((p) => {
    const code = PERMISSION_MODULE[p as unknown as PermissionCode];
    return !code || modules.has(code);
  });
}
