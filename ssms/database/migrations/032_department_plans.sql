-- =============================================================================
-- SSMS — Migration 032: Department plans (የክፍላት ዓመታዊ እቅድ)
-- Depends on: 002 (organization_units, system_users), 019 (TASK_ASSIGN / TASK_REPORT)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- Each department / coordination writes a plan for the (Ethiopian) year:
-- activities with how success is measured, a target, the quarter(s) they fall
-- in, a budget and who is responsible. Quarters follow the Sunday school year:
-- Q1 Meskerem–Hidar, Q2 Tahsas–Yekatit, Q3 Megabit–Genbot, Q4 Sene–Nehase.
--   DRAFT → SUBMITTED → APPROVED, or RETURNED with a note (then fixed and sent again)
-- Once approved, the department reports progress on each activity (plan_updates):
-- % done, what was achieved, on track / delayed / done, a note.
-- Who: the same as Tasks —
--   TASK_REPORT (department heads, coordinators): their own units' plans
--   TASK_ASSIGN (Executive Committee, secretariat): every plan; approve / return
--   AUDIT_VIEW_ALL: read everything
-- =============================================================================

CREATE TABLE IF NOT EXISTS unit_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id       UUID NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  year          INT NOT NULL,                       -- Ethiopian year, e.g. 2019
  goal          TEXT,                               -- the department's main aim this year
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED')),
  review_note   TEXT,
  submitted_at  TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES system_users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_unit_plan_year UNIQUE (unit_id, year)
);

CREATE TABLE IF NOT EXISTS plan_activities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id      UUID NOT NULL REFERENCES unit_plans(id) ON DELETE CASCADE,
  position     INT NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  measure      TEXT,                                -- how success is measured, e.g. "students trained"
  target       NUMERIC(12,2),                       -- e.g. 120
  quarters     SMALLINT[] NOT NULL DEFAULT '{}',    -- 1–4
  budget       NUMERIC(12,2),
  responsible  TEXT,
  achieved     NUMERIC(12,2),                       -- latest reported
  progress     SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  state        TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (state IN ('NOT_STARTED', 'ON_TRACK', 'DELAYED', 'DONE', 'DROPPED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_updates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id  UUID NOT NULL REFERENCES plan_activities(id) ON DELETE CASCADE,
  quarter      SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  progress     SMALLINT NOT NULL CHECK (progress BETWEEN 0 AND 100),
  achieved     NUMERIC(12,2),
  state        TEXT NOT NULL CHECK (state IN ('NOT_STARTED', 'ON_TRACK', 'DELAYED', 'DONE', 'DROPPED')),
  note         TEXT,
  author_id    UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_plans_year ON unit_plans(year);
CREATE INDEX IF NOT EXISTS idx_plan_activities_plan ON plan_activities(plan_id, position);
CREATE INDEX IF NOT EXISTS idx_plan_updates_activity ON plan_updates(activity_id, created_at);

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['unit_plans', 'plan_activities', 'plan_updates'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Row level security: the server (service role) checks unit membership for TASK_REPORT
ALTER TABLE unit_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_updates    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['unit_plans', 'plan_activities', 'plan_updates'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
  END LOOP;
END $$;
