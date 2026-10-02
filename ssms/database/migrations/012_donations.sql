-- =============================================================================
-- SSMS — Migration 012: Donations & pledges
-- Depends on: 002 (persons, system_users), 008 (finance_transactions),
--             011 (audit trigger, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • Each donation gets a receipt number DON-YYYY-NNNN.
-- • PLEDGED  = promised, not yet received (not income yet).
-- • RECEIVED = money in hand. A cash / bank donation is linked to an INCOME
--   row in finance_transactions (category 'Donations'), so it appears in the
--   ledger, the dashboard and the reports. In-kind gifts keep an estimated
--   value but are not cash income.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS donation_receipt_seq;

CREATE OR REPLACE FUNCTION generate_donation_receipt_no()
RETURNS TEXT AS $$
BEGIN
  RETURN 'DON-' || TO_CHAR(NOW(), 'YYYY') || '-'
         || LPAD(nextval('donation_receipt_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS donations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_no        TEXT NOT NULL UNIQUE DEFAULT generate_donation_receipt_no(),
  donor_name        TEXT NOT NULL,
  donor_person_id   UUID REFERENCES persons(id) ON DELETE SET NULL,
  donor_phone       TEXT,
  donation_type     TEXT NOT NULL CHECK (donation_type IN ('CASH', 'BANK', 'IN_KIND')),
  purpose           TEXT NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  item_description  TEXT,
  status            TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('PLEDGED', 'RECEIVED', 'CANCELLED')),
  pledged_on        DATE,
  received_on       DATE,
  transaction_id    UUID UNIQUE REFERENCES finance_transactions(id) ON DELETE SET NULL,
  notes             TEXT,
  recorded_by       UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_donation_received_date CHECK (status <> 'RECEIVED' OR received_on IS NOT NULL),
  CONSTRAINT chk_in_kind_description CHECK (donation_type <> 'IN_KIND' OR item_description IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_received ON donations(received_on);

DROP TRIGGER IF EXISTS trg_donations_updated_at ON donations;
CREATE TRIGGER trg_donations_updated_at BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Audit trail (migration 011) — attach if it has been installed
DO $$
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_donations ON donations;
    CREATE TRIGGER trg_audit_donations AFTER INSERT OR UPDATE OR DELETE ON donations
      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
  END IF;
END $$;

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS donations_select ON donations;
CREATE POLICY donations_select ON donations FOR SELECT
  USING (auth_user_has_permission('FINANCE_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));

DROP POLICY IF EXISTS donations_insert ON donations;
CREATE POLICY donations_insert ON donations FOR INSERT
  WITH CHECK (auth_user_has_permission('FINANCE_CREATE'));

DROP POLICY IF EXISTS donations_update ON donations;
CREATE POLICY donations_update ON donations FOR UPDATE
  USING (auth_user_has_permission('FINANCE_CREATE'))
  WITH CHECK (auth_user_has_permission('FINANCE_CREATE'));
