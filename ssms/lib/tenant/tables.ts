// ─────────────────────────────────────────────────────────────────────────────
// Which tables belong to a tenant (migration 040 → _mt_tenant_tables()).
// Keep the two lists in step: a table missing here cannot be reached through
// the tenant-scoped client at all (lib/tenant/db.ts refuses it).
// ─────────────────────────────────────────────────────────────────────────────

export const TENANT_TABLES = new Set<string>([
  'organization_units', 'organization_relationships', 'persons', 'system_users',
  'governance_bodies', 'governance_body_rules', 'governance_positions', 'governance_memberships',
  'roles', 'role_permissions', 'user_unit_assignments', 'system_audit_logs',
  'academic_years', 'classes', 'subjects', 'students', 'student_guardians', 'enrollments',
  'attendance_sessions', 'attendance_records', 'grades',
  'system_settings', 'finance_requests', 'finance_transactions', 'budget_allocations', 'donations',
  'programs', 'assets', 'asset_movements', 'asset_maintenance',
  'choir_members', 'hymns', 'choir_sessions', 'choir_session_hymns', 'choir_attendance',
  'service_assignments', 'servant_attendance', 'discipline_cases', 'push_subscriptions',
  'tasks', 'task_updates', 'task_series', 'task_files',
  'exams', 'exam_questions', 'exam_attempts',
  'telegram_links', 'telegram_link_codes', 'telegram_broadcasts', 'telegram_sessions', 'telegram_chats',
  'dues_rates', 'member_dues', 'dues_claims',
  'unit_plans', 'plan_activities', 'plan_updates', 'member_questions',
  'checkin_events', 'checkins', 'service_roster', 'vestments', 'vestment_loans',
  'automation_log', 'site_posts', 'site_albums', 'site_photos',
  'bank_accounts', 'account_transfers', 'bank_statements', 'bank_statement_lines',
  'library_books', 'library_copies', 'library_loans', 'library_requests',
  // view (carries tenant_id)
  'attendance_session_totals',
]);

/** Shared by every tenant, read-only through the scoped client. */
export const GLOBAL_READ_TABLES = new Set<string>(['permissions']);

/**
 * Tables whose upsert key became (tenant_id, …) in 040. An upsert written as
 * { onConflict: 'key' } is sent as 'tenant_id,key' so call sites stay as they were.
 */
export const TENANT_KEYED_CONFLICTS: Record<string, string[]> = {
  system_settings: ['key'],
  dues_rates: ['year'],
  bank_statement_lines: ['bank_account_id,fingerprint'],
  telegram_sessions: ['chat_id'],
  telegram_chats: ['chat_id'],
  automation_log: ['job,ref'],
  push_subscriptions: ['endpoint'],
};

/** Tables a read-only (unpaid / expired) tenant may still write: sign-in plumbing, not records. */
export const READ_ONLY_WRITABLE = new Set<string>([
  'system_audit_logs', 'push_subscriptions', 'telegram_sessions', 'telegram_chats', 'telegram_links', 'telegram_link_codes',
]);

/** Database functions the scoped client may call (each uses the x-ssms-tenant header). */
export const TENANT_RPCS = new Set<string>(['next_dues_receipt']);

/** Storage buckets tenant code uses; objects live under "<tenant id>/…". */
export const TENANT_BUCKETS = new Set<string>(['member-photos', 'task-files', 'site-media', 'dues-proofs']);
