-- =============================================================================
-- SSMS — Undo migration 044 (general ledger)
-- Removes the chart of accounts, posting rules, settings and every journal
-- entry (manual ones too). Income, expense, transfer and bank records stay.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_gl_sync ON finance_transactions;
DROP TRIGGER IF EXISTS trg_gl_sync ON account_transfers;
DROP TRIGGER IF EXISTS trg_gl_sync ON bank_accounts;

DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS gl_mappings;
DROP TABLE IF EXISTS gl_settings;
DROP TABLE IF EXISTS gl_accounts;

DROP FUNCTION IF EXISTS gl_sync_transaction();
DROP FUNCTION IF EXISTS gl_sync_transfer();
DROP FUNCTION IF EXISTS gl_sync_bank_account();
DROP FUNCTION IF EXISTS gl_repost(DATE, UUID);
DROP FUNCTION IF EXISTS gl_post_opening(UUID, UUID);
DROP FUNCTION IF EXISTS gl_post_transfer(UUID, UUID);
DROP FUNCTION IF EXISTS gl_post_transaction(UUID, UUID);
DROP FUNCTION IF EXISTS gl_post_pair(UUID, DATE, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID, NUMERIC, UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS gl_category_account(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS gl_bank_account(UUID, UUID);
DROP FUNCTION IF EXISTS gl_default_account(UUID, TEXT);
DROP FUNCTION IF EXISTS gl_ensure_chart(UUID);
DROP FUNCTION IF EXISTS gl_settings_guard();
DROP FUNCTION IF EXISTS gl_line_guard();
DROP FUNCTION IF EXISTS gl_entry_guard();
DROP FUNCTION IF EXISTS gl_mapping_guard();
DROP FUNCTION IF EXISTS gl_account_guard();
DROP FUNCTION IF EXISTS gl_raise_locked(UUID);
DROP FUNCTION IF EXISTS gl_locked(UUID, DATE);

DELETE FROM tenant_counters WHERE name = 'journal_entry';

-- The list of tenant tables as migration 043 left it
CREATE OR REPLACE FUNCTION _mt_tenant_tables()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
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
    'tenant_counters', 'tenant_secrets',
    'bank_accounts', 'account_transfers', 'bank_statements', 'bank_statement_lines',
    'library_books', 'library_copies', 'library_loans', 'library_requests'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
