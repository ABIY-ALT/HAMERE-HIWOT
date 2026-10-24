-- =============================================================================
-- SSMS — Undo migration 047 (notification settings, fixed assets &
-- depreciation, pledges as money owed)
-- Removes the pledge, fixed-asset, depreciation and disposal entries — also in
-- closed books — and posts the money received for pledges as donation income
-- again, as migration 044 did. Notification settings and the depreciation
-- details of assets are removed.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_gl_sync ON donations;
DROP TRIGGER IF EXISTS trg_gl_sync ON assets;
DROP TRIGGER IF EXISTS trg_asset_disposal_date ON assets;
DROP TRIGGER IF EXISTS trg_gl_seed_extra_rules ON gl_mappings;

-- The automatic entries of 047 go, closed books or not
ALTER TABLE journal_entries DISABLE TRIGGER trg_gl_entry_guard;
ALTER TABLE journal_lines DISABLE TRIGGER trg_gl_line_guard;
DELETE FROM journal_entries WHERE source IN ('PLEDGE', 'ASSET', 'DISPOSAL', 'DEPRECIATION');
ALTER TABLE journal_lines ENABLE TRIGGER trg_gl_line_guard;
ALTER TABLE journal_entries ENABLE TRIGGER trg_gl_entry_guard;

CREATE OR REPLACE FUNCTION gl_mapping_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT account_type, sub_type, is_header, is_active INTO a FROM gl_accounts WHERE tenant_id = NEW.tenant_id AND id = NEW.account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0001';
  END IF;
  IF a.is_header OR NOT a.is_active THEN
    RAISE EXCEPTION 'Choose an active account that is not a group heading' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.source = 'DEFAULT' THEN
    IF (NEW.key = 'CASH' AND a.sub_type <> 'CASH_BANK')
       OR (NEW.key = 'INCOME' AND a.account_type <> 'INCOME')
       OR (NEW.key = 'EXPENSE' AND a.account_type <> 'EXPENSE')
       OR (NEW.key = 'OPENING_BALANCE' AND a.account_type <> 'EQUITY') THEN
      RAISE EXCEPTION 'This account does not fit the % rule', NEW.key USING ERRCODE = 'P0001';
    END IF;
  ELSIF a.sub_type = 'CASH_BANK' THEN
    RAISE EXCEPTION 'A category cannot post to a cash or bank account' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION gl_post_transaction(p_tenant UUID, p_txn UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  t        RECORD;
  v_money  UUID;
  v_other  UUID;
  v_no     TEXT;
BEGIN
  DELETE FROM journal_entries WHERE tenant_id = p_tenant AND transaction_id = p_txn RETURNING entry_no INTO v_no;
  SELECT * INTO t FROM finance_transactions WHERE tenant_id = p_tenant AND id = p_txn;
  IF NOT FOUND OR t.amount IS NULL OR t.amount <= 0 THEN
    RETURN;
  END IF;
  PERFORM gl_ensure_chart(p_tenant);
  v_money := CASE WHEN t.bank_account_id IS NOT NULL THEN gl_bank_account(p_tenant, t.bank_account_id) ELSE gl_default_account(p_tenant, 'CASH') END;
  v_other := gl_category_account(p_tenant, t.txn_type, t.category);
  PERFORM gl_post_pair(
    p_tenant, t.txn_date, COALESCE(NULLIF(t.description, ''), t.category), t.receipt_no, 'TRANSACTION', t.id, NULL, NULL,
    CASE WHEN t.txn_type = 'INCOME' THEN v_money ELSE v_other END,
    CASE WHEN t.txn_type = 'INCOME' THEN v_other ELSE v_money END,
    t.amount, t.organization_unit_id, t.party, t.recorded_by, v_no
  );
END;
$$;

CREATE OR REPLACE FUNCTION gl_repost(p_from DATE DEFAULT NULL, p_tenant UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID := COALESCE(p_tenant, request_tenant_id());
  v_from   DATE;
  v_lock   DATE;
  v_count  INT := 0;
  r        RECORD;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'gl_repost: no tenant';
  END IF;
  IF request_tenant_id() IS NOT NULL AND v_tenant <> request_tenant_id() THEN
    RAISE EXCEPTION 'Cross-tenant change blocked (gl_repost)' USING ERRCODE = '42501';
  END IF;
  PERFORM gl_ensure_chart(v_tenant);
  SELECT lock_date INTO v_lock FROM gl_settings WHERE tenant_id = v_tenant;
  v_from := GREATEST(COALESCE(p_from, '1900-01-01'::DATE), COALESCE(v_lock + 1, '1900-01-01'::DATE));

  -- In date order, so new entry numbers follow the dates
  FOR r IN
    SELECT * FROM (
      SELECT 'OPENING' AS kind, id, opening_date AS d, created_at AS c FROM bank_accounts WHERE tenant_id = v_tenant AND opening_date >= v_from
      UNION ALL
      SELECT 'TRANSFER', id, transfer_date, created_at FROM account_transfers WHERE tenant_id = v_tenant AND transfer_date >= v_from
      UNION ALL
      SELECT 'TRANSACTION', id, txn_date, created_at FROM finance_transactions WHERE tenant_id = v_tenant AND txn_date >= v_from
    ) s
    ORDER BY d, c, id
  LOOP
    IF r.kind = 'OPENING' THEN
      PERFORM gl_post_opening(v_tenant, r.id);
    ELSIF r.kind = 'TRANSFER' THEN
      PERFORM gl_post_transfer(v_tenant, r.id);
    ELSE
      PERFORM gl_post_transaction(v_tenant, r.id);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Money received for pledges is donation income again: the credit line of each
-- such receipt goes back to its category's account (closed books too)
ALTER TABLE journal_lines DISABLE TRIGGER trg_gl_line_guard;
UPDATE journal_lines l
SET account_id = gl_category_account(t.tenant_id, t.txn_type, t.category)
FROM donations d
JOIN finance_transactions t ON t.tenant_id = d.tenant_id AND t.id = d.transaction_id
JOIN journal_entries e ON e.tenant_id = t.tenant_id AND e.transaction_id = t.id
WHERE d.pledged_on IS NOT NULL AND t.txn_type = 'INCOME'
  AND l.tenant_id = e.tenant_id AND l.entry_id = e.id AND l.credit > 0;
ALTER TABLE journal_lines ENABLE TRIGGER trg_gl_line_guard;

DROP FUNCTION IF EXISTS gl_sync_donation();
DROP FUNCTION IF EXISTS gl_sync_asset();
DROP FUNCTION IF EXISTS asset_disposal_date();
DROP FUNCTION IF EXISTS gl_seed_extra_rules();
DROP FUNCTION IF EXISTS gl_post_pledge(UUID, UUID);
DROP FUNCTION IF EXISTS gl_post_asset(UUID, UUID);
DROP FUNCTION IF EXISTS gl_post_disposal(UUID, UUID);
DROP FUNCTION IF EXISTS gl_post_depreciation(DATE, UUID, UUID);
DROP FUNCTION IF EXISTS gl_undo_depreciation(DATE, UUID);
DROP FUNCTION IF EXISTS gl_depreciation_preview(DATE, UUID);
DROP FUNCTION IF EXISTS gl_depreciation_lines(UUID, DATE);
DROP FUNCTION IF EXISTS gl_depreciation_tenant(UUID);
DROP FUNCTION IF EXISTS gl_asset_account(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS gl_post_lines(UUID, DATE, TEXT, TEXT, TEXT, UUID, UUID, DATE, JSONB, UUID, TEXT);
DROP FUNCTION IF EXISTS gl_open_date(UUID, DATE);
DROP FUNCTION IF EXISTS gl_mapped(UUID, TEXT);

DROP INDEX IF EXISTS idx_journal_lines_asset;
ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_lines_asset_fkey;
ALTER TABLE journal_lines DROP COLUMN IF EXISTS asset_id;

DROP INDEX IF EXISTS uq_journal_entries_pledge;
DROP INDEX IF EXISTS uq_journal_entries_asset;
DROP INDEX IF EXISTS uq_journal_entries_disposal;
DROP INDEX IF EXISTS uq_journal_entries_depreciation;
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_donation_fkey;
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_asset_fkey;
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_links;
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries
  DROP COLUMN IF EXISTS donation_id,
  DROP COLUMN IF EXISTS asset_id,
  DROP COLUMN IF EXISTS depreciation_month;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('MANUAL', 'TRANSACTION', 'TRANSFER', 'OPENING', 'REVERSAL'));
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_links CHECK (
      (source = 'TRANSACTION') = (transaction_id IS NOT NULL)
  AND (source = 'TRANSFER') = (transfer_id IS NOT NULL)
  AND (source = 'OPENING') = (bank_account_id IS NOT NULL)
  AND (source = 'REVERSAL') = (reversal_of IS NOT NULL)
);

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_useful_life;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_salvage_value;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_gl_account_fkey;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_booked_against_fkey;
ALTER TABLE assets
  DROP COLUMN IF EXISTS useful_life_months,
  DROP COLUMN IF EXISTS salvage_value,
  DROP COLUMN IF EXISTS depreciation_start,
  DROP COLUMN IF EXISTS gl_account_id,
  DROP COLUMN IF EXISTS booked_against_id,
  DROP COLUMN IF EXISTS disposed_on;

DELETE FROM gl_mappings WHERE source = 'ASSET_CATEGORY'
  OR (source = 'DEFAULT' AND key IN ('PLEDGES_RECEIVABLE', 'FIXED_ASSETS', 'DEPRECIATION', 'ACCUMULATED_DEPRECIATION', 'DISPOSAL_LOSS'));
ALTER TABLE gl_mappings DROP CONSTRAINT IF EXISTS gl_mappings_source_check;
ALTER TABLE gl_mappings ADD CONSTRAINT gl_mappings_source_check CHECK (source IN ('DEFAULT', 'INCOME_CATEGORY', 'EXPENSE_CATEGORY'));
ALTER TABLE gl_mappings DROP CONSTRAINT IF EXISTS gl_mappings_default_key;
ALTER TABLE gl_mappings ADD CONSTRAINT gl_mappings_default_key
  CHECK (source <> 'DEFAULT' OR key IN ('CASH', 'INCOME', 'EXPENSE', 'OPENING_BALANCE'));

ALTER TABLE gl_settings DROP COLUMN IF EXISTS accrue_pledges;
ALTER TABLE system_users DROP COLUMN IF EXISTS notification_prefs;

COMMIT;

NOTIFY pgrst, 'reload schema';
