-- =============================================================================
-- SSMS — Migration 048: Hymns on the public website, prayer requests
-- Depends on: 047 — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 048_public_hymns_prayers_down.sql
-- =============================================================================
-- • hymns.on_website: a hymn the choir chose to show (with its lyrics) on the
--   public website's Hymns page. Off by default — nothing becomes public by
--   itself.
-- • prayer_requests: "Pray for me" from the public website's Contact page —
--   a name and phone only if the person wants to give them. Private: only the
--   website managers see them (Public Website → Prayer requests); they are
--   not copied into the audit log.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_users' AND column_name = 'notification_prefs') THEN
    RAISE EXCEPTION 'Apply migration 047 first';
  END IF;
END $$;

ALTER TABLE hymns ADD COLUMN IF NOT EXISTS on_website BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_hymns_website ON hymns (tenant_id, title_am) WHERE on_website AND is_active;

CREATE TABLE IF NOT EXISTS prayer_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  name          TEXT,
  phone         TEXT,
  request       TEXT NOT NULL CHECK (length(trim(request)) BETWEEN 3 AND 1500),
  -- The person would like someone to call them back
  wants_call    BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'PRAYED', 'ARCHIVED')),
  handled_by    UUID,
  handled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prayer_requests_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT prayer_requests_call_phone CHECK (NOT wants_call OR phone IS NOT NULL),
  CONSTRAINT prayer_requests_handled_by_fkey FOREIGN KEY (tenant_id, handled_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (handled_by)
);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_list ON prayer_requests (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_phone ON prayer_requests (tenant_id, phone, created_at) WHERE phone IS NOT NULL;

-- Tenant plumbing, as migration 040 does for every tenant table (no audit trail: private)
CREATE INDEX IF NOT EXISTS idx_prayer_requests_tenant ON prayer_requests (tenant_id);
DROP TRIGGER IF EXISTS trg_tenant_guard ON prayer_requests;
CREATE TRIGGER trg_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON prayer_requests
  FOR EACH ROW EXECUTE FUNCTION tenant_guard();
ALTER TABLE prayer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE prayer_requests FROM anon, authenticated;
GRANT ALL ON TABLE prayer_requests TO service_role;

-- The list of tenant tables (used by 040's final check and future migrations)
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
    'spiritual_courses', 'course_completions', 'certificates', 'notifications',
    'event_registrations', 'prayer_requests'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
