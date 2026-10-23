-- =============================================================================
-- SSMS — Migration 042: Bank accounts and bank reconciliation
-- Depends on: 040 (multi-tenancy) and 041 — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 042_bank_accounts_reconciliation_down.sql
-- =============================================================================
-- What it adds
-- • bank_accounts: the Sunday school's bank accounts, cash box and mobile
--   money (Telebirr) — each with an opening balance.
-- • finance_transactions.bank_account_id: which account the money went into
--   or came out of (empty for older records; reconciling fills it).
-- • account_transfers: money moved between two of the accounts (a deposit of
--   cash at the bank, a withdrawal) — not income, not an expense.
-- • bank_statements / bank_statement_lines: statements imported from the
--   bank (Excel / CSV). A line is matched to one or more ledger records (a
--   deposit of several collections), to a transfer, or set aside (ignored).
--   The same line imported twice is kept once (fingerprint per account).
-- Who may do what is checked by the server (FINANCE_VIEW / FINANCE_CREATE /
-- FINANCE_APPROVE); the public API keys have no access, as for every tenant table.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regprocedure('public.request_tenant_id()') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 040 (multi-tenancy) first';
  END IF;
  IF to_regclass('public.plans') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 041 (billing and platform) first';
  END IF;
  IF to_regclass('public.finance_transactions') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 008 (finance) first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'BANK' CHECK (kind IN ('BANK', 'CASH', 'MOBILE')),
  bank_name        TEXT,
  account_number   TEXT,
  branch           TEXT,
  currency         TEXT NOT NULL DEFAULT 'ETB',
  opening_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_accounts_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT bank_accounts_tid_name_key UNIQUE (tenant_id, name),
  CONSTRAINT bank_accounts_created_by_fkey FOREIGN KEY (tenant_id, created_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (created_by)
);

