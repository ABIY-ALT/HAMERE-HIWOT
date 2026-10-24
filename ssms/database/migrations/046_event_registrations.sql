-- =============================================================================
-- SSMS — Migration 046: Event sign-up
-- Depends on: 040 (multi-tenancy), 038 (programs.is_public), 045 — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 046_event_registrations_down.sql
-- =============================================================================
-- What it adds
-- • programs: registration_open, registration_capacity (seats; empty = no
--   limit) and registration_closes_on (last day to sign up; empty = until the
--   program starts).
-- • event_registrations: who signed up for a program — from the public
--   website (WEB), the Telegram bot (BOT) or added by the office (OFFICE) —
--   with how many seats, a short ticket code (shown as a QR code), and when
--   they were checked in at the door. A cancelled registration is kept.
-- The guard below locks the program row, so two people signing up at the
-- same moment can never take more seats than there are. The office may add
-- people after registration closes or beyond the limit (walk-ins).
-- Who may do what is checked by the server; the public API keys have no
-- access, as for every tenant table.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regprocedure('public.tenant_guard()') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 040 (multi-tenancy) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'is_public') THEN
    RAISE EXCEPTION 'Apply migration 038 (automation and public site) first';
  END IF;
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 045 (spiritual life, certificates, inbox) first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Sign-up settings on the program
-- -----------------------------------------------------------------------------
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS registration_open      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS registration_capacity  INTEGER,
  ADD COLUMN IF NOT EXISTS registration_closes_on DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_registration_capacity') THEN
    ALTER TABLE programs ADD CONSTRAINT programs_registration_capacity
      CHECK (registration_capacity IS NULL OR registration_capacity BETWEEN 1 AND 100000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_programs_registration ON programs (tenant_id, start_date) WHERE registration_open;

-- -----------------------------------------------------------------------------
-- Registrations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_registrations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  program_id     UUID NOT NULL,
  -- Short code on the ticket (and in its QR code), made by the server
  ticket_code    TEXT NOT NULL CHECK (ticket_code ~ '^[A-Z0-9]{6,10}$'),
  full_name      TEXT NOT NULL CHECK (length(trim(full_name)) > 1),
  phone          TEXT,                         -- 09XXXXXXXX / 07XXXXXXXX
  person_id      UUID,                         -- a member with this phone, when there is exactly one
  chat_id        BIGINT,                       -- signed up from the bot: the ticket and reminder go there
  seats          INTEGER NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 20),
  note           TEXT,
  source         TEXT NOT NULL CHECK (source IN ('WEB', 'BOT', 'OFFICE')),
  status         TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'CANCELLED')),
  checked_in_at  TIMESTAMPTZ,
  checked_in_by  UUID,
  cancelled_at   TIMESTAMPTZ,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_registrations_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT event_registrations_tid_ticket_key UNIQUE (tenant_id, ticket_code),
  CONSTRAINT event_registrations_program_fkey FOREIGN KEY (tenant_id, program_id)
    REFERENCES programs (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT event_registrations_person_fkey FOREIGN KEY (tenant_id, person_id)
    REFERENCES persons (tenant_id, id) ON DELETE SET NULL (person_id),
  CONSTRAINT event_registrations_checked_in_by_fkey FOREIGN KEY (tenant_id, checked_in_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (checked_in_by),
  CONSTRAINT event_registrations_created_by_fkey FOREIGN KEY (tenant_id, created_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (created_by),
  CONSTRAINT event_registrations_contact CHECK (source = 'OFFICE' OR phone IS NOT NULL OR chat_id IS NOT NULL),
  CONSTRAINT event_registrations_checkin CHECK (checked_in_at IS NULL OR status = 'REGISTERED')
);

-- One live registration per phone, and per member, for each program
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrations_phone
  ON event_registrations (tenant_id, program_id, phone) WHERE status = 'REGISTERED' AND phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrations_person
  ON event_registrations (tenant_id, program_id, person_id) WHERE status = 'REGISTERED' AND person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_registrations_program ON event_registrations (tenant_id, program_id, status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_chat ON event_registrations (tenant_id, chat_id) WHERE chat_id IS NOT NULL;

-- Sign-up rules, checked with the program row locked:
--   WEB / BOT  only while registration is open, before the closing day and
--              before the program has ended, and only within the seats left
--              (EVENT_CLOSED / EVENT_FULL:<seats left>)
--   OFFICE     always (walk-ins, late additions)
-- Lowering the seats of a registration, cancelling it or checking it in
-- never needs a check.
CREATE OR REPLACE FUNCTION event_registration_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  p      programs%ROWTYPE;
  v_used INTEGER;
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::DATE;
BEGIN
  IF NEW.status <> 'REGISTERED' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'REGISTERED' AND NEW.program_id = OLD.program_id AND NEW.seats <= OLD.seats THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM programs WHERE tenant_id = NEW.tenant_id AND id = NEW.program_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_CLOSED';
  END IF;
  IF NEW.source = 'OFFICE' THEN
    RETURN NEW;
  END IF;

  IF NOT p.registration_open
     OR p.status NOT IN ('PLANNED', 'CONFIRMED')
     OR (p.registration_closes_on IS NOT NULL AND v_today > p.registration_closes_on)
     OR COALESCE(p.end_date, p.start_date) < v_today THEN
    RAISE EXCEPTION 'EVENT_CLOSED';
  END IF;

  IF p.registration_capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(seats), 0) INTO v_used
    FROM event_registrations
    WHERE tenant_id = NEW.tenant_id AND program_id = NEW.program_id AND status = 'REGISTERED' AND id <> NEW.id;
    IF v_used + NEW.seats > p.registration_capacity THEN
      RAISE EXCEPTION 'EVENT_FULL:%', GREATEST(p.registration_capacity - v_used, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_registration_guard ON event_registrations;
CREATE TRIGGER trg_event_registration_guard BEFORE INSERT OR UPDATE OF status, seats, program_id ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION event_registration_guard();

-- -----------------------------------------------------------------------------
-- Tenant plumbing, as migration 040 does for every tenant table
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_event_registrations_tenant ON event_registrations (tenant_id);
DROP TRIGGER IF EXISTS trg_tenant_guard ON event_registrations;
CREATE TRIGGER trg_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION tenant_guard();
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE event_registrations FROM anon, authenticated;
GRANT ALL ON TABLE event_registrations TO service_role;

DROP TRIGGER IF EXISTS trg_audit_event_registrations ON event_registrations;
CREATE TRIGGER trg_audit_event_registrations AFTER INSERT OR UPDATE OR DELETE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

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
    'event_registrations'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
