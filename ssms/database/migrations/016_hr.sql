-- =============================================================================
-- SSMS — Migration 016: Human resources (servants)
-- Depends on: 002 (persons, organization_units, roles, permissions),
--             005 (classes, attendance_status), 011 (audit, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • service_assignments: who serves where — a person, a department or
--   coordination, the role (head, deputy, secretary, teacher, servant) and,
--   for teachers, the class. Ending an assignment keeps it as history.
-- • servant_attendance: one mark per servant per service day.
-- • discipline_cases: warnings, counselling, suspensions and reconciliation.
--   Visible to HR_MANAGE only.
-- Permissions HR_VIEW / HR_MANAGE (seeded in 004) + role HR_OFFICER.
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_assignments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  unit_id      UUID NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
  role_kind    TEXT NOT NULL CHECK (role_kind IN ('HEAD', 'DEPUTY', 'SECRETARY', 'TEACHER', 'SERVANT')),
  title        TEXT,
  class_id     UUID REFERENCES classes(id) ON DELETE SET NULL,
  start_date   DATE NOT NULL,
  end_date     DATE,
  end_reason   TEXT CHECK (end_reason IS NULL OR end_reason IN ('COMPLETED', 'TRANSFERRED', 'RESIGNED', 'SUSPENDED', 'OTHER')),
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
  notes        TEXT,
  created_by   UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_assignments_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT service_assignments_ended CHECK ((status = 'ENDED') = (end_date IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_service_assignments_person ON service_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_service_assignments_unit   ON service_assignments(unit_id);
-- The same role in the same unit (and class) only once at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_assignment_active ON service_assignments
  (person_id, unit_id, role_kind, COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'ACTIVE';
-- One head per unit at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_assignment_head ON service_assignments (unit_id)
  WHERE status = 'ACTIVE' AND role_kind = 'HEAD';

CREATE TABLE IF NOT EXISTS servant_attendance (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_date  DATE NOT NULL,
  person_id     UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  status        attendance_status NOT NULL,
  check_in      TIME,
  note          TEXT,
  recorded_by   UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_date, person_id)
);

CREATE INDEX IF NOT EXISTS idx_servant_attendance_person ON servant_attendance(person_id);

CREATE TABLE IF NOT EXISTS discipline_cases (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id        UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  opened_on        DATE NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('WARNING', 'COUNSELING', 'SUSPENSION', 'RECONCILIATION', 'OTHER')),
  reason           TEXT NOT NULL,
  handled_by       TEXT,
  suspended_until  DATE,
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolution       TEXT,
  closed_on        DATE,
  created_by       UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discipline_cases_closed CHECK ((status = 'OPEN') = (closed_on IS NULL)),
  CONSTRAINT discipline_cases_dates CHECK (closed_on IS NULL OR closed_on >= opened_on),
  CONSTRAINT discipline_cases_suspension CHECK (suspended_until IS NULL OR (kind = 'SUSPENSION' AND suspended_until >= opened_on))
);

CREATE INDEX IF NOT EXISTS idx_discipline_cases_person ON discipline_cases(person_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_assignments', 'servant_attendance', 'discipline_cases'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
  -- Attendance marks are many and routine; assignments and cases are audited
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['service_assignments', 'discipline_cases'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Role
INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'HR_OFFICER', 'HR Officer', 'የሰው ሀብት ኃላፊ',
       'Assigns servants to departments, keeps servant attendance and discipline records',
       'አገልጋዮችን ይመድባል፣ የአገልጋዮችን ተገኝነትና የዲሲፕሊን መዝገብ ይይዛል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'HR_OFFICER');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('HR_VIEW', 'HR_MANAGE', 'MEMBER_VIEW')
WHERE r.code = 'HR_OFFICER'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Row level security
ALTER TABLE service_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE servant_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE discipline_cases    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_assignments', 'servant_attendance'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('HR_VIEW') OR auth_user_has_permission('HR_MANAGE') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
  END LOOP;
  -- Discipline records are confidential
  DROP POLICY IF EXISTS discipline_cases_select ON discipline_cases;
  CREATE POLICY discipline_cases_select ON discipline_cases FOR SELECT USING (auth_user_has_permission('HR_MANAGE'));

  FOREACH t IN ARRAY ARRAY['service_assignments', 'servant_attendance', 'discipline_cases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_write ON %1$I FOR INSERT WITH CHECK (auth_user_has_permission('HR_MANAGE'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_update ON %1$I FOR UPDATE USING (auth_user_has_permission('HR_MANAGE'))$p$, t);
  END LOOP;
END $$;
