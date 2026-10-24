-- =============================================================================
-- SSMS — Migration 047: Notification settings, fixed assets & depreciation,
--                       pledges as money owed
-- Depends on: 044 (general ledger), 046 — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 047_notifications_assets_pledges_down.sql
-- =============================================================================
-- What it adds
-- • system_users.notification_prefs: which kinds of notice each person gets on
--   their phone (push) and on Telegram. The bell inbox always keeps a copy.
-- • Pledges (gl_settings.accrue_pledges, on by default): a pledge is posted
--   when it is made — Pledges receivable / Donations income — and the money,
--   when it comes, clears the receivable instead of being income a second
--   time. The balance sheet then shows what donors still owe.
-- • Fixed assets (assets): useful life, salvage value, depreciation start,
--   the fixed-asset account, and what the cost is booked against (opening
--   balance, donation income, or the expense it was first recorded as).
--     ASSET         puts the cost in the books (Fixed assets / …)
--     DEPRECIATION  one entry per month: Depreciation expense / Accumulated
--                   depreciation, a line pair per asset, straight-line,
--                   catching up any month that was not posted
--     DISPOSAL      when an asset is disposed of or lost: its accumulated
--                   depreciation and cost leave the books, the rest is a loss
-- • New posting rules: pledges receivable, fixed assets, depreciation,
--   accumulated depreciation, loss on disposal; and a fixed-asset account per
--   asset category.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gl_accounts') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 044 (general ledger) first';
  END IF;
  IF to_regclass('public.event_registrations') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 046 (event sign-up) first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Notification settings
-- -----------------------------------------------------------------------------
-- { "<kind>": { "push": false, "telegram": false } } — a missing value is "on"
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::JSONB;

-- -----------------------------------------------------------------------------
-- Settings and posting rules
-- -----------------------------------------------------------------------------
ALTER TABLE gl_settings ADD COLUMN IF NOT EXISTS accrue_pledges BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE gl_mappings DROP CONSTRAINT IF EXISTS gl_mappings_source_check;
ALTER TABLE gl_mappings ADD CONSTRAINT gl_mappings_source_check
  CHECK (source IN ('DEFAULT', 'INCOME_CATEGORY', 'EXPENSE_CATEGORY', 'ASSET_CATEGORY'));
ALTER TABLE gl_mappings DROP CONSTRAINT IF EXISTS gl_mappings_default_key;
ALTER TABLE gl_mappings ADD CONSTRAINT gl_mappings_default_key CHECK (
  source <> 'DEFAULT' OR key IN (
    'CASH', 'INCOME', 'EXPENSE', 'OPENING_BALANCE',
    'PLEDGES_RECEIVABLE', 'FIXED_ASSETS', 'DEPRECIATION', 'ACCUMULATED_DEPRECIATION', 'DISPOSAL_LOSS'
  )
);

-- Posting rules point to usable accounts of a fitting kind
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
       OR (NEW.key IN ('EXPENSE', 'DEPRECIATION', 'DISPOSAL_LOSS') AND a.account_type <> 'EXPENSE')
       OR (NEW.key = 'OPENING_BALANCE' AND a.account_type <> 'EQUITY')
       OR (NEW.key = 'PLEDGES_RECEIVABLE' AND (a.account_type <> 'ASSET' OR a.sub_type = 'CASH_BANK'))
       OR (NEW.key IN ('FIXED_ASSETS', 'ACCUMULATED_DEPRECIATION') AND (a.account_type <> 'ASSET' OR a.sub_type <> 'FIXED_ASSET')) THEN
      RAISE EXCEPTION 'This account does not fit the % rule', NEW.key USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.source = 'ASSET_CATEGORY' THEN
    IF a.account_type <> 'ASSET' OR a.sub_type <> 'FIXED_ASSET' THEN
      RAISE EXCEPTION 'An asset category must point to a fixed-asset account' USING ERRCODE = 'P0001';
    END IF;
  ELSIF a.sub_type = 'CASH_BANK' THEN
    RAISE EXCEPTION 'A category cannot post to a cash or bank account' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- The account of a DEFAULT rule, or NULL when there is none (unlike gl_default_account, which insists)
CREATE OR REPLACE FUNCTION gl_mapped(p_tenant UUID, p_key TEXT)
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT account_id FROM gl_mappings WHERE tenant_id = p_tenant AND source = 'DEFAULT' AND key = p_key;
$$;

