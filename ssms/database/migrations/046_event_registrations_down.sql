-- =============================================================================
-- SSMS — Undo migration 046 (event sign-up)
-- Removes every registration (tickets stop working) and the sign-up settings
-- of programs.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS event_registrations;
DROP FUNCTION IF EXISTS event_registration_guard();

DROP INDEX IF EXISTS idx_programs_registration;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_registration_capacity;
ALTER TABLE programs
  DROP COLUMN IF EXISTS registration_open,
  DROP COLUMN IF EXISTS registration_capacity,
  DROP COLUMN IF EXISTS registration_closes_on;

-- The list of tenant tables as migration 045 left it
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
    'library_books', 'library_copies', 'library_loans', 'library_requests',
    'gl_accounts', 'gl_settings', 'gl_mappings', 'journal_entries', 'journal_lines',
    'spiritual_courses', 'course_completions', 'certificates', 'notifications'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
