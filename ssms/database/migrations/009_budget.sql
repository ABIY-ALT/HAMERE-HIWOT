-- =============================================================================
-- SSMS — Migration 009: Department budgets
-- Depends on: 005 (academic_years), 008 (finance)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- One allocation per department (organization unit) per academic year.
-- Spending is not stored here — the app derives it from finance_transactions
-- (spent) and finance_requests (approved-but-unpaid = committed; pending).
-- =============================================================================

CREATE TABLE IF NOT EXISTS budget_allocations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year_id      UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  organization_unit_id  UUID NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
  allocated             NUMERIC(14,2) NOT NULL CHECK (allocated >= 0),
  notes                 TEXT,
  updated_by            UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year_id, organization_unit_id)
);

DROP TRIGGER IF EXISTS trg_budget_alloc_updated_at ON budget_allocations;
CREATE TRIGGER trg_budget_alloc_updated_at BEFORE UPDATE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;

-- Finance staff and auditors see every budget; others see their own units' budgets.
DROP POLICY IF EXISTS budget_alloc_select ON budget_allocations;
CREATE POLICY budget_alloc_select ON budget_allocations FOR SELECT
  USING (
    auth_user_has_permission('FINANCE_VIEW')
    OR auth_user_has_permission('FINANCE_APPROVE')
    OR auth_user_has_permission('AUDIT_VIEW_ALL')
    OR organization_unit_id IN (
      SELECT uua.organization_unit_id
      FROM user_unit_assignments uua
      JOIN system_users su ON su.id = uua.system_user_id
      WHERE su.auth_user_id = auth.uid() AND uua.is_active
    )
  );

DROP POLICY IF EXISTS budget_alloc_insert ON budget_allocations;
CREATE POLICY budget_alloc_insert ON budget_allocations FOR INSERT
  WITH CHECK (auth_user_has_permission('FINANCE_APPROVE'));

DROP POLICY IF EXISTS budget_alloc_update ON budget_allocations;
CREATE POLICY budget_alloc_update ON budget_allocations FOR UPDATE
  USING (auth_user_has_permission('FINANCE_APPROVE'))
  WITH CHECK (auth_user_has_permission('FINANCE_APPROVE'));