-- -----------------------------------------------------------------------------
-- Transfers between accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_transfers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  from_account_id  UUID NOT NULL,
  to_account_id    UUID NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  transfer_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  reference        TEXT,
  notes            TEXT,
  recorded_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_account_id <> to_account_id),
  CONSTRAINT account_transfers_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT account_transfers_from_fkey FOREIGN KEY (tenant_id, from_account_id)
    REFERENCES bank_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT account_transfers_to_fkey FOREIGN KEY (tenant_id, to_account_id)
    REFERENCES bank_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT account_transfers_recorded_by_fkey FOREIGN KEY (tenant_id, recorded_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (recorded_by)
);
CREATE INDEX IF NOT EXISTS idx_account_transfers_from ON account_transfers (tenant_id, from_account_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_account_transfers_to   ON account_transfers (tenant_id, to_account_id, transfer_date);

-- -----------------------------------------------------------------------------
-- Imported statements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_statements (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  bank_account_id  UUID NOT NULL,
  file_name        TEXT NOT NULL,
  period_start     DATE,
  period_end       DATE,
  -- From the file's balance column when it has one, else typed in
  opening_balance  NUMERIC(14,2),
  closing_balance  NUMERIC(14,2),
  line_count       INT NOT NULL DEFAULT 0,
  skipped_count    INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RECONCILED')),
  imported_by      UUID,
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_by    UUID,
  reconciled_at    TIMESTAMPTZ,
  CONSTRAINT bank_statements_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT bank_statements_account_fkey FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES bank_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT bank_statements_imported_by_fkey FOREIGN KEY (tenant_id, imported_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (imported_by),
  CONSTRAINT bank_statements_reconciled_by_fkey FOREIGN KEY (tenant_id, reconciled_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (reconciled_by)
);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements (tenant_id, bank_account_id, period_end DESC);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  statement_id     UUID NOT NULL,
  bank_account_id  UUID NOT NULL,
  line_date        DATE NOT NULL,
  description      TEXT,
  reference        TEXT,
  -- Money in is positive, money out negative
  amount           NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
  balance          NUMERIC(14,2),
  -- Same line in an overlapping statement → same fingerprint → kept once
  fingerprint      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED', 'MATCHED', 'IGNORED')),
  transfer_id      UUID,
  note             TEXT,
  matched_by       UUID,
  matched_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_statement_lines_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT bank_statement_lines_fingerprint_key UNIQUE (tenant_id, bank_account_id, fingerprint),
  CONSTRAINT bank_statement_lines_statement_fkey FOREIGN KEY (tenant_id, statement_id)
    REFERENCES bank_statements (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT bank_statement_lines_account_fkey FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES bank_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT bank_statement_lines_transfer_fkey FOREIGN KEY (tenant_id, transfer_id)
    REFERENCES account_transfers (tenant_id, id) ON DELETE SET NULL (transfer_id),
  CONSTRAINT bank_statement_lines_matched_by_fkey FOREIGN KEY (tenant_id, matched_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (matched_by)
);
CREATE INDEX IF NOT EXISTS idx_bank_lines_statement ON bank_statement_lines (tenant_id, statement_id, line_date);
CREATE INDEX IF NOT EXISTS idx_bank_lines_open ON bank_statement_lines (tenant_id, bank_account_id, status, line_date);

-- -----------------------------------------------------------------------------
-- Ledger records: their account, and the statement line they are matched to
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'finance_transactions'::regclass AND conname = 'finance_transactions_tid_id_key') THEN
    ALTER TABLE finance_transactions ADD CONSTRAINT finance_transactions_tid_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS bank_account_id UUID;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS statement_line_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'finance_transactions'::regclass AND conname = 'finance_transactions_bank_account_fkey') THEN
    ALTER TABLE finance_transactions ADD CONSTRAINT finance_transactions_bank_account_fkey
      FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts (tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'finance_transactions'::regclass AND conname = 'finance_transactions_statement_line_fkey') THEN
    ALTER TABLE finance_transactions ADD CONSTRAINT finance_transactions_statement_line_fkey
      FOREIGN KEY (tenant_id, statement_line_id) REFERENCES bank_statement_lines (tenant_id, id) ON DELETE SET NULL (statement_line_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_txn_account ON finance_transactions (tenant_id, bank_account_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_fin_txn_statement_line ON finance_transactions (tenant_id, statement_line_id);

-- -----------------------------------------------------------------------------
-- Tenant plumbing, as migration 040 does for every tenant table
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_accounts', 'account_transfers', 'bank_statements', 'bank_statement_lines'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', left('idx_' || t || '_tenant', 63), t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tenant_guard ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION tenant_guard()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', 'trg_audit_' || t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Statement lines change often while matching: no row-by-row audit for them
DROP TRIGGER IF EXISTS trg_audit_bank_statement_lines ON bank_statement_lines;

-- The list of tenant tables (used by 040's final check and future migrations)
CREATE OR REPLACE FUNCTION _mt_tenant_tables()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'organization_units', 'organization_relationships', 'persons', 'system_users',
    'governance_bodies', 'governance_body_rules', 'governance_positions', 'governance_memberships',
    'roles', 'role_permissions', 'user_unit_assignments', 'system_audit_logs',
    'academic_years', 'classes', 'subjects', 'students', 'student_guardians', 'enrollments',
    'attendance_sessions', 'attendance_records', 'grades',
    'system_settings', 'finance_requests', 'finance_transactions', 'budget_allocations', 'donations',
    'programs', 'assets', 'asset_movements', 'asset_maintenance',
    'choir_members', 'hymns', 'choir_sessions', 'choir_session_hymns', 'choir_attendance',
    'service_assignments', 'servant_attendance', 'discipline_cases', 'push_subscriptions',
    'tasks', 'task_updates', 'task_series', 'task_files',
    'exams', 'exam_questions', 'exam_attempts',
    'telegram_links', 'telegram_link_codes', 'telegram_broadcasts', 'telegram_sessions', 'telegram_chats',
    'dues_rates', 'member_dues', 'dues_claims',
    'unit_plans', 'plan_activities', 'plan_updates', 'member_questions',
    'checkin_events', 'checkins', 'service_roster', 'vestments', 'vestment_loans',
    'automation_log', 'site_posts', 'site_albums', 'site_photos',
    'tenant_counters', 'tenant_secrets',
    'bank_accounts', 'account_transfers', 'bank_statements', 'bank_statement_lines'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
