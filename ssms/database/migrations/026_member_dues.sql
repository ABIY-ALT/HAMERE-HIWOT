-- =============================================================================
-- SSMS — Migration 026: Member dues (ወርሃዊ መዋጮ)
-- Depends on: 002 (persons, system_users), 008 (finance_transactions),
--             011 (audit, optional), 025 (persons.is_guardian_only)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • dues_rates: the monthly amount for each Ethiopian year.
-- • member_dues: one row per member per paid month (Meskerem = 1 … Nehase = 12;
--   Pagume has no dues). A payment for several months shares one receipt
--   number and one income entry in Finance (category "Member Contributions").
-- • Who pays: active members who are not students, not parents-only records,
--   and not honorary members.
-- Permissions: FINANCE_VIEW (see), FINANCE_CREATE (record, set the rate,
-- remind), FINANCE_APPROVE (cancel a receipt).
-- =============================================================================

CREATE TABLE IF NOT EXISTS dues_rates (
  year            INT PRIMARY KEY,                                   -- Ethiopian year
  monthly_amount  NUMERIC(10,2) NOT NULL CHECK (monthly_amount >= 0),
  updated_by      UUID REFERENCES system_users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_dues (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  year            INT NOT NULL,
  month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  paid_on         DATE NOT NULL,
  receipt_no      TEXT NOT NULL,
  transaction_id  UUID REFERENCES finance_transactions(id) ON DELETE SET NULL,
  recorded_by     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_member_dues_year    ON member_dues(year);
CREATE INDEX IF NOT EXISTS idx_member_dues_receipt ON member_dues(receipt_no);

-- Receipt numbers: DUE-2019-0001, …
CREATE SEQUENCE IF NOT EXISTS dues_receipt_seq;

CREATE OR REPLACE FUNCTION next_dues_receipt(p_year INT)
RETURNS TEXT AS $$
BEGIN
  RETURN 'DUE-' || p_year || '-' || LPAD(nextval('dues_receipt_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['dues_rates', 'member_dues'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

ALTER TABLE dues_rates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_dues ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dues_rates', 'member_dues'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('FINANCE_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
  END LOOP;
END $$;
