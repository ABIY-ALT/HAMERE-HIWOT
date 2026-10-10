-- =============================================================================
-- SSMS — Migration 020: Repeating tasks and task files
-- Depends on: 019 (tasks, task_updates), 011 (audit, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • task_series: a task that repeats (every week, every Ethiopian month or
--   every 3 months) for one unit. The app gives the next task automatically a
--   few days before each due date (see lib/tasks/recurring.ts); tasks.series_id
--   links each one back, and (series_id, due_date) is unique so the same
--   period is never given twice.
-- • task_files: photos, minutes and documents attached to a task or to one of
--   its reports. The files live in the private storage bucket "task-files";
--   only the server reads it and hands out short-lived links.
-- =============================================================================

CREATE TABLE IF NOT EXISTS task_series (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  details        TEXT,
  from_unit_id   UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  unit_id        UUID NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
  source         TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (source IN ('ROUTINE', 'MEETING')),
  meeting_title  TEXT,
  meeting_date   DATE,
  decision_ref   TEXT,
  priority       TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  frequency      TEXT NOT NULL CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'QUARTERLY')),
  next_due       DATE NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID NOT NULL REFERENCES system_users(id) ON DELETE RESTRICT,
  stopped_by     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  stopped_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_series_due ON task_series(next_due) WHERE is_active;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES task_series(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tasks_series_due') THEN
    ALTER TABLE tasks ADD CONSTRAINT uq_tasks_series_due UNIQUE (series_id, due_date);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_files (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  update_id    UUID REFERENCES task_updates(id) ON DELETE SET NULL,  -- the report it came with, if any
  path         TEXT NOT NULL UNIQUE,                                 -- object path in the bucket
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);

-- Private bucket: no storage policies, so only the server (service role) can read or write it
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_task_series_updated_at ON task_series;
CREATE TRIGGER trg_task_series_updated_at BEFORE UPDATE ON task_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['task_series', 'task_files'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Row level security (same rules as tasks; the server checks unit membership)
ALTER TABLE task_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_files  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['task_series', 'task_files'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
  END LOOP;

  DROP POLICY IF EXISTS task_series_insert ON task_series;
  CREATE POLICY task_series_insert ON task_series FOR INSERT WITH CHECK (auth_user_has_permission('TASK_ASSIGN'));
  DROP POLICY IF EXISTS task_series_update ON task_series;
  CREATE POLICY task_series_update ON task_series FOR UPDATE USING (auth_user_has_permission('TASK_ASSIGN'));

  DROP POLICY IF EXISTS task_files_insert ON task_files;
  CREATE POLICY task_files_insert ON task_files FOR INSERT
    WITH CHECK (auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT'));
  DROP POLICY IF EXISTS task_files_delete ON task_files;
  CREATE POLICY task_files_delete ON task_files FOR DELETE
    USING (auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT'));
END $$;
