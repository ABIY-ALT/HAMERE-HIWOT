-- =============================================================================
-- SSMS — Migration 008: Finance (payment requests + income/expense ledger)
-- Depends on: 001 (workflow_status), 002 (organization_units, system_users,
--             roles, permissions, role_permissions, set_updated_at),
--             003 (auth_user_has_permission), 006 (SUPER_ADMIN)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- WORKFLOW
--   Department head (FINANCE_REQUEST) submits a payment request for their unit
--     → PENDING
--   Finance head (FINANCE_APPROVE) reviews it
--     → APPROVED | REJECTED | RETURNED (back to the requester to fix)
--   Requester may fix a RETURNED request and resubmit (→ PENDING) or cancel it.
--   Treasurer (FINANCE_CREATE) pays an APPROVED request
--     → COMPLETED, and an EXPENSE row is written to finance_transactions.
--   Nobody may approve their own request (enforced in the server action).
-- =============================================================================

-- =============================================================================
-- PAYMENT REQUESTS
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS finance_request_seq;

-- Generates FR-YYYY-NNNN
CREATE OR REPLACE FUNCTION generate_finance_request_no()
RETURNS TEXT AS $$
BEGIN
  RETURN 'FR-' || TO_CHAR(NOW(), 'YYYY') || '-'
         || LPAD(nextval('finance_request_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS finance_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_no            TEXT NOT NULL UNIQUE DEFAULT generate_finance_request_no(),
  organization_unit_id  UUID NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
  requested_by          UUID NOT NULL REFERENCES system_users(id) ON DELETE RESTRICT,
  title                 TEXT NOT NULL,
  category              TEXT NOT NULL,
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  needed_by             DATE,
  justification         TEXT,
  priority              TEXT NOT NULL DEFAULT 'NORMAL'
                          CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status                workflow_status NOT NULL DEFAULT 'PENDING',
  review_note           TEXT,
  reviewed_by           UUID REFERENCES system_users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  paid_by               UUID REFERENCES system_users(id) ON DELETE SET NULL,
  paid_at               DATE,
  payment_reference     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_requests_status ON finance_requests(status);
CREATE INDEX IF NOT EXISTS idx_fin_requests_unit   ON finance_requests(organization_unit_id);
CREATE INDEX IF NOT EXISTS idx_fin_requests_by     ON finance_requests(requested_by);

-- =============================================================================
-- LEDGER (income and expenses)
-- =============================================================================

CREATE TABLE IF NOT EXISTS finance_transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  txn_type              TEXT NOT NULL CHECK (txn_type IN ('INCOME', 'EXPENSE')),
  category              TEXT NOT NULL,
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  txn_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  description           TEXT,
  party                 TEXT,          -- payer (income) or payee (expense)
  receipt_no            TEXT,
  organization_unit_id  UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  request_id            UUID UNIQUE REFERENCES finance_requests(id) ON DELETE SET NULL,
  recorded_by           UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_txn_type_date ON finance_transactions(txn_type, txn_date);

-- =============================================================================
-- updated_at TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS trg_fin_requests_updated_at ON finance_requests;
CREATE TRIGGER trg_fin_requests_updated_at BEFORE UPDATE ON finance_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_fin_txn_updated_at ON finance_transactions;
CREATE TRIGGER trg_fin_txn_updated_at BEFORE UPDATE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- The app writes through permission-checked server actions; these policies
-- keep direct API access to the same rules.
-- =============================================================================

ALTER TABLE finance_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_requests_select ON finance_requests;
CREATE POLICY fin_requests_select ON finance_requests FOR SELECT
  USING (
    auth_user_has_permission('FINANCE_VIEW')
    OR auth_user_has_permission('FINANCE_APPROVE')
    OR auth_user_has_permission('AUDIT_VIEW_ALL')
    OR requested_by IN (SELECT id FROM system_users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS fin_requests_insert ON finance_requests;
CREATE POLICY fin_requests_insert ON finance_requests FOR INSERT
  WITH CHECK (
    auth_user_has_permission('FINANCE_REQUEST') OR auth_user_has_permission('FINANCE_CREATE')
  );

DROP POLICY IF EXISTS fin_requests_update ON finance_requests;
CREATE POLICY fin_requests_update ON finance_requests FOR UPDATE
  USING (
    auth_user_has_permission('FINANCE_APPROVE')
    OR auth_user_has_permission('FINANCE_CREATE')
    OR requested_by IN (SELECT id FROM system_users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS fin_txn_select ON finance_transactions;
CREATE POLICY fin_txn_select ON finance_transactions FOR SELECT
  USING (auth_user_has_permission('FINANCE_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));

DROP POLICY IF EXISTS fin_txn_insert ON finance_transactions;
CREATE POLICY fin_txn_insert ON finance_transactions FOR INSERT
  WITH CHECK (auth_user_has_permission('FINANCE_CREATE'));

-- =============================================================================
-- PERMISSION + ROLES
-- =============================================================================

INSERT INTO permissions (code, name_en, name_am, category, is_active)
SELECT 'FINANCE_REQUEST', 'Submit Payment Requests', 'የክፍያ ጥያቄ ማቅረብ', 'FINANCE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'FINANCE_REQUEST');

-- Finance head / treasurer
INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'FINANCE_OFFICER', 'Finance Officer', 'የፋይናንስ ኃላፊ',
       'Reviews payment requests, records income and pays approved requests',
       'የክፍያ ጥያቄዎችን ይገመግማል፣ ገቢ ይመዘግባል፣ የጸደቁ ጥያቄዎችን ይከፍላል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'FINANCE_OFFICER');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('FINANCE_VIEW', 'FINANCE_CREATE', 'FINANCE_APPROVE', 'FINANCE_REQUEST', 'REPORT_VIEW', 'REPORT_EXPORT')
WHERE r.code = 'FINANCE_OFFICER'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Department heads and coordinators can submit requests for their unit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'FINANCE_REQUEST'
WHERE r.code IN ('DEPT_HEAD', 'COORDINATOR')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Super Admin keeps every permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
