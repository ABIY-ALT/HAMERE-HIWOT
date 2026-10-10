-- =============================================================================
-- SSMS — Migration 019: Tasks — work given to departments and their reports
-- Depends on: 002 (organization_units, system_users, roles, permissions,
--             set_updated_at), 003 (auth_user_has_permission), 006 (SUPER_ADMIN),
--             011 (audit, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- WORKFLOW
--   Executive Committee / secretariat (TASK_ASSIGN) gives a task to one or
--   more departments or coordinations — as routine work or as a decision of
--   a meeting (one task per unit, so each is followed up on its own)  → ASSIGNED
--   The unit's head (TASK_REPORT, assigned to that unit) reports progress
--                                                                     → IN_PROGRESS
--   … and submits the final report                                    → SUBMITTED
--   The assigner accepts the report                                   → COMPLETED
--   or returns it with a note; the unit reports again                 → RETURNED
--   The assigner may cancel an open task                              → CANCELLED
--   Every step (and every reminder) is a row in task_updates.
-- Who sees what: TASK_ASSIGN and AUDIT_VIEW_ALL see every task; TASK_REPORT
-- holders see the tasks of the units they are assigned to (server action).
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS task_no_seq;

-- Generates TSK-YYYY-NNNN
CREATE OR REPLACE FUNCTION generate_task_no()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TSK-' || TO_CHAR(NOW(), 'YYYY') || '-'
         || LPAD(nextval('task_no_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tasks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_no        TEXT NOT NULL UNIQUE DEFAULT generate_task_no(),
  title          TEXT NOT NULL,
  details        TEXT,
  from_unit_id   UUID REFERENCES organization_units(id) ON DELETE SET NULL,  -- body giving the task
  unit_id        UUID NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,  -- responsible unit
  source         TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (source IN ('ROUTINE', 'MEETING')),
  meeting_title  TEXT,
  meeting_date   DATE,
  decision_ref   TEXT,                                                    -- e.g. minute / decision no.
  priority       TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  due_date       DATE,
  status         TEXT NOT NULL DEFAULT 'ASSIGNED'
                   CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'COMPLETED', 'CANCELLED')),
  progress       SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by     UUID NOT NULL REFERENCES system_users(id) ON DELETE RESTRICT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tasks_meeting CHECK (source = 'ROUTINE' OR meeting_date IS NOT NULL),
  CONSTRAINT tasks_completed CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_tasks_unit    ON tasks(unit_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due     ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_date) WHERE source = 'MEETING';

CREATE TABLE IF NOT EXISTS task_updates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES system_users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('PROGRESS', 'SUBMITTED', 'RETURNED', 'COMPLETED', 'CANCELLED', 'REMINDED')),
  note        TEXT,
  progress    SMALLINT CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id, created_at);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- task_updates is itself the history; tasks are audited like other records
DO $$
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_tasks ON tasks;
    CREATE TRIGGER trg_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
  END IF;
END $$;

-- =============================================================================
-- PERMISSIONS + ROLES
-- =============================================================================

INSERT INTO permissions (code, name_en, name_am, category, is_active)
SELECT v.code, v.name_en, v.name_am, 'GOVERNANCE', TRUE
FROM (VALUES
  ('TASK_ASSIGN', 'Give Tasks to Departments',   'ለክፍሎች ተግባር መስጠት'),
  ('TASK_REPORT', 'Report on Department Tasks',  'በክፍሉ ተግባራት ላይ ሪፖርት ማቅረብ')
) AS v(code, name_en, name_am)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = v.code);

INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'EXECUTIVE_OFFICER', 'Executive Committee Officer', 'የሥራ አስፈጻሚ ኃላፊ',
       'Gives tasks to departments and coordinations and follows up their reports',
       'ለክፍሎችና ለአስተባባሪዎች ተግባር ይሰጣል፤ ሪፖርታቸውን ይከታተላል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'EXECUTIVE_OFFICER');

-- Executive officers and the secretariat give tasks; heads and coordinators report
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON
     (r.code = 'EXECUTIVE_OFFICER' AND p.code IN ('TASK_ASSIGN', 'GOVERNANCE_VIEW', 'REPORT_VIEW'))
  OR (r.code = 'SECRETARIAT'       AND p.code = 'TASK_ASSIGN')
  OR (r.code IN ('DEPT_HEAD', 'COORDINATOR') AND p.code = 'TASK_REPORT')
WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- =============================================================================
-- ROW LEVEL SECURITY (the server checks unit membership for TASK_REPORT)
-- =============================================================================

ALTER TABLE tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_updates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks', 'task_updates'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
  END LOOP;

  DROP POLICY IF EXISTS tasks_insert ON tasks;
  CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (auth_user_has_permission('TASK_ASSIGN'));
  DROP POLICY IF EXISTS tasks_update ON tasks;
  CREATE POLICY tasks_update ON tasks FOR UPDATE
    USING (auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT'));

  DROP POLICY IF EXISTS task_updates_insert ON task_updates;
  CREATE POLICY task_updates_insert ON task_updates FOR INSERT
    WITH CHECK (auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT'));
END $$;