-- -----------------------------------------------------------------------------
-- Fixed assets
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'assets'::regclass AND conname = 'assets_tid_id_key') THEN
    ALTER TABLE assets ADD CONSTRAINT assets_tid_id_key UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'donations'::regclass AND conname = 'donations_tid_id_key') THEN
    ALTER TABLE donations ADD CONSTRAINT donations_tid_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS useful_life_months  INTEGER,
  ADD COLUMN IF NOT EXISTS salvage_value       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_start  DATE,
  -- The fixed-asset account (empty: the asset category's rule, else the default)
  ADD COLUMN IF NOT EXISTS gl_account_id       UUID,
  -- The other side of the entry that puts the cost in the books (empty: no entry)
  ADD COLUMN IF NOT EXISTS booked_against_id   UUID,
  -- Set when the status becomes DISPOSED or LOST
  ADD COLUMN IF NOT EXISTS disposed_on         DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_useful_life') THEN
    ALTER TABLE assets ADD CONSTRAINT assets_useful_life CHECK (useful_life_months IS NULL OR useful_life_months BETWEEN 1 AND 1200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_salvage_value') THEN
    ALTER TABLE assets ADD CONSTRAINT assets_salvage_value CHECK (salvage_value >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_gl_account_fkey') THEN
    ALTER TABLE assets ADD CONSTRAINT assets_gl_account_fkey FOREIGN KEY (tenant_id, gl_account_id)
      REFERENCES gl_accounts (tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_booked_against_fkey') THEN
    ALTER TABLE assets ADD CONSTRAINT assets_booked_against_fkey FOREIGN KEY (tenant_id, booked_against_id)
      REFERENCES gl_accounts (tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Assets already disposed of or lost: their last change is the best date there is
UPDATE assets SET disposed_on = updated_at::DATE WHERE status IN ('DISPOSED', 'LOST') AND disposed_on IS NULL;

CREATE OR REPLACE FUNCTION asset_disposal_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('DISPOSED', 'LOST') THEN
    IF TG_OP = 'INSERT' OR OLD.status NOT IN ('DISPOSED', 'LOST') THEN
      NEW.disposed_on := COALESCE(NEW.disposed_on, (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::DATE);
    END IF;
  ELSE
    NEW.disposed_on := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_disposal_date ON assets;
CREATE TRIGGER trg_asset_disposal_date BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION asset_disposal_date();

-- -----------------------------------------------------------------------------
-- Journal: the new automatic entries
-- -----------------------------------------------------------------------------
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS donation_id         UUID,
  ADD COLUMN IF NOT EXISTS asset_id            UUID,
  ADD COLUMN IF NOT EXISTS depreciation_month  DATE;

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check CHECK (
  source IN ('MANUAL', 'TRANSACTION', 'TRANSFER', 'OPENING', 'REVERSAL', 'PLEDGE', 'ASSET', 'DISPOSAL', 'DEPRECIATION')
);
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_links;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_links CHECK (
      (source = 'TRANSACTION') = (transaction_id IS NOT NULL)
  AND (source = 'TRANSFER') = (transfer_id IS NOT NULL)
  AND (source = 'OPENING') = (bank_account_id IS NOT NULL)
  AND (source = 'REVERSAL') = (reversal_of IS NOT NULL)
  AND (source = 'PLEDGE') = (donation_id IS NOT NULL)
  AND (source IN ('ASSET', 'DISPOSAL')) = (asset_id IS NOT NULL)
  AND (source = 'DEPRECIATION') = (depreciation_month IS NOT NULL)
  AND (depreciation_month IS NULL OR EXTRACT(DAY FROM depreciation_month) = 1)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_donation_fkey') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_donation_fkey FOREIGN KEY (tenant_id, donation_id)
      REFERENCES donations (tenant_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_asset_fkey') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_asset_fkey FOREIGN KEY (tenant_id, asset_id)
      REFERENCES assets (tenant_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_pledge ON journal_entries (tenant_id, donation_id) WHERE source = 'PLEDGE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_asset ON journal_entries (tenant_id, asset_id) WHERE source = 'ASSET';
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_disposal ON journal_entries (tenant_id, asset_id) WHERE source = 'DISPOSAL';
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_depreciation ON journal_entries (tenant_id, depreciation_month) WHERE source = 'DEPRECIATION';

-- Which asset a line is about (depreciation, capitalization, disposal). An
-- asset with depreciation in the books cannot be deleted — dispose of it.
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS asset_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_asset_fkey') THEN
    ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_asset_fkey FOREIGN KEY (tenant_id, asset_id)
      REFERENCES assets (tenant_id, id) ON DELETE NO ACTION;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_journal_lines_asset ON journal_lines (tenant_id, asset_id) WHERE asset_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Writing an automatic entry with any number of lines
-- -----------------------------------------------------------------------------
-- p_lines: [{ "account": uuid, "debit": n, "credit": n, "text": "…", "unit": uuid, "asset": uuid }]
CREATE OR REPLACE FUNCTION gl_post_lines(
  p_tenant UUID, p_date DATE, p_memo TEXT, p_reference TEXT, p_source TEXT,
  p_donation UUID, p_asset UUID, p_month DATE, p_lines JSONB, p_by UUID, p_entry_no TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry UUID;
BEGIN
  INSERT INTO journal_entries (tenant_id, entry_no, entry_date, memo, reference, source, status, donation_id, asset_id, depreciation_month, created_by)
  VALUES (p_tenant, p_entry_no, p_date, left(COALESCE(NULLIF(trim(p_memo), ''), p_source), 500), NULLIF(trim(COALESCE(p_reference, '')), ''),
          p_source, 'DRAFT', p_donation, p_asset, p_month, p_by)
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (tenant_id, entry_id, line_no, account_id, debit, credit, description, organization_unit_id, asset_id)
  SELECT p_tenant, v_entry, l.ord::INT, (l.v ->> 'account')::UUID,
         COALESCE((l.v ->> 'debit')::NUMERIC, 0), COALESCE((l.v ->> 'credit')::NUMERIC, 0),
         NULLIF(l.v ->> 'text', ''), (l.v ->> 'unit')::UUID, (l.v ->> 'asset')::UUID
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS l(v, ord);
  UPDATE journal_entries SET status = 'POSTED', posted_by = p_by WHERE tenant_id = p_tenant AND id = v_entry;
  RETURN v_entry;
END;
$$;

-- The day an automatic entry is dated: its own day, or the first open day after closed books
CREATE OR REPLACE FUNCTION gl_open_date(p_tenant UUID, p_date DATE)
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN s.lock_date IS NOT NULL AND p_date <= s.lock_date THEN s.lock_date + 1 ELSE p_date END
  FROM (SELECT (SELECT lock_date FROM gl_settings WHERE tenant_id = p_tenant) AS lock_date) s;
$$;

-- -----------------------------------------------------------------------------
-- Pledges
-- -----------------------------------------------------------------------------
-- (Re)posts the entry of a pledge: Pledges receivable / Donations income on the
-- day it was pledged. Then the money received for it (finance_transactions)
-- is posted again, so it clears the receivable (gl_post_transaction). No
-- entry when pledges are not accrued, when there is no receivable rule, for
-- in-kind pledges, and when the pledge or its payment lies in closed books.
CREATE OR REPLACE FUNCTION gl_post_pledge(p_tenant UUID, p_donation UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  d          RECORD;
  v_no       TEXT;
  v_recv     UUID;
  v_txn_date DATE;
  v_accrue   BOOLEAN;
BEGIN
  DELETE FROM journal_entries WHERE tenant_id = p_tenant AND source = 'PLEDGE' AND donation_id = p_donation RETURNING entry_no INTO v_no;
  SELECT * INTO d FROM donations WHERE tenant_id = p_tenant AND id = p_donation;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF d.transaction_id IS NOT NULL THEN
    SELECT txn_date INTO v_txn_date FROM finance_transactions WHERE tenant_id = p_tenant AND id = d.transaction_id;
  END IF;

  IF d.pledged_on IS NOT NULL AND d.status IN ('PLEDGED', 'RECEIVED') AND d.donation_type <> 'IN_KIND' THEN
    PERFORM gl_ensure_chart(p_tenant);
    SELECT accrue_pledges INTO v_accrue FROM gl_settings WHERE tenant_id = p_tenant;
    v_recv := gl_mapped(p_tenant, 'PLEDGES_RECEIVABLE');
    IF v_accrue AND v_recv IS NOT NULL AND NOT gl_locked(p_tenant, d.pledged_on)
       AND (v_txn_date IS NULL OR NOT gl_locked(p_tenant, v_txn_date)) THEN
      PERFORM gl_post_lines(
        p_tenant, d.pledged_on, 'Pledge — ' || d.donor_name || ' — ' || d.purpose, d.receipt_no, 'PLEDGE',
        d.id, NULL, NULL,
        jsonb_build_array(
          jsonb_build_object('account', v_recv, 'debit', d.amount, 'text', d.donor_name),
          jsonb_build_object('account', gl_category_account(p_tenant, 'INCOME', 'Donations'), 'credit', d.amount, 'text', d.donor_name)
        ),
        d.recorded_by, v_no
      );
    END IF;
  END IF;

  IF v_txn_date IS NOT NULL AND NOT gl_locked(p_tenant, v_txn_date) THEN
    PERFORM gl_post_transaction(p_tenant, d.transaction_id);
  END IF;
END;
$$;

-- (Re)posts the entry of one income / expense record. Money received for an
-- accrued pledge clears the pledge's receivable instead of being income again.
CREATE OR REPLACE FUNCTION gl_post_transaction(p_tenant UUID, p_txn UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  t        RECORD;
  v_money  UUID;
  v_other  UUID;
  v_recv   UUID;
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
  IF t.txn_type = 'INCOME' THEN
    SELECT l.account_id INTO v_recv
    FROM donations dn
    JOIN journal_entries e ON e.tenant_id = dn.tenant_id AND e.source = 'PLEDGE' AND e.donation_id = dn.id
    JOIN journal_lines l ON l.tenant_id = e.tenant_id AND l.entry_id = e.id AND l.debit > 0
    WHERE dn.tenant_id = p_tenant AND dn.transaction_id = p_txn
    LIMIT 1;
    v_other := COALESCE(v_recv, v_other);
  END IF;
  PERFORM gl_post_pair(
    p_tenant, t.txn_date, COALESCE(NULLIF(t.description, ''), t.category), t.receipt_no, 'TRANSACTION', t.id, NULL, NULL,
    CASE WHEN t.txn_type = 'INCOME' THEN v_money ELSE v_other END,
    CASE WHEN t.txn_type = 'INCOME' THEN v_other ELSE v_money END,
    t.amount, t.organization_unit_id, t.party, t.recorded_by, v_no
  );
END;
$$;

CREATE OR REPLACE FUNCTION gl_sync_donation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- What the pledge entry shows changed: post it again (and the money received for it)
  IF TG_OP = 'INSERT'
     OR (NEW.amount, NEW.pledged_on, NEW.donation_type, NEW.status = 'CANCELLED')
        IS DISTINCT FROM (OLD.amount, OLD.pledged_on, OLD.donation_type, OLD.status = 'CANCELLED') THEN
    IF NEW.pledged_on IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.pledged_on IS NOT NULL) THEN
      PERFORM gl_post_pledge(NEW.tenant_id, NEW.id);
    END IF;
  ELSIF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
    -- The money for a pledge was booked (or unlinked): it clears the receivable
    IF NEW.transaction_id IS NOT NULL THEN
      PERFORM gl_post_transaction(NEW.tenant_id, NEW.transaction_id);
    END IF;
    IF OLD.transaction_id IS NOT NULL THEN
      PERFORM gl_post_transaction(NEW.tenant_id, OLD.transaction_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_sync ON donations;
CREATE TRIGGER trg_gl_sync AFTER INSERT OR UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION gl_sync_donation();

-- -----------------------------------------------------------------------------
-- Fixed assets in the books
-- -----------------------------------------------------------------------------
-- The fixed-asset account of an asset: its own, its category's rule, the default
CREATE OR REPLACE FUNCTION gl_asset_account(p_tenant UUID, p_account UUID, p_category TEXT)
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    p_account,
    (SELECT m.account_id FROM gl_mappings m WHERE m.tenant_id = p_tenant AND m.source = 'ASSET_CATEGORY' AND m.key = p_category),
    gl_mapped(p_tenant, 'FIXED_ASSETS')
  );
$$;

-- (Re)posts the entry that puts an asset's cost in the books:
-- Fixed asset account / the account it is booked against
CREATE OR REPLACE FUNCTION gl_post_asset(p_tenant UUID, p_asset UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  a      RECORD;
  v_no   TEXT;
  v_acc  UUID;
BEGIN
  DELETE FROM journal_entries WHERE tenant_id = p_tenant AND source = 'ASSET' AND asset_id = p_asset RETURNING entry_no INTO v_no;
  SELECT * INTO a FROM assets WHERE tenant_id = p_tenant AND id = p_asset;
  IF FOUND AND a.booked_against_id IS NOT NULL AND COALESCE(a.value, 0) > 0 THEN
    PERFORM gl_ensure_chart(p_tenant);
    v_acc := gl_asset_account(p_tenant, a.gl_account_id, a.category);
    IF v_acc IS NULL THEN
      RAISE EXCEPTION 'Set the fixed assets account under Finance → Accounting → Chart of accounts → Posting rules' USING ERRCODE = 'P0001';
    END IF;
    PERFORM gl_post_lines(
      p_tenant, gl_open_date(p_tenant, COALESCE(a.acquired_on, a.depreciation_start, a.created_at::DATE)),
      'Fixed asset — ' || a.tag || ' ' || a.name_en, a.tag, 'ASSET', NULL, a.id, NULL,
      jsonb_build_array(
        jsonb_build_object('account', v_acc, 'debit', a.value, 'text', a.tag || ' ' || a.name_en, 'unit', a.organization_unit_id, 'asset', a.id),
        jsonb_build_object('account', a.booked_against_id, 'credit', a.value, 'text', a.tag || ' ' || a.name_en, 'unit', a.organization_unit_id, 'asset', a.id)
      ),
      a.created_by, v_no
    );
  END IF;
  PERFORM gl_post_disposal(p_tenant, p_asset);
END;
$$;

-- (Re)posts the entry of a disposed / lost asset that is in the books: its
-- accumulated depreciation and its cost leave the books; what is not yet
-- depreciated is a loss.
CREATE OR REPLACE FUNCTION gl_post_disposal(p_tenant UUID, p_asset UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  a        RECORD;
  v_no     TEXT;
  v_cost   NUMERIC;
  v_acc    UUID;
  v_accum  NUMERIC := 0;
  v_lines  JSONB := '[]'::JSONB;
  r        RECORD;
  v_loss   UUID;
BEGIN
  DELETE FROM journal_entries WHERE tenant_id = p_tenant AND source = 'DISPOSAL' AND asset_id = p_asset RETURNING entry_no INTO v_no;
  SELECT * INTO a FROM assets WHERE tenant_id = p_tenant AND id = p_asset;
  IF NOT FOUND OR a.disposed_on IS NULL THEN
    RETURN;
  END IF;
  -- Only an asset whose cost was put in the books
  SELECT l.debit, l.account_id INTO v_cost, v_acc
  FROM journal_entries e JOIN journal_lines l ON l.tenant_id = e.tenant_id AND l.entry_id = e.id AND l.debit > 0
  WHERE e.tenant_id = p_tenant AND e.source = 'ASSET' AND e.asset_id = p_asset
  LIMIT 1;
  IF v_cost IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT l.account_id, SUM(l.credit) AS amount
    FROM journal_lines l JOIN journal_entries e ON e.tenant_id = l.tenant_id AND e.id = l.entry_id
    WHERE l.tenant_id = p_tenant AND l.asset_id = p_asset AND e.source = 'DEPRECIATION' AND e.status = 'POSTED' AND l.credit > 0
    GROUP BY l.account_id
  LOOP
    v_lines := v_lines || jsonb_build_object('account', r.account_id, 'debit', r.amount, 'text', a.tag || ' ' || a.name_en, 'asset', a.id);
    v_accum := v_accum + r.amount;
  END LOOP;
  IF v_cost > v_accum THEN
    v_loss := COALESCE(gl_mapped(p_tenant, 'DISPOSAL_LOSS'), gl_default_account(p_tenant, 'EXPENSE'));
    v_lines := v_lines || jsonb_build_object('account', v_loss, 'debit', v_cost - v_accum, 'text', a.tag || ' ' || a.name_en, 'unit', a.organization_unit_id, 'asset', a.id);
  END IF;
  v_lines := v_lines || jsonb_build_object('account', v_acc, 'credit', GREATEST(v_cost, v_accum), 'text', a.tag || ' ' || a.name_en, 'asset', a.id);
  PERFORM gl_post_lines(
    p_tenant, gl_open_date(p_tenant, a.disposed_on),
    CASE WHEN a.status = 'LOST' THEN 'Asset lost — ' ELSE 'Asset disposed of — ' END || a.tag || ' ' || a.name_en,
    a.tag, 'DISPOSAL', NULL, a.id, NULL, v_lines, NULL, v_no
  );
END;
$$;

CREATE OR REPLACE FUNCTION gl_sync_asset()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.booked_against_id IS NOT NULL THEN
      PERFORM gl_post_asset(NEW.tenant_id, NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  -- Moving an asset, renaming it or changing its custodian changes nothing in the books
  IF (NEW.booked_against_id IS NOT NULL OR OLD.booked_against_id IS NOT NULL)
     AND (NEW.value, NEW.booked_against_id, NEW.gl_account_id, NEW.acquired_on, NEW.depreciation_start,
          CASE WHEN NEW.gl_account_id IS NULL THEN NEW.category END)
         IS DISTINCT FROM
         (OLD.value, OLD.booked_against_id, OLD.gl_account_id, OLD.acquired_on, OLD.depreciation_start,
          CASE WHEN OLD.gl_account_id IS NULL THEN OLD.category END) THEN
    PERFORM gl_post_asset(NEW.tenant_id, NEW.id);  -- and its disposal
  ELSIF NEW.disposed_on IS DISTINCT FROM OLD.disposed_on THEN
    PERFORM gl_post_disposal(NEW.tenant_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_sync ON assets;
CREATE TRIGGER trg_gl_sync AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION gl_sync_asset();

-- -----------------------------------------------------------------------------
-- Depreciation (straight-line, by calendar month)
-- -----------------------------------------------------------------------------
-- What each asset is depreciated by for a month. An asset counts from the
-- month its depreciation starts (else the month it was acquired) for its
-- useful life, until the month it is disposed of. Each month brings the total
-- to (cost − salvage) × months / life, so a month that was not posted is
-- caught up the next time.
CREATE OR REPLACE FUNCTION gl_depreciation_lines(p_tenant UUID, p_month DATE)
RETURNS TABLE (asset_id UUID, tag TEXT, name_en TEXT, unit_id UUID, cost NUMERIC, salvage NUMERIC, life INT, months INT, booked NUMERIC, amount NUMERIC)
LANGUAGE sql STABLE
AS $$
  WITH m AS (SELECT date_trunc('month', p_month)::DATE AS first),
  base AS (
    SELECT a.id, a.tag, a.name_en, a.organization_unit_id, a.value, a.salvage_value, a.useful_life_months,
           LEAST(
             a.useful_life_months,
             ((EXTRACT(YEAR FROM m.first) * 12 + EXTRACT(MONTH FROM m.first))
              - (EXTRACT(YEAR FROM COALESCE(a.depreciation_start, a.acquired_on)) * 12 + EXTRACT(MONTH FROM COALESCE(a.depreciation_start, a.acquired_on))) + 1)::INT
           ) AS k,
           COALESCE((
             SELECT SUM(l.credit)
             FROM journal_lines l JOIN journal_entries e ON e.tenant_id = l.tenant_id AND e.id = l.entry_id
             WHERE l.tenant_id = a.tenant_id AND l.asset_id = a.id AND l.credit > 0
               AND e.source = 'DEPRECIATION' AND e.status = 'POSTED' AND e.depreciation_month < m.first
           ), 0) AS done
    FROM assets a, m
    WHERE a.tenant_id = p_tenant
      AND a.useful_life_months IS NOT NULL
      AND COALESCE(a.value, 0) > a.salvage_value
      AND COALESCE(a.depreciation_start, a.acquired_on) IS NOT NULL
      AND date_trunc('month', COALESCE(a.depreciation_start, a.acquired_on))::DATE <= m.first
      AND (a.disposed_on IS NULL OR a.disposed_on >= (m.first + INTERVAL '1 month')::DATE)
  )
  SELECT id, tag, name_en, organization_unit_id, value, salvage_value, useful_life_months, k, done,
         round((value - salvage_value) * k / useful_life_months, 2) - done
  FROM base
  WHERE round((value - salvage_value) * k / useful_life_months, 2) - done > 0
  ORDER BY tag;
$$;

CREATE OR REPLACE FUNCTION gl_depreciation_tenant(p_tenant UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_tenant UUID := COALESCE(p_tenant, request_tenant_id());
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'depreciation: no tenant';
  END IF;
  IF request_tenant_id() IS NOT NULL AND v_tenant <> request_tenant_id() THEN
    RAISE EXCEPTION 'Cross-tenant change blocked (depreciation)' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant;
END;
$$;

-- For the page: what posting a month would write
CREATE OR REPLACE FUNCTION gl_depreciation_preview(p_month DATE, p_tenant UUID DEFAULT NULL)
RETURNS TABLE (asset_id UUID, tag TEXT, name_en TEXT, unit_id UUID, cost NUMERIC, salvage NUMERIC, life INT, months INT, booked NUMERIC, amount NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT * FROM gl_depreciation_lines(gl_depreciation_tenant(p_tenant), p_month);
$$;

-- Posts (or posts again) the depreciation of a month that has ended. Months
-- go in order: a month cannot be posted once a later one is. Returns the total.
CREATE OR REPLACE FUNCTION gl_post_depreciation(p_month DATE, p_tenant UUID DEFAULT NULL, p_by UUID DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID := gl_depreciation_tenant(p_tenant);
  v_month  DATE := date_trunc('month', p_month)::DATE;
  v_exp    UUID;
  v_accum  UUID;
  v_no     TEXT;
  v_lines  JSONB := '[]'::JSONB;
  v_total  NUMERIC := 0;
  r        RECORD;
BEGIN
  IF (v_month + INTERVAL '1 month')::DATE > (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::DATE THEN
    RAISE EXCEPTION 'DEP_NOT_ENDED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE tenant_id = v_tenant AND source = 'DEPRECIATION' AND depreciation_month > v_month) THEN
    RAISE EXCEPTION 'DEP_ORDER' USING ERRCODE = 'P0001';
  END IF;
  PERFORM gl_ensure_chart(v_tenant);
  v_exp := gl_mapped(v_tenant, 'DEPRECIATION');
  v_accum := gl_mapped(v_tenant, 'ACCUMULATED_DEPRECIATION');
  IF v_exp IS NULL OR v_accum IS NULL THEN
    RAISE EXCEPTION 'Set the depreciation and accumulated depreciation accounts under Finance → Accounting → Chart of accounts → Posting rules' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM journal_entries WHERE tenant_id = v_tenant AND source = 'DEPRECIATION' AND depreciation_month = v_month RETURNING entry_no INTO v_no;
  FOR r IN SELECT * FROM gl_depreciation_lines(v_tenant, v_month) LOOP
    v_lines := v_lines
      || jsonb_build_object('account', v_exp, 'debit', r.amount, 'text', r.tag || ' ' || r.name_en, 'unit', r.unit_id, 'asset', r.asset_id)
      || jsonb_build_object('account', v_accum, 'credit', r.amount, 'text', r.tag || ' ' || r.name_en, 'unit', r.unit_id, 'asset', r.asset_id);
    v_total := v_total + r.amount;
  END LOOP;
  IF v_total > 0 THEN
    PERFORM gl_post_lines(
      v_tenant, (v_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
      'Depreciation — ' || to_char(v_month, 'YYYY-MM'), 'DEP-' || to_char(v_month, 'YYYY-MM'), 'DEPRECIATION',
      NULL, NULL, v_month, v_lines, p_by, v_no
    );
  END IF;
  -- Disposed assets' disposal entries follow their depreciation
  FOR r IN SELECT id FROM assets WHERE tenant_id = v_tenant AND disposed_on IS NOT NULL AND disposed_on >= v_month LOOP
    PERFORM gl_post_disposal(v_tenant, r.id);
  END LOOP;
  RETURN v_total;
END;
$$;

-- Removes the latest month's depreciation (to post it again, e.g. after correcting an asset)
CREATE OR REPLACE FUNCTION gl_undo_depreciation(p_month DATE, p_tenant UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID := gl_depreciation_tenant(p_tenant);
  v_month  DATE := date_trunc('month', p_month)::DATE;
  r        RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE tenant_id = v_tenant AND source = 'DEPRECIATION' AND depreciation_month > v_month) THEN
    RAISE EXCEPTION 'DEP_ORDER' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM journal_entries WHERE tenant_id = v_tenant AND source = 'DEPRECIATION' AND depreciation_month = v_month;
  FOR r IN SELECT id FROM assets WHERE tenant_id = v_tenant AND disposed_on IS NOT NULL AND disposed_on >= v_month LOOP
    PERFORM gl_post_disposal(v_tenant, r.id);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Re-posting also covers pledges, assets and disposals
-- -----------------------------------------------------------------------------
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
      UNION ALL
      SELECT 'PLEDGE', id, pledged_on, created_at FROM donations WHERE tenant_id = v_tenant AND pledged_on >= v_from
      UNION ALL
      SELECT 'ASSET', id, COALESCE(acquired_on, depreciation_start, created_at::DATE), created_at FROM assets
      WHERE tenant_id = v_tenant AND booked_against_id IS NOT NULL AND COALESCE(acquired_on, depreciation_start, created_at::DATE) >= v_from
    ) s
    ORDER BY d, c, id
  LOOP
    IF r.kind = 'OPENING' THEN
      PERFORM gl_post_opening(v_tenant, r.id);
    ELSIF r.kind = 'TRANSFER' THEN
      PERFORM gl_post_transfer(v_tenant, r.id);
    ELSIF r.kind = 'PLEDGE' THEN
      PERFORM gl_post_pledge(v_tenant, r.id);
    ELSIF r.kind = 'ASSET' THEN
      PERFORM gl_post_asset(v_tenant, r.id);
    ELSE
      PERFORM gl_post_transaction(v_tenant, r.id);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- The new rules for Sunday schools that already have a chart, and their pledges
-- -----------------------------------------------------------------------------
INSERT INTO gl_mappings (tenant_id, source, key, account_id)
SELECT s.tenant_id, v.source, v.key, a.id
FROM gl_settings s
CROSS JOIN (VALUES
  ('DEFAULT', 'PLEDGES_RECEIVABLE', '1210'),
  ('DEFAULT', 'FIXED_ASSETS', '1510'),
  ('DEFAULT', 'DEPRECIATION', '5300'),
  ('DEFAULT', 'ACCUMULATED_DEPRECIATION', '1590'),
  ('DEFAULT', 'DISPOSAL_LOSS', '5900'),
  ('ASSET_CATEGORY', 'Audio-visual & sound', '1520'),
  ('ASSET_CATEGORY', 'Musical instruments', '1520'),
  ('ASSET_CATEGORY', 'Books & library', '1530')
) AS v(source, key, code)
JOIN gl_accounts a ON a.tenant_id = s.tenant_id AND a.code = v.code AND NOT a.is_header AND a.is_active
  AND (v.key <> 'ACCUMULATED_DEPRECIATION' OR a.sub_type = 'FIXED_ASSET')
  AND ((v.source <> 'ASSET_CATEGORY' AND v.key <> 'FIXED_ASSETS') OR a.sub_type = 'FIXED_ASSET')
ON CONFLICT DO NOTHING;

-- A new Sunday school gets them with its chart
CREATE OR REPLACE FUNCTION gl_seed_extra_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO gl_mappings (tenant_id, source, key, account_id)
  SELECT NEW.tenant_id, v.source, v.key, a.id
  FROM (VALUES
    ('DEFAULT', 'PLEDGES_RECEIVABLE', '1210'),
    ('DEFAULT', 'FIXED_ASSETS', '1510'),
    ('DEFAULT', 'DEPRECIATION', '5300'),
    ('DEFAULT', 'ACCUMULATED_DEPRECIATION', '1590'),
    ('DEFAULT', 'DISPOSAL_LOSS', '5900'),
    ('ASSET_CATEGORY', 'Audio-visual & sound', '1520'),
    ('ASSET_CATEGORY', 'Musical instruments', '1520'),
    ('ASSET_CATEGORY', 'Books & library', '1530')
  ) AS v(source, key, code)
  JOIN gl_accounts a ON a.tenant_id = NEW.tenant_id AND a.code = v.code AND NOT a.is_header AND a.is_active
    AND (v.key <> 'ACCUMULATED_DEPRECIATION' OR a.sub_type = 'FIXED_ASSET')
    AND ((v.source <> 'ASSET_CATEGORY' AND v.key <> 'FIXED_ASSETS') OR a.sub_type = 'FIXED_ASSET')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- gl_ensure_chart writes the chart, then its OPENING_BALANCE rule last: the
-- accounts exist by then
DROP TRIGGER IF EXISTS trg_gl_seed_extra_rules ON gl_mappings;
CREATE TRIGGER trg_gl_seed_extra_rules AFTER INSERT ON gl_mappings
  FOR EACH ROW WHEN (NEW.source = 'DEFAULT' AND NEW.key = 'OPENING_BALANCE')
  EXECUTE FUNCTION gl_seed_extra_rules();

-- Pledges already made (outside closed books) are posted as money owed
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT d.tenant_id, d.id FROM donations d
    WHERE d.pledged_on IS NOT NULL AND d.status IN ('PLEDGED', 'RECEIVED') AND d.donation_type <> 'IN_KIND'
      AND EXISTS (SELECT 1 FROM gl_settings s WHERE s.tenant_id = d.tenant_id)
    ORDER BY d.pledged_on, d.created_at
  LOOP
    PERFORM gl_post_pledge(r.tenant_id, r.id);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
