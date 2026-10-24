-- =============================================================================
-- SSMS — Migration 044: General ledger (double-entry accounting)
-- Depends on: 040 (multi-tenancy), 041 (plans) and 042 (bank accounts) — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 044_general_ledger_down.sql
-- =============================================================================
-- What it adds
-- • gl_accounts: the chart of accounts — account number, name (English and
--   Amharic), type (asset, liability, net assets/equity, income, expense),
--   sub-type (for the statements), normal balance (debit or credit) and
--   group (heading) accounts. Each bank account / cash box / Telebirr gets its
--   own GL account automatically.
-- • gl_mappings: the posting rules — which GL account an income or expense
--   category posts to, and the default cash, income, expense and opening
--   balance accounts.
-- • gl_settings: fiscal year start, the date the books are closed to (no
--   posting on or before it), and whether manual entries need a second person.
-- • journal_entries / journal_lines: every entry has balanced debit and credit
--   lines (checked by the database when it is posted). Posted entries are
--   final — a mistake is corrected by a reversing entry.
-- • Automatic posting: every income / expense record (dues, donations,
--   payment requests, bank lines…), every transfer between accounts and every
--   account's opening balance writes its own posted entry, kept in step when
--   the record changes or is removed. Existing records are posted below.
-- • Each Sunday school gets a standard chart of accounts the first time it is
--   needed (all existing ones get it now); it can be renumbered and extended.
-- Who may do what is checked by the server (FINANCE_VIEW / FINANCE_CREATE /
-- FINANCE_APPROVE); the public API keys have no access, as for every tenant table.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regprocedure('public.tenant_fill_number()') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 040 (multi-tenancy) first';
  END IF;
  IF to_regclass('public.platform_modules') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 041 (billing and platform) first';
  END IF;
  IF to_regclass('public.bank_accounts') IS NULL OR to_regclass('public.account_transfers') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 042 (bank accounts and reconciliation) first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Chart of accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_accounts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  code             TEXT NOT NULL CHECK (code ~ '^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$'),
  name_en          TEXT NOT NULL CHECK (length(trim(name_en)) > 0),
  name_am          TEXT,
  account_type     TEXT NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  sub_type         TEXT NOT NULL,
  normal_balance   TEXT NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  parent_id        UUID,
  is_header        BOOLEAN NOT NULL DEFAULT FALSE,
  bank_account_id  UUID,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_accounts_sub_type_check CHECK (
       (account_type = 'ASSET'     AND sub_type IN ('CASH_BANK', 'RECEIVABLE', 'CURRENT_ASSET', 'FIXED_ASSET', 'OTHER_ASSET'))
    OR (account_type = 'LIABILITY' AND sub_type IN ('CURRENT_LIABILITY', 'LONG_TERM_LIABILITY'))
    OR (account_type = 'EQUITY'    AND sub_type IN ('NET_ASSETS', 'RESTRICTED_FUND', 'OPENING_BALANCE'))
    OR (account_type = 'INCOME'    AND sub_type IN ('OPERATING_INCOME', 'OTHER_INCOME'))
    OR (account_type = 'EXPENSE'   AND sub_type IN ('PROGRAM_EXPENSE', 'ADMIN_EXPENSE', 'FUNDRAISING_EXPENSE', 'OTHER_EXPENSE'))
  ),
  CONSTRAINT gl_accounts_not_own_parent CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT gl_accounts_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT gl_accounts_tid_code_key UNIQUE (tenant_id, code),
  CONSTRAINT gl_accounts_tid_bank_key UNIQUE (tenant_id, bank_account_id),
  CONSTRAINT gl_accounts_parent_fkey FOREIGN KEY (tenant_id, parent_id)
    REFERENCES gl_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT gl_accounts_bank_account_fkey FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES bank_accounts (tenant_id, id) ON DELETE SET NULL (bank_account_id),
  CONSTRAINT gl_accounts_created_by_fkey FOREIGN KEY (tenant_id, created_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE INDEX IF NOT EXISTS idx_gl_accounts_parent ON gl_accounts (tenant_id, parent_id);

-- -----------------------------------------------------------------------------
-- Settings, one row per Sunday school
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_settings (
  tenant_id          UUID PRIMARY KEY DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  -- MM-DD; Ethiopian fiscal year (Hamle 1) = 07-08, Meskerem 1 = 09-11
  fiscal_year_start  TEXT NOT NULL DEFAULT '07-08'
    CHECK (fiscal_year_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  -- Books closed: nothing dated on or before it can be posted, changed or removed
  lock_date          DATE,
  -- Manual entries must be posted by someone other than the person who wrote them
  require_approval   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_settings_updated_by_fkey FOREIGN KEY (tenant_id, updated_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (updated_by)
);

-- -----------------------------------------------------------------------------
-- Posting rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_mappings (
  tenant_id   UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  source      TEXT NOT NULL CHECK (source IN ('DEFAULT', 'INCOME_CATEGORY', 'EXPENSE_CATEGORY')),
  key         TEXT NOT NULL CHECK (length(trim(key)) > 0),
  account_id  UUID NOT NULL,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, source, key),
  CONSTRAINT gl_mappings_default_key CHECK (source <> 'DEFAULT' OR key IN ('CASH', 'INCOME', 'EXPENSE', 'OPENING_BALANCE')),
  CONSTRAINT gl_mappings_account_fkey FOREIGN KEY (tenant_id, account_id)
    REFERENCES gl_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT gl_mappings_updated_by_fkey FOREIGN KEY (tenant_id, updated_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (updated_by)
);
CREATE INDEX IF NOT EXISTS idx_gl_mappings_account ON gl_mappings (tenant_id, account_id);

-- -----------------------------------------------------------------------------
-- Journal
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  entry_no         TEXT NOT NULL,  -- JV-<year>-0001, filled by trg_number
  entry_date       DATE NOT NULL,
  memo             TEXT NOT NULL CHECK (length(trim(memo)) > 0),
  reference        TEXT,
  -- MANUAL: written by a person · TRANSACTION / TRANSFER / OPENING: posted
  -- automatically from an income-expense record, a transfer, an account's
  -- opening balance · REVERSAL: cancels a posted manual entry
  source           TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'TRANSACTION', 'TRANSFER', 'OPENING', 'REVERSAL')),
  -- DRAFT → PENDING (waiting for approval) → POSTED; returned = back to DRAFT with a note
  status           TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'POSTED')),
  transaction_id   UUID,
  transfer_id      UUID,
  bank_account_id  UUID,
  reversal_of      UUID,
  total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  review_note      TEXT,
  created_by       UUID,
  submitted_at     TIMESTAMPTZ,
  posted_by        UUID,
  posted_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT journal_entries_source_links CHECK (
        (source = 'TRANSACTION') = (transaction_id IS NOT NULL)
    AND (source = 'TRANSFER') = (transfer_id IS NOT NULL)
    AND (source = 'OPENING') = (bank_account_id IS NOT NULL)
    AND (source = 'REVERSAL') = (reversal_of IS NOT NULL)
  ),
  CONSTRAINT journal_entries_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT journal_entries_tid_entry_no_key UNIQUE (tenant_id, entry_no),
  CONSTRAINT journal_entries_tid_transaction_key UNIQUE (tenant_id, transaction_id),
  CONSTRAINT journal_entries_tid_transfer_key UNIQUE (tenant_id, transfer_id),
  CONSTRAINT journal_entries_tid_bank_account_key UNIQUE (tenant_id, bank_account_id),
  CONSTRAINT journal_entries_tid_reversal_key UNIQUE (tenant_id, reversal_of),
  CONSTRAINT journal_entries_transaction_fkey FOREIGN KEY (tenant_id, transaction_id)
    REFERENCES finance_transactions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT journal_entries_transfer_fkey FOREIGN KEY (tenant_id, transfer_id)
    REFERENCES account_transfers (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT journal_entries_bank_account_fkey FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES bank_accounts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT journal_entries_reversal_of_fkey FOREIGN KEY (tenant_id, reversal_of)
    REFERENCES journal_entries (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (tenant_id, created_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (created_by),
  CONSTRAINT journal_entries_posted_by_fkey FOREIGN KEY (tenant_id, posted_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (posted_by)
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (tenant_id, entry_date DESC, entry_no);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries (tenant_id, status) WHERE status <> 'POSTED';

CREATE TABLE IF NOT EXISTS journal_lines (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  entry_id              UUID NOT NULL,
  line_no               INT NOT NULL DEFAULT 1,
  account_id            UUID NOT NULL,
  debit                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description           TEXT,
  -- Department / cost centre (income statement per department)
  organization_unit_id  UUID,
  CONSTRAINT journal_lines_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CONSTRAINT journal_lines_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT journal_lines_entry_fkey FOREIGN KEY (tenant_id, entry_id)
    REFERENCES journal_entries (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT journal_lines_account_fkey FOREIGN KEY (tenant_id, account_id)
    REFERENCES gl_accounts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT journal_lines_unit_fkey FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES organization_units (tenant_id, id) ON DELETE SET NULL (organization_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines (tenant_id, entry_id, line_no);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines (tenant_id, account_id);

-- -----------------------------------------------------------------------------
-- Rules the database keeps
-- -----------------------------------------------------------------------------
-- Closed period?
CREATE OR REPLACE FUNCTION gl_locked(p_tenant UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM gl_settings WHERE tenant_id = p_tenant AND lock_date IS NOT NULL AND p_date <= lock_date);
$$;

CREATE OR REPLACE FUNCTION gl_raise_locked(p_tenant UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'GL_LOCKED:%', (SELECT lock_date FROM gl_settings WHERE tenant_id = p_tenant) USING ERRCODE = 'P0001';
END;
$$;

-- Accounts: groups hold sub-accounts of their own type; an account's type
-- cannot change once it has entries; an account a posting rule uses stays usable.
CREATE OR REPLACE FUNCTION gl_account_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent  RECORD;
  v_walk    UUID;
  v_depth   INT := 0;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT account_type, is_header INTO v_parent FROM gl_accounts WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_id;
    IF NOT FOUND OR NOT v_parent.is_header THEN
      RAISE EXCEPTION 'The parent must be a group (heading) account' USING ERRCODE = 'P0001';
    END IF;
    IF v_parent.account_type <> NEW.account_type THEN
      RAISE EXCEPTION 'A sub-account must be of the same type as its group' USING ERRCODE = 'P0001';
    END IF;
    v_walk := NEW.parent_id;
    WHILE v_walk IS NOT NULL LOOP
      IF v_walk = NEW.id THEN
        RAISE EXCEPTION 'An account cannot be placed under one of its own sub-accounts' USING ERRCODE = 'P0001';
      END IF;
      v_depth := v_depth + 1;
      IF v_depth > 12 THEN
        RAISE EXCEPTION 'The account groups are nested too deeply' USING ERRCODE = 'P0001';
      END IF;
      SELECT parent_id INTO v_walk FROM gl_accounts WHERE tenant_id = NEW.tenant_id AND id = v_walk;
    END LOOP;
  END IF;

  IF NEW.bank_account_id IS NOT NULL AND (NEW.account_type <> 'ASSET' OR NEW.sub_type <> 'CASH_BANK' OR NEW.is_header) THEN
    RAISE EXCEPTION 'The account of a bank account must be a cash & bank asset' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.account_type <> OLD.account_type OR (NEW.is_header AND NOT OLD.is_header))
       AND EXISTS (SELECT 1 FROM journal_lines WHERE tenant_id = NEW.tenant_id AND account_id = NEW.id) THEN
      RAISE EXCEPTION 'This account already has entries — its type cannot be changed and it cannot become a group' USING ERRCODE = 'P0001';
    END IF;
    IF (NEW.account_type <> OLD.account_type OR (OLD.is_header AND NOT NEW.is_header))
       AND EXISTS (SELECT 1 FROM gl_accounts WHERE tenant_id = NEW.tenant_id AND parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Move or remove this group''s sub-accounts first' USING ERRCODE = 'P0001';
    END IF;
    IF (NEW.is_header OR NOT NEW.is_active)
       AND EXISTS (SELECT 1 FROM gl_mappings WHERE tenant_id = NEW.tenant_id AND account_id = NEW.id) THEN
      RAISE EXCEPTION 'A posting rule uses this account — point the rule to another account first' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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

-- Entries: balanced when posted, final once posted, nothing in a closed period
CREATE OR REPLACE FUNCTION gl_entry_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dr  NUMERIC;
  v_cr  NUMERIC;
  v_n   INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'POSTED' THEN
      IF OLD.source IN ('MANUAL', 'REVERSAL') THEN
        RAISE EXCEPTION 'A posted journal entry cannot be deleted — reverse it instead' USING ERRCODE = 'P0001';
      END IF;
      IF gl_locked(OLD.tenant_id, OLD.entry_date) THEN
        PERFORM gl_raise_locked(OLD.tenant_id);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'A posted journal entry cannot be changed — reverse it instead' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'POSTED' THEN
    RAISE EXCEPTION 'Save the entry with its lines first, then post it' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*) INTO v_dr, v_cr, v_n
  FROM journal_lines WHERE tenant_id = NEW.tenant_id AND entry_id = NEW.id;
  NEW.total := v_dr;

  IF NEW.status = 'POSTED' THEN
    IF gl_locked(NEW.tenant_id, NEW.entry_date) THEN
      PERFORM gl_raise_locked(NEW.tenant_id);
    END IF;
    IF v_n < 2 THEN
      RAISE EXCEPTION 'A journal entry needs at least two lines' USING ERRCODE = 'P0001';
    END IF;
    IF v_dr <> v_cr THEN
      RAISE EXCEPTION 'The entry is not balanced: debits % and credits %', v_dr, v_cr USING ERRCODE = 'P0001';
    END IF;
    NEW.posted_at := COALESCE(NEW.posted_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

-- Lines: only while the entry is not posted; never on a group account; manual
-- entries only on active accounts
CREATE OR REPLACE FUNCTION gl_line_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry  RECORD;
  v_acc    RECORD;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- During a cascade the entry is already gone: nothing to protect
    SELECT status INTO v_entry FROM journal_entries WHERE tenant_id = OLD.tenant_id AND id = OLD.entry_id;
    IF FOUND AND v_entry.status = 'POSTED' THEN
      RAISE EXCEPTION 'The lines of a posted journal entry cannot be changed' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT status, source INTO v_entry FROM journal_entries WHERE tenant_id = NEW.tenant_id AND id = NEW.entry_id;
  IF FOUND AND v_entry.status = 'POSTED' THEN
    RAISE EXCEPTION 'The lines of a posted journal entry cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  SELECT code, is_header, is_active INTO v_acc FROM gl_accounts WHERE tenant_id = NEW.tenant_id AND id = NEW.account_id;
  IF FOUND AND v_acc.is_header THEN
    RAISE EXCEPTION 'Account % is a group heading — use one of its sub-accounts', v_acc.code USING ERRCODE = 'P0001';
  END IF;
  IF FOUND AND NOT v_acc.is_active AND v_entry.source = 'MANUAL' THEN
    RAISE EXCEPTION 'Account % is inactive', v_acc.code USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Settings: the lock date cannot move into the future
CREATE OR REPLACE FUNCTION gl_settings_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lock_date IS NOT NULL AND NEW.lock_date >= CURRENT_DATE THEN
    RAISE EXCEPTION 'The books can only be closed up to a day in the past' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- The standard chart, given to a Sunday school the first time it is needed
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gl_ensure_chart(p_tenant UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM gl_settings WHERE tenant_id = p_tenant) THEN
    RETURN;
  END IF;
  -- Two requests at once must not both seed
  PERFORM pg_advisory_xact_lock(hashtext('gl_chart:' || p_tenant::text));
  IF EXISTS (SELECT 1 FROM gl_settings WHERE tenant_id = p_tenant) THEN
    RETURN;
  END IF;

  INSERT INTO gl_settings (tenant_id) VALUES (p_tenant);

  INSERT INTO gl_accounts (tenant_id, code, name_en, name_am, account_type, sub_type, normal_balance, is_header)
  SELECT p_tenant, v.code, v.name_en, v.name_am, v.typ, v.sub, v.nb, v.hdr
  FROM (VALUES
    ('1000', 'Assets',                                   'ሀብት',                                   'ASSET',     'CURRENT_ASSET',      'DEBIT',  TRUE),
    ('1100', 'Cash and bank',                            'ጥሬ ገንዘብና ባንክ',                          'ASSET',     'CASH_BANK',          'DEBIT',  TRUE),
    ('1101', 'Cash on hand',                             'በእጅ ያለ ጥሬ ገንዘብ',                        'ASSET',     'CASH_BANK',          'DEBIT',  FALSE),
    ('1200', 'Receivables',                              'ተሰብሳቢ ሂሳቦች',                            'ASSET',     'RECEIVABLE',         'DEBIT',  TRUE),
    ('1210', 'Pledges receivable',                       'ቃል የተገባ ስጦታ (ተሰብሳቢ)',                    'ASSET',     'RECEIVABLE',         'DEBIT',  FALSE),
    ('1220', 'Advances to departments and servants',     'ለክፍሎችና ለአገልጋዮች የተሰጠ ቅድሚያ',              'ASSET',     'RECEIVABLE',         'DEBIT',  FALSE),
    ('1300', 'Prepaid expenses',                         'አስቀድሞ የተከፈሉ ወጪዎች',                       'ASSET',     'CURRENT_ASSET',      'DEBIT',  FALSE),
    ('1400', 'Supplies and stock',                       'የዕቃ ክምችት',                               'ASSET',     'CURRENT_ASSET',      'DEBIT',  FALSE),
    ('1500', 'Fixed assets',                             'ቋሚ ንብረቶች',                               'ASSET',     'FIXED_ASSET',        'DEBIT',  TRUE),
    ('1510', 'Furniture and equipment',                  'የቢሮ ዕቃዎችና መሣሪያዎች',                       'ASSET',     'FIXED_ASSET',        'DEBIT',  FALSE),
    ('1520', 'Musical instruments and sound system',     'የዜማ መሣሪያዎችና የድምፅ ሥርዓት',                  'ASSET',     'FIXED_ASSET',        'DEBIT',  FALSE),
    ('1530', 'Books and library',                        'መጻሕፍትና ቤተ መጻሕፍት',                        'ASSET',     'FIXED_ASSET',        'DEBIT',  FALSE),
    ('1540', 'Buildings and improvements',               'ሕንፃና ማሻሻያዎች',                            'ASSET',     'FIXED_ASSET',        'DEBIT',  FALSE),
    ('1590', 'Accumulated depreciation',                 'የተጠራቀመ የእርጅና ቅናሽ',                        'ASSET',     'FIXED_ASSET',        'CREDIT', FALSE),
    ('2000', 'Liabilities',                              'ዕዳዎች',                                   'LIABILITY', 'CURRENT_LIABILITY',  'CREDIT', TRUE),
    ('2100', 'Accounts payable',                         'ተከፋይ ሂሳቦች',                              'LIABILITY', 'CURRENT_LIABILITY',  'CREDIT', FALSE),
    ('2200', 'Accrued expenses',                         'የተጠራቀሙ ወጪዎች',                            'LIABILITY', 'CURRENT_LIABILITY',  'CREDIT', FALSE),
    ('2300', 'Dues and income received in advance',      'አስቀድሞ የተቀበሉት መዋጮና ገቢ',                    'LIABILITY', 'CURRENT_LIABILITY',  'CREDIT', FALSE),
    ('2400', 'Loans payable',                            'ተከፋይ ብድር',                               'LIABILITY', 'LONG_TERM_LIABILITY', 'CREDIT', FALSE),
    ('3000', 'Net assets (funds)',                       'የተጣራ ሀብት (ፈንድ)',                          'EQUITY',    'NET_ASSETS',         'CREDIT', TRUE),
    ('3100', 'General fund',                             'አጠቃላይ ፈንድ',                              'EQUITY',    'NET_ASSETS',         'CREDIT', FALSE),
    ('3200', 'Restricted funds (e.g. building fund)',    'የተገደበ ፈንድ (ለምሳሌ የሕንፃ ፈንድ)',                'EQUITY',    'RESTRICTED_FUND',    'CREDIT', FALSE),
    ('3900', 'Opening balance equity',                   'የመነሻ ቀሪ ሂሳብ',                             'EQUITY',    'OPENING_BALANCE',    'CREDIT', FALSE),
    ('4000', 'Income',                                   'ገቢ',                                     'INCOME',    'OPERATING_INCOME',   'CREDIT', TRUE),
    ('4100', 'Member contributions',                     'የአባላት መዋጮ',                              'INCOME',    'OPERATING_INCOME',   'CREDIT', FALSE),
    ('4200', 'Donations',                                'ስጦታ / ልገሳ',                               'INCOME',    'OPERATING_INCOME',   'CREDIT', FALSE),
    ('4300', 'Church support',                           'ከቤተ ክርስቲያን ድጋፍ',                          'INCOME',    'OPERATING_INCOME',   'CREDIT', FALSE),
    ('4400', 'Event and program income',                 'ከዝግጅቶች ገቢ',                              'INCOME',    'OPERATING_INCOME',   'CREDIT', FALSE),
    ('4500', 'Sales',                                    'ሽያጭ',                                    'INCOME',    'OPERATING_INCOME',   'CREDIT', FALSE),
    ('4600', 'Bank interest',                            'የባንክ ወለድ',                               'INCOME',    'OTHER_INCOME',       'CREDIT', FALSE),
    ('4900', 'Other income',                             'ሌላ ገቢ',                                  'INCOME',    'OTHER_INCOME',       'CREDIT', FALSE),
    ('5000', 'Expenses',                                 'ወጪ',                                     'EXPENSE',   'PROGRAM_EXPENSE',    'DEBIT',  TRUE),
    ('5100', 'Programs and events',                      'ፕሮግራምና ዝግጅቶች',                            'EXPENSE',   'PROGRAM_EXPENSE',    'DEBIT',  FALSE),
    ('5110', 'Teaching materials',                       'የማስተማሪያ ቁሳቁስ',                            'EXPENSE',   'PROGRAM_EXPENSE',    'DEBIT',  FALSE),
    ('5120', 'Food and refreshments',                    'ምግብና መስተንግዶ',                             'EXPENSE',   'PROGRAM_EXPENSE',    'DEBIT',  FALSE),
    ('5130', 'Charity and support',                      'የበጎ አድራጎት ድጋፍ',                           'EXPENSE',   'PROGRAM_EXPENSE',    'DEBIT',  FALSE),
    ('5140', 'Printing and media',                       'ሕትመትና ሚዲያ',                              'EXPENSE',   'PROGRAM_EXPENSE',    'DEBIT',  FALSE),
    ('5200', 'Stationery and supplies',                  'የጽሕፈት መሣሪያና ቁሳቁስ',                         'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5210', 'Transport',                                'ትራንስፖርት',                                'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5220', 'Utilities (electricity, water)',           'አገልግሎቶች (መብራት፣ ውሃ)',                     'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5230', 'Maintenance and repair',                   'ጥገና',                                    'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5240', 'Small equipment',                          'አነስተኛ መሣሪያዎች',                            'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5250', 'Bank charges',                             'የባንክ ክፍያ',                               'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5300', 'Depreciation',                             'የእርጅና ቅናሽ',                              'EXPENSE',   'ADMIN_EXPENSE',      'DEBIT',  FALSE),
    ('5900', 'Other expenses',                           'ሌሎች ወጪዎች',                               'EXPENSE',   'OTHER_EXPENSE',      'DEBIT',  FALSE)
  ) AS v(code, name_en, name_am, typ, sub, nb, hdr)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  -- Groups: 1000 holds 1100, 1200, 1300…; 1100 holds 1101…
  UPDATE gl_accounts c SET parent_id = p.id
  FROM gl_accounts p
  WHERE c.tenant_id = p_tenant AND p.tenant_id = p_tenant AND c.parent_id IS NULL AND p.is_header
    AND c.code <> p.code
    AND p.code = CASE
      WHEN c.code IN ('1101') THEN '1100'
      WHEN c.code IN ('1210', '1220') THEN '1200'
      WHEN c.code IN ('1510', '1520', '1530', '1540', '1590') THEN '1500'
      WHEN c.code IN ('1100', '1200', '1300', '1400', '1500') THEN '1000'
      WHEN c.code LIKE '2%' THEN '2000'
      WHEN c.code LIKE '3%' THEN '3000'
      WHEN c.code LIKE '4%' THEN '4000'
      WHEN c.code LIKE '5%' THEN '5000'
    END;

  INSERT INTO gl_mappings (tenant_id, source, key, account_id)
  SELECT p_tenant, v.source, v.key, a.id
  FROM (VALUES
    ('DEFAULT', 'CASH', '1101'),
    ('DEFAULT', 'INCOME', '4900'),
    ('DEFAULT', 'EXPENSE', '5900'),
    ('DEFAULT', 'OPENING_BALANCE', '3900'),
    ('INCOME_CATEGORY', 'Member Contributions', '4100'),
    ('INCOME_CATEGORY', 'Donations', '4200'),
    ('INCOME_CATEGORY', 'Church Support', '4300'),
    ('INCOME_CATEGORY', 'Events & Programs', '4400'),
    ('INCOME_CATEGORY', 'Sales', '4500'),
    ('INCOME_CATEGORY', 'Bank Interest', '4600'),
    ('INCOME_CATEGORY', 'Other', '4900'),
    ('EXPENSE_CATEGORY', 'Programs & Events', '5100'),
    ('EXPENSE_CATEGORY', 'Teaching Materials', '5110'),
    ('EXPENSE_CATEGORY', 'Food & Refreshments', '5120'),
    ('EXPENSE_CATEGORY', 'Charity & Support', '5130'),
    ('EXPENSE_CATEGORY', 'Printing & Media', '5140'),
    ('EXPENSE_CATEGORY', 'Stationery & Supplies', '5200'),
    ('EXPENSE_CATEGORY', 'Transport', '5210'),
    ('EXPENSE_CATEGORY', 'Utilities', '5220'),
    ('EXPENSE_CATEGORY', 'Maintenance & Repair', '5230'),
    ('EXPENSE_CATEGORY', 'Equipment', '5240'),
    ('EXPENSE_CATEGORY', 'Bank Charges', '5250'),
    ('EXPENSE_CATEGORY', 'Other', '5900')
  ) AS v(source, key, code)
  JOIN gl_accounts a ON a.tenant_id = p_tenant AND a.code = v.code
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION gl_default_account(p_tenant UUID, p_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT account_id INTO v_id FROM gl_mappings WHERE tenant_id = p_tenant AND source = 'DEFAULT' AND key = p_key;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Set the default % account under Finance → Accounting → Chart of accounts', lower(p_key) USING ERRCODE = 'P0001';
  END IF;
  RETURN v_id;
END;
$$;

-- The GL account of a bank account / cash box / Telebirr — made the first
-- time it is needed, numbered after the accounts in the same group
CREATE OR REPLACE FUNCTION gl_bank_account(p_tenant UUID, p_bank UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id      UUID;
  v_name    TEXT;
  v_parent  UUID;
  v_next    BIGINT;
BEGIN
  SELECT id INTO v_id FROM gl_accounts WHERE tenant_id = p_tenant AND bank_account_id = p_bank;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  SELECT name INTO v_name FROM bank_accounts WHERE tenant_id = p_tenant AND id = p_bank;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0001';
  END IF;
  SELECT parent_id INTO v_parent FROM gl_accounts WHERE id = gl_default_account(p_tenant, 'CASH');
  SELECT COALESCE(MAX(code::BIGINT), 1100) + 1 INTO v_next
  FROM gl_accounts
  WHERE tenant_id = p_tenant AND parent_id IS NOT DISTINCT FROM v_parent AND code ~ '^[0-9]{1,15}$';
  WHILE EXISTS (SELECT 1 FROM gl_accounts WHERE tenant_id = p_tenant AND code = v_next::TEXT) LOOP
    v_next := v_next + 1;
  END LOOP;
  INSERT INTO gl_accounts (tenant_id, code, name_en, account_type, sub_type, normal_balance, parent_id, bank_account_id)
  VALUES (p_tenant, v_next::TEXT, v_name, 'ASSET', 'CASH_BANK', 'DEBIT', v_parent, p_bank)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- The account an income / expense category posts to (its rule, else the default)
CREATE OR REPLACE FUNCTION gl_category_account(p_tenant UUID, p_type TEXT, p_category TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT m.account_id INTO v_id
  FROM gl_mappings m JOIN gl_accounts a ON a.tenant_id = m.tenant_id AND a.id = m.account_id
  WHERE m.tenant_id = p_tenant AND m.source = p_type || '_CATEGORY' AND m.key = p_category AND NOT a.is_header;
  RETURN COALESCE(v_id, gl_default_account(p_tenant, p_type));
END;
$$;

-- Writes a posted two-line entry (debit one account, credit another) and returns it
CREATE OR REPLACE FUNCTION gl_post_pair(
  p_tenant UUID, p_date DATE, p_memo TEXT, p_reference TEXT, p_source TEXT,
  p_transaction UUID, p_transfer UUID, p_bank UUID,
  p_debit UUID, p_credit UUID, p_amount NUMERIC, p_unit UUID, p_line_text TEXT, p_by UUID, p_entry_no TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry UUID;
BEGIN
  -- A re-posted record keeps its entry number (NULL: the next one)
  INSERT INTO journal_entries (tenant_id, entry_no, entry_date, memo, reference, source, status, transaction_id, transfer_id, bank_account_id, created_by)
  VALUES (p_tenant, p_entry_no, p_date, left(COALESCE(NULLIF(trim(p_memo), ''), p_source), 500), NULLIF(trim(COALESCE(p_reference, '')), ''),
          p_source, 'DRAFT', p_transaction, p_transfer, p_bank, p_by)
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (tenant_id, entry_id, line_no, account_id, debit, credit, description, organization_unit_id) VALUES
    (p_tenant, v_entry, 1, p_debit, p_amount, 0, NULLIF(p_line_text, ''), p_unit),
    (p_tenant, v_entry, 2, p_credit, 0, p_amount, NULLIF(p_line_text, ''), p_unit);
  UPDATE journal_entries SET status = 'POSTED', posted_by = p_by WHERE tenant_id = p_tenant AND id = v_entry;
  RETURN v_entry;
END;
$$;

-- (Re)posts the entry of one income / expense record
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

-- (Re)posts the entry of one transfer between accounts
CREATE OR REPLACE FUNCTION gl_post_transfer(p_tenant UUID, p_transfer UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  t       RECORD;
  v_from  TEXT;
  v_to    TEXT;
  v_no    TEXT;
BEGIN
  DELETE FROM journal_entries WHERE tenant_id = p_tenant AND transfer_id = p_transfer RETURNING entry_no INTO v_no;
  SELECT * INTO t FROM account_transfers WHERE tenant_id = p_tenant AND id = p_transfer;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM gl_ensure_chart(p_tenant);
  SELECT name INTO v_from FROM bank_accounts WHERE tenant_id = p_tenant AND id = t.from_account_id;
  SELECT name INTO v_to FROM bank_accounts WHERE tenant_id = p_tenant AND id = t.to_account_id;
  PERFORM gl_post_pair(
    p_tenant, t.transfer_date, 'Transfer: ' || v_from || ' → ' || v_to || COALESCE(' — ' || NULLIF(t.notes, ''), ''),
    t.reference, 'TRANSFER', NULL, t.id, NULL,
    gl_bank_account(p_tenant, t.to_account_id), gl_bank_account(p_tenant, t.from_account_id),
    t.amount, NULL, NULL, t.recorded_by, v_no
  );
END;
$$;

-- (Re)posts a bank account's opening balance against opening balance equity
CREATE OR REPLACE FUNCTION gl_post_opening(p_tenant UUID, p_bank UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  b        RECORD;
  v_acc    UUID;
  v_equity UUID;
  v_no     TEXT;
BEGIN
  DELETE FROM journal_entries WHERE tenant_id = p_tenant AND bank_account_id = p_bank RETURNING entry_no INTO v_no;
  SELECT * INTO b FROM bank_accounts WHERE tenant_id = p_tenant AND id = p_bank;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM gl_ensure_chart(p_tenant);
  v_acc := gl_bank_account(p_tenant, p_bank);
  IF b.opening_balance = 0 THEN
    RETURN;
  END IF;
  v_equity := gl_default_account(p_tenant, 'OPENING_BALANCE');
  PERFORM gl_post_pair(
    p_tenant, b.opening_date, 'Opening balance — ' || b.name, NULL, 'OPENING', NULL, NULL, b.id,
    CASE WHEN b.opening_balance > 0 THEN v_acc ELSE v_equity END,
    CASE WHEN b.opening_balance > 0 THEN v_equity ELSE v_acc END,
    abs(b.opening_balance), NULL, NULL, b.created_by, v_no
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Triggers that keep the automatic entries in step
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gl_sync_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Matching to a bank line (statement_line_id) changes nothing in the books
  IF TG_OP = 'UPDATE'
     AND (NEW.txn_type, NEW.category, NEW.amount, NEW.txn_date, NEW.bank_account_id, NEW.organization_unit_id, NEW.description, NEW.receipt_no, NEW.party)
         IS NOT DISTINCT FROM
         (OLD.txn_type, OLD.category, OLD.amount, OLD.txn_date, OLD.bank_account_id, OLD.organization_unit_id, OLD.description, OLD.receipt_no, OLD.party) THEN
    RETURN NEW;
  END IF;
  PERFORM gl_post_transaction(NEW.tenant_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION gl_sync_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.from_account_id, NEW.to_account_id, NEW.amount, NEW.transfer_date, NEW.reference, NEW.notes)
         IS NOT DISTINCT FROM
         (OLD.from_account_id, OLD.to_account_id, OLD.amount, OLD.transfer_date, OLD.reference, OLD.notes) THEN
    RETURN NEW;
  END IF;
  PERFORM gl_post_transfer(NEW.tenant_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION gl_sync_bank_account()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- A renamed bank account renames its GL account, unless that was renamed by hand
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      UPDATE gl_accounts SET name_en = NEW.name
      WHERE tenant_id = NEW.tenant_id AND bank_account_id = NEW.id AND name_en = OLD.name;
    END IF;
    IF (NEW.opening_balance, NEW.opening_date, NEW.name) IS NOT DISTINCT FROM (OLD.opening_balance, OLD.opening_date, OLD.name) THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM gl_post_opening(NEW.tenant_id, NEW.id);
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Re-post the automatic entries from a date on (after the posting rules change)
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

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_gl_account_guard ON gl_accounts;
CREATE TRIGGER trg_gl_account_guard BEFORE INSERT OR UPDATE ON gl_accounts
  FOR EACH ROW EXECUTE FUNCTION gl_account_guard();
DROP TRIGGER IF EXISTS trg_gl_accounts_updated_at ON gl_accounts;
CREATE TRIGGER trg_gl_accounts_updated_at BEFORE UPDATE ON gl_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_gl_mapping_guard ON gl_mappings;
CREATE TRIGGER trg_gl_mapping_guard BEFORE INSERT OR UPDATE ON gl_mappings
  FOR EACH ROW EXECUTE FUNCTION gl_mapping_guard();

DROP TRIGGER IF EXISTS trg_gl_settings_guard ON gl_settings;
CREATE TRIGGER trg_gl_settings_guard BEFORE INSERT OR UPDATE ON gl_settings
  FOR EACH ROW EXECUTE FUNCTION gl_settings_guard();

DROP TRIGGER IF EXISTS trg_gl_entry_guard ON journal_entries;
CREATE TRIGGER trg_gl_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION gl_entry_guard();
DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_number ON journal_entries;
CREATE TRIGGER trg_number BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION tenant_fill_number('entry_no', 'journal_entry', 'JV');

DROP TRIGGER IF EXISTS trg_gl_line_guard ON journal_lines;
CREATE TRIGGER trg_gl_line_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION gl_line_guard();

DROP TRIGGER IF EXISTS trg_gl_sync ON finance_transactions;
CREATE TRIGGER trg_gl_sync AFTER INSERT OR UPDATE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION gl_sync_transaction();
DROP TRIGGER IF EXISTS trg_gl_sync ON account_transfers;
CREATE TRIGGER trg_gl_sync AFTER INSERT OR UPDATE ON account_transfers
  FOR EACH ROW EXECUTE FUNCTION gl_sync_transfer();
DROP TRIGGER IF EXISTS trg_gl_sync ON bank_accounts;
CREATE TRIGGER trg_gl_sync AFTER INSERT OR UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION gl_sync_bank_account();

-- -----------------------------------------------------------------------------
-- Tenant plumbing, as migration 040 does for every tenant table
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gl_accounts', 'gl_settings', 'gl_mappings', 'journal_entries', 'journal_lines'] LOOP
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

-- Lines are rebuilt with their entries (which are audited): no row-by-row audit
DROP TRIGGER IF EXISTS trg_audit_journal_lines ON journal_lines;

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
    'bank_accounts', 'account_transfers', 'bank_statements', 'bank_statement_lines',
    'library_books', 'library_copies', 'library_loans', 'library_requests',
    'gl_accounts', 'gl_settings', 'gl_mappings', 'journal_entries', 'journal_lines'
  ]::TEXT[];
$$;

REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gl_locked(UUID, DATE), gl_raise_locked(UUID), gl_ensure_chart(UUID), gl_default_account(UUID, TEXT),
  gl_bank_account(UUID, UUID), gl_category_account(UUID, TEXT, TEXT),
  gl_post_pair(UUID, DATE, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID, NUMERIC, UUID, TEXT, UUID, TEXT),
  gl_post_transaction(UUID, UUID), gl_post_transfer(UUID, UUID), gl_post_opening(UUID, UUID), gl_repost(DATE, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gl_repost(DATE, UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- Every Sunday school: its chart, and its existing records posted in date order
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants ORDER BY created_at LOOP
    PERFORM gl_ensure_chart(t.id);
    PERFORM gl_repost(NULL, t.id);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
