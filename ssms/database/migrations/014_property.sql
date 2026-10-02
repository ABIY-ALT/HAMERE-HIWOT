-- =============================================================================
-- SSMS — Migration 014: Property (assets, custody, maintenance, stocktake)
-- Depends on: 002 (organization_units, persons, system_users, roles,
--             permissions), 008 (finance_transactions), 011 (audit, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • assets: the register. Tag AST-YYYY-NNNN, holding department, custodian,
--   condition, status, value; last_verified_on for the yearly stocktake.
-- • asset_movements: every custody change / transfer (history, never edited).
-- • asset_maintenance: repairs & services; an optional link to the expense
--   that paid for it.
-- Permissions: ASSET_VIEW (see), ASSET_CREATE (register, edit, repairs,
-- stocktake, dispose), ASSET_ASSIGN / ASSET_TRANSFER (custody changes).
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS asset_tag_seq;

CREATE OR REPLACE FUNCTION generate_asset_tag()
RETURNS TEXT AS $$
BEGIN
  RETURN 'AST-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('asset_tag_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS assets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag                   TEXT NOT NULL UNIQUE DEFAULT generate_asset_tag(),
  name_en               TEXT NOT NULL,
  name_am               TEXT,
  category              TEXT NOT NULL,
  serial_no             TEXT,
  condition             TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED')),
  status                TEXT NOT NULL DEFAULT 'IN_USE' CHECK (status IN ('IN_USE', 'IN_STORE', 'UNDER_REPAIR', 'DISPOSED', 'LOST')),
  organization_unit_id  UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  custodian_person_id   UUID REFERENCES persons(id) ON DELETE SET NULL,
  location              TEXT,
  acquired_on           DATE,
  acquisition_type      TEXT NOT NULL DEFAULT 'PURCHASE' CHECK (acquisition_type IN ('PURCHASE', 'DONATION', 'OTHER')),
  value                 NUMERIC(12,2) CHECK (value IS NULL OR value >= 0),
  notes                 TEXT,
  last_verified_on      DATE,
  verified_by           UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_unit      ON assets(organization_unit_id);
CREATE INDEX IF NOT EXISTS idx_assets_custodian ON assets(custodian_person_id);
CREATE INDEX IF NOT EXISTS idx_assets_status    ON assets(status);

CREATE TABLE IF NOT EXISTS asset_movements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_unit_id    UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  to_unit_id      UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  from_person_id  UUID REFERENCES persons(id) ON DELETE SET NULL,
  to_person_id    UUID REFERENCES persons(id) ON DELETE SET NULL,
  moved_on        DATE NOT NULL DEFAULT CURRENT_DATE,
  reason          TEXT,
  recorded_by     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_movements_asset ON asset_movements(asset_id, moved_on);

CREATE TABLE IF NOT EXISTS asset_maintenance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('REPAIR', 'SERVICE', 'INSPECTION')),
  description     TEXT NOT NULL,
  reported_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_on    DATE,
  cost            NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
  handled_by      TEXT,
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
  transaction_id  UUID UNIQUE REFERENCES finance_transactions(id) ON DELETE SET NULL,
  recorded_by     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_maintenance_done CHECK (status <> 'DONE' OR completed_on IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset ON asset_maintenance(asset_id);

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_asset_maintenance_updated_at ON asset_maintenance;
CREATE TRIGGER trg_asset_maintenance_updated_at BEFORE UPDATE ON asset_maintenance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['assets', 'asset_movements', 'asset_maintenance'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Row level security
ALTER TABLE assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_select ON assets;
CREATE POLICY assets_select ON assets FOR SELECT
  USING (auth_user_has_permission('ASSET_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));
DROP POLICY IF EXISTS assets_insert ON assets;
CREATE POLICY assets_insert ON assets FOR INSERT WITH CHECK (auth_user_has_permission('ASSET_CREATE'));
DROP POLICY IF EXISTS assets_update ON assets;
CREATE POLICY assets_update ON assets FOR UPDATE
  USING (auth_user_has_permission('ASSET_CREATE') OR auth_user_has_permission('ASSET_ASSIGN') OR auth_user_has_permission('ASSET_TRANSFER'));

DROP POLICY IF EXISTS asset_movements_select ON asset_movements;
CREATE POLICY asset_movements_select ON asset_movements FOR SELECT
  USING (auth_user_has_permission('ASSET_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));
DROP POLICY IF EXISTS asset_movements_insert ON asset_movements;
CREATE POLICY asset_movements_insert ON asset_movements FOR INSERT
  WITH CHECK (auth_user_has_permission('ASSET_ASSIGN') OR auth_user_has_permission('ASSET_TRANSFER') OR auth_user_has_permission('ASSET_CREATE'));

DROP POLICY IF EXISTS asset_maintenance_select ON asset_maintenance;
CREATE POLICY asset_maintenance_select ON asset_maintenance FOR SELECT
  USING (auth_user_has_permission('ASSET_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));
DROP POLICY IF EXISTS asset_maintenance_insert ON asset_maintenance;
CREATE POLICY asset_maintenance_insert ON asset_maintenance FOR INSERT WITH CHECK (auth_user_has_permission('ASSET_CREATE'));
DROP POLICY IF EXISTS asset_maintenance_update ON asset_maintenance;
CREATE POLICY asset_maintenance_update ON asset_maintenance FOR UPDATE USING (auth_user_has_permission('ASSET_CREATE'));

-- Property officer role (Budget & Property department) with every asset permission;
-- department heads can see the register.
INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'PROPERTY_OFFICER', 'Property Officer', 'የንብረት ኃላፊ',
       'Keeps the asset register: registration, custody, maintenance and stocktake',
       'የንብረት መዝገብ ይይዛል፡ ምዝገባ፣ ኃላፊነት፣ ጥገናና ቆጠራ',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'PROPERTY_OFFICER');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('ASSET_VIEW', 'ASSET_CREATE', 'ASSET_ASSIGN', 'ASSET_TRANSFER', 'REPORT_VIEW')
WHERE r.code = 'PROPERTY_OFFICER'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'ASSET_VIEW'
WHERE r.code IN ('DEPT_HEAD', 'COORDINATOR')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
