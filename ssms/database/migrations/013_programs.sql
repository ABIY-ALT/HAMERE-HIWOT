-- =============================================================================
-- SSMS — Migration 013: Programs, assemblies & events
-- Depends on: 002 (organization_units, persons, system_users), 003, 011 (optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- One table for everything that is scheduled: assemblies, conferences, holy
-- day celebrations, trainings, outreach, academic events.
-- Status: PLANNED → CONFIRMED → COMPLETED (with actual attendance + outcome)
--         or CANCELLED.
-- =============================================================================

CREATE TABLE IF NOT EXISTS programs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_en               TEXT NOT NULL,
  title_am               TEXT,
  program_type           TEXT NOT NULL CHECK (program_type IN
                           ('ASSEMBLY', 'CONFERENCE', 'HOLIDAY', 'SERVICE', 'TRAINING', 'ACADEMIC', 'OUTREACH', 'OTHER')),
  organization_unit_id   UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  start_date             DATE NOT NULL,
  start_time             TIME,
  end_date               DATE,
  location               TEXT,
  coordinator_person_id  UUID REFERENCES persons(id) ON DELETE SET NULL,
  expected_participants  INTEGER CHECK (expected_participants IS NULL OR expected_participants >= 0),
  actual_participants    INTEGER CHECK (actual_participants IS NULL OR actual_participants >= 0),
  description            TEXT,
  outcome_notes          TEXT,
  status                 TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  created_by             UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_program_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_programs_date   ON programs(start_date);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);

DROP TRIGGER IF EXISTS trg_programs_updated_at ON programs;
CREATE TRIGGER trg_programs_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_programs ON programs;
    CREATE TRIGGER trg_audit_programs AFTER INSERT OR UPDATE OR DELETE ON programs
      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
  END IF;
END $$;

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS programs_select ON programs;
CREATE POLICY programs_select ON programs FOR SELECT
  USING (auth_user_has_permission('PROGRAM_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));

DROP POLICY IF EXISTS programs_insert ON programs;
CREATE POLICY programs_insert ON programs FOR INSERT
  WITH CHECK (auth_user_has_permission('PROGRAM_CREATE') OR auth_user_has_permission('PROGRAM_MANAGE'));

DROP POLICY IF EXISTS programs_update ON programs;
CREATE POLICY programs_update ON programs FOR UPDATE
  USING (
    auth_user_has_permission('PROGRAM_MANAGE')
    OR created_by IN (SELECT id FROM system_users WHERE auth_user_id = auth.uid())
  );

-- Department heads, coordinators and the secretariat schedule their own programs
-- (they can edit / report on the programs they created; PROGRAM_MANAGE edits any).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('PROGRAM_VIEW', 'PROGRAM_CREATE')
WHERE r.code IN ('DEPT_HEAD', 'COORDINATOR', 'SECRETARIAT')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
