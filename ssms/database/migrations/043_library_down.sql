-- =============================================================================
-- SSMS — Undo migration 043 (library). Deletes the catalogue, every copy and
-- the whole lending history, the Librarian role and the library permissions.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS library_requests;
DROP TABLE IF EXISTS library_loans;
DROP TABLE IF EXISTS library_copies;
DROP TABLE IF EXISTS library_books;
DROP FUNCTION IF EXISTS library_sync_copy();

DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ('LIBRARY_VIEW', 'LIBRARY_MANAGE'));
DELETE FROM user_unit_assignments WHERE role_id IN (SELECT id FROM roles WHERE code = 'LIBRARIAN');
DELETE FROM roles WHERE code = 'LIBRARIAN';
DELETE FROM permissions WHERE code IN ('LIBRARY_VIEW', 'LIBRARY_MANAGE');
DELETE FROM tenant_counters WHERE name = 'library_copy';

UPDATE plans SET features = array_remove(features, 'library');
DELETE FROM platform_modules WHERE code = 'library';

-- Back to the list of migration 042
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
    'bank_accounts', 'account_transfers', 'bank_statements', 'bank_statement_lines'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
