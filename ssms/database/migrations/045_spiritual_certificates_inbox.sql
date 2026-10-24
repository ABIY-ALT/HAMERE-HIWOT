-- =============================================================================
-- SSMS — Migration 045: Spiritual life, certificates and the notification inbox
-- Depends on: 040 (multi-tenancy), 041 and 044 (general ledger) — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 045_spiritual_certificates_inbox_down.sql
-- =============================================================================
-- What it adds
-- • persons: baptism date and church, and the confession father's phone (the
--   confession father's name and the Christian name were already there).
-- • spiritual_courses / course_completions: the courses, trainings, seminars
--   and retreats a Sunday school gives, and who completed which.
-- • certificates: course completion, graduation, service, membership or
--   appreciation — numbered CRT-<year>-0001 per Sunday school, with a public
--   verify code (the QR on the printed certificate opens /verify/<code>).
--   A certificate given in error is revoked, never deleted.
-- • notifications: every push / Telegram notice a user gets is also kept in
--   their inbox (the bell), read or unread. Old ones are cleared by the daily
--   automation.
-- The orthodox calendar (feasts and fasts) is computed (lib/calendar); its
-- reminders use automation_log like the other daily jobs — no table needed.
-- Who may do what is checked by the server; the public API keys have no
-- access, as for every tenant table.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regprocedure('public.tenant_fill_number()') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 040 (multi-tenancy) first';
  END IF;
  IF to_regclass('public.plans') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 041 (billing and platform) first';
  END IF;
  IF to_regclass('public.gl_accounts') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 044 (general ledger) first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Spiritual life on the member record
-- -----------------------------------------------------------------------------
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS baptism_date             DATE,
  ADD COLUMN IF NOT EXISTS baptism_church           TEXT,
  ADD COLUMN IF NOT EXISTS confession_father_phone  TEXT;

-- -----------------------------------------------------------------------------
-- Courses and who completed them
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spiritual_courses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  name_en      TEXT NOT NULL CHECK (length(trim(name_en)) > 1),
  name_am      TEXT,
  kind         TEXT NOT NULL DEFAULT 'COURSE' CHECK (kind IN ('COURSE', 'TRAINING', 'SEMINAR', 'RETREAT', 'OTHER')),
  hours        NUMERIC(6,1) CHECK (hours IS NULL OR hours > 0),
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT spiritual_courses_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT spiritual_courses_tid_name_key UNIQUE (tenant_id, name_en),
  CONSTRAINT spiritual_courses_created_by_fkey FOREIGN KEY (tenant_id, created_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (created_by)
);

CREATE TABLE IF NOT EXISTS course_completions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  course_id     UUID NOT NULL,
  person_id     UUID NOT NULL,
  completed_on  DATE NOT NULL,
  result        TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (result IN ('COMPLETED', 'PASSED', 'ATTENDED')),
  note          TEXT,
  recorded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_completions_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT course_completions_once UNIQUE (tenant_id, course_id, person_id),
  CONSTRAINT course_completions_course_fkey FOREIGN KEY (tenant_id, course_id)
    REFERENCES spiritual_courses (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT course_completions_person_fkey FOREIGN KEY (tenant_id, person_id)
    REFERENCES persons (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT course_completions_recorded_by_fkey FOREIGN KEY (tenant_id, recorded_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (recorded_by)
);
CREATE INDEX IF NOT EXISTS idx_course_completions_person ON course_completions (tenant_id, person_id);

-- -----------------------------------------------------------------------------
-- Certificates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  certificate_no  TEXT NOT NULL,  -- CRT-<year>-0001, filled by trg_number
  -- Public: /verify/<code> (unguessable, the same in every Sunday school's space)
  verify_code     TEXT NOT NULL UNIQUE DEFAULT replace(uuid_generate_v4()::TEXT, '-', ''),
  person_id       UUID,
  -- Kept as printed, so the certificate reads the same if the record changes
  person_name_en  TEXT NOT NULL,
  person_name_am  TEXT,
  kind            TEXT NOT NULL CHECK (kind IN ('COURSE', 'GRADUATION', 'SERVICE', 'MEMBERSHIP', 'APPRECIATION', 'OTHER')),
  title_en        TEXT NOT NULL,
  title_am        TEXT,
  -- "for completing …" / "for faithful service in …"
  reason_en       TEXT,
  reason_am       TEXT,
  issued_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  completion_id   UUID,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT,
  issued_by       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT certificates_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT certificates_tid_no_key UNIQUE (tenant_id, certificate_no),
  CONSTRAINT certificates_person_fkey FOREIGN KEY (tenant_id, person_id)
    REFERENCES persons (tenant_id, id) ON DELETE SET NULL (person_id),
  CONSTRAINT certificates_completion_fkey FOREIGN KEY (tenant_id, completion_id)
    REFERENCES course_completions (tenant_id, id) ON DELETE SET NULL (completion_id),
  CONSTRAINT certificates_issued_by_fkey FOREIGN KEY (tenant_id, issued_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (issued_by),
  CONSTRAINT certificates_revoked_reason CHECK (revoked_at IS NULL OR length(trim(coalesce(revoked_reason, ''))) > 2)
);
CREATE INDEX IF NOT EXISTS idx_certificates_person ON certificates (tenant_id, person_id);
CREATE INDEX IF NOT EXISTS idx_certificates_issued ON certificates (tenant_id, issued_on DESC);

DROP TRIGGER IF EXISTS trg_number ON certificates;
CREATE TRIGGER trg_number BEFORE INSERT ON certificates
  FOR EACH ROW EXECUTE FUNCTION tenant_fill_number('certificate_no', 'certificate', 'CRT');

-- -----------------------------------------------------------------------------
-- Notification inbox
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  system_user_id  UUID NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  url             TEXT NOT NULL DEFAULT '/dashboard',
  tag             TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_user_fkey FOREIGN KEY (tenant_id, system_user_id)
    REFERENCES system_users (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (tenant_id, system_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (tenant_id, system_user_id) WHERE read_at IS NULL;

-- -----------------------------------------------------------------------------
-- Tenant plumbing, as migration 040 does for every tenant table
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['spiritual_courses', 'course_completions', 'certificates', 'notifications'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', left('idx_' || t || '_tenant', 63), t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tenant_guard ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION tenant_guard()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
  -- Records worth an audit trail (the inbox is not)
  FOREACH t IN ARRAY ARRAY['spiritual_courses', 'course_completions', 'certificates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', 'trg_audit_' || t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_spiritual_courses_updated_at ON spiritual_courses;
CREATE TRIGGER trg_spiritual_courses_updated_at BEFORE UPDATE ON spiritual_courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
    'spiritual_courses', 'course_completions', 'certificates', 'notifications'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
