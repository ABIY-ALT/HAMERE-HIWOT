-- =============================================================================
-- SSMS — Migration 040: Multi-tenancy (one tenant = one Sunday school)
-- Depends on: 001–039 (all of them — checked below)
-- Apply via: Supabase Dashboard → SQL Editor, AFTER a backup:
--   pg_dump "$DATABASE_URL" -Fc -f before_040.dump
-- Runs in one transaction: it either applies completely or not at all.
-- Requires PostgreSQL 15+ (ON DELETE SET NULL (column) — checked below).
-- Undo: 040_multi_tenancy_down.sql (only while one Sunday school has data).
-- =============================================================================
-- What it does
-- • tenants: every Sunday school using the system. The existing data all
--   belongs to Hamere Hiwot (this deployment has only ever served it), so it
--   becomes the default tenant (fixed id …0001), served at the site root.
-- • tenant_id on every table except the global permission catalogue, filled
--   for existing rows without rewriting them (constant column default).
-- • Codes that were unique system-wide (unit codes, role codes, usernames,
--   receipt numbers…) become unique per tenant. Student registration numbers
--   stay unique system-wide: they are student login names (tenants get their
--   own prefix, tenants.reg_prefix; Hamere Hiwot keeps REG).
-- • Every foreign key between tenant tables now also matches tenant_id, so a
--   row can never point at another tenant's row. Constraint names are kept
--   (the app's embed hints use them).
-- • Numbers (FR-, DON-, AST-, TSK-, DUE-, student REG-) count per tenant,
--   continuing Hamere Hiwot's current sequences.
-- • The server tells the database which tenant a request is for in the
--   x-ssms-tenant header (lib/tenant/db.ts). With it set:
--     – tenant_id defaults to it on insert;
--     – a trigger refuses any insert / update / delete of another tenant's
--       row, and tenant_id can never be changed.
-- • The public API keys (anon / authenticated) lose all access to these
--   tables: only the server reads and writes them.
-- • A hidden template tenant holds the default structure (units, governance
--   bodies, positions, roles and their permissions) copied to each new
--   Sunday school by clone_tenant_config().
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Pre-flight checks — nothing is changed unless they pass
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15 or newer is required (found %)', current_setting('server_version');
  END IF;
  -- Every table this migration changes, with the migration that creates it:
  -- one message lists all that are missing, so they can be applied in one go
  SELECT string_agg(format('%s (%s)', t, m), ', ' ORDER BY m, t) INTO v_missing
  FROM (VALUES
    ('organization_units','002'), ('organization_relationships','002'), ('persons','002'),
    ('system_users','002'), ('governance_bodies','002'), ('governance_body_rules','002'),
    ('governance_positions','002'), ('governance_memberships','002'), ('roles','002'),
    ('role_permissions','002'), ('user_unit_assignments','002'), ('system_audit_logs','002'),
    ('academic_years','005'), ('classes','005'), ('subjects','005'),
    ('students','005'), ('student_guardians','005'), ('enrollments','005'),
    ('attendance_sessions','005'), ('attendance_records','005'), ('grades','005'),
    ('system_settings','006'), ('finance_requests','008'), ('finance_transactions','008'),
    ('budget_allocations','009'), ('donations','012'), ('programs','013'),
    ('assets','014'), ('asset_movements','014'), ('asset_maintenance','014'),
    ('choir_members','015'), ('hymns','015'), ('choir_sessions','015'),
    ('choir_session_hymns','015'), ('choir_attendance','015'), ('service_assignments','016'),
    ('servant_attendance','016'), ('discipline_cases','016'), ('push_subscriptions','017'),
    ('tasks','019'), ('task_updates','019'), ('task_series','020'),
    ('task_files','020'), ('exams','022'), ('exam_questions','022'),
    ('exam_attempts','022'), ('telegram_links','024'), ('telegram_link_codes','024'),
    ('telegram_broadcasts','024'), ('telegram_sessions','028'), ('telegram_chats','030'),
    ('dues_rates','026'), ('member_dues','026'), ('dues_claims','028'),
    ('unit_plans','032'), ('plan_activities','032'), ('plan_updates','032'),
    ('member_questions','033'), ('checkin_events','036'), ('checkins','036'),
    ('service_roster','037'), ('vestments','037'), ('vestment_loans','037'),
    ('automation_log','038'), ('site_posts','039'), ('site_albums','039'),
    ('site_photos','039')
  ) AS need(t, m)
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Apply these migrations first, then run 040 again — missing tables (migration): %', v_missing;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- TENANTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_status') THEN
    CREATE TYPE tenant_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'TEMPLATE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT NOT NULL UNIQUE
                           CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  name_en                  TEXT NOT NULL,
  name_am                  TEXT,
  status                   tenant_status NOT NULL DEFAULT 'ACTIVE',
  status_reason            TEXT,
  -- Prefix of student registration numbers (= student login names)
  reg_prefix               TEXT NOT NULL UNIQUE CHECK (reg_prefix ~ '^[A-Z]{2,6}$'),
  contact_name             TEXT,
  contact_phone            TEXT,
  contact_email            TEXT,
  city                     TEXT,
  country                  TEXT NOT NULL DEFAULT 'ET',
  -- Served at the site root (/) instead of /s/<slug>
  is_default               BOOLEAN NOT NULL DEFAULT FALSE,
  created_via              TEXT NOT NULL DEFAULT 'PLATFORM'
                           CHECK (created_via IN ('MIGRATION', 'SELF_SIGNUP', 'PLATFORM')),
  onboarding_completed_at  TIMESTAMPTZ,
  activated_at             TIMESTAMPTZ,
  suspended_at             TIMESTAMPTZ,
  deactivated_at           TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_default ON tenants (is_default) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Hamere Hiwot: owner of every existing row
INSERT INTO tenants (id, slug, name_en, name_am, status, reg_prefix, is_default, created_via, activated_at, onboarding_completed_at)
SELECT
  'a0000000-0000-4000-8000-000000000001',
  'hamere-hiwot',
  COALESCE(NULLIF(s.value ->> 'parish_name_en', ''), 'Hamere Hiwot Sabbath School'),
  NULLIF(s.value ->> 'parish_name_am', ''),
  'ACTIVE', 'REG', TRUE, 'MIGRATION', NOW(), NOW()
FROM (SELECT 1) one
LEFT JOIN system_settings s ON s.key = 'parish_profile'
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- The tenant a request is for (header set by the server's scoped client)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_tenant_id()
RETURNS UUID
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  BEGIN
    v := current_setting('request.headers', true)::json ->> 'x-ssms-tenant';
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v::uuid;
  END IF;
  RETURN NULL;
END;
$$;

-- Refuses writes to another tenant's rows, and any change of tenant_id
CREATE OR REPLACE FUNCTION tenant_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID := request_tenant_id();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id cannot be changed (%)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF v_tenant IS NOT NULL THEN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'Cross-tenant change blocked (%)', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'Cross-tenant change blocked (%)', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- tenant_id on every tenant-owned table
-- -----------------------------------------------------------------------------
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
    'tenant_counters', 'tenant_secrets'
  ]::TEXT[];
$$;

-- Per-tenant number counters (replace the system-wide sequences)
CREATE TABLE IF NOT EXISTS tenant_counters (
  tenant_id  UUID NOT NULL,
  name       TEXT NOT NULL,
  value      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, name)
);

-- Per-tenant secrets (e.g. the Telegram bot token), encrypted by the app
-- (lib/tenant/secrets.ts, key TENANT_SECRETS_KEY) — never readable as plain text here
CREATE TABLE IF NOT EXISTS tenant_secrets (
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  value_enc   TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, name)
);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY _mt_tenant_tables() LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      -- Constant default: existing rows get Hamere Hiwot without a rewrite and without firing triggers
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN tenant_id UUID NOT NULL DEFAULT %L',
        t, 'a0000000-0000-4000-8000-000000000001'
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conrelid = t::regclass AND conname = t || '_tenant_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
        t, t || '_tenant_fkey'
      );
    END IF;
    -- From now on: the requesting tenant, or nothing (NOT NULL then refuses the row)
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT request_tenant_id()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', left('idx_' || t || '_tenant', 63), t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tenant_guard ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION tenant_guard()',
      t
    );
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Changes to the global permission catalogue are platform-level: no tenant
ALTER TABLE system_audit_logs ALTER COLUMN tenant_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON system_audit_logs (tenant_id, created_at DESC);

REVOKE ALL ON TABLE tenants FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Unique per tenant instead of system-wide
-- -----------------------------------------------------------------------------
-- Replaces the unique constraint / primary key on exactly p_cols with one on
-- (tenant_id, p_cols…), keeping its name and kind.
CREATE OR REPLACE FUNCTION _mt_scope_unique(p_table TEXT, p_cols TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_attnums SMALLINT[];
  v_con     RECORD;
BEGIN
  SELECT array_agg(a.attnum ORDER BY a.attnum) INTO v_attnums
  FROM pg_attribute a
  WHERE a.attrelid = p_table::regclass AND a.attname = ANY (p_cols);

  FOR v_con IN
    SELECT c.conname, c.contype
    FROM pg_constraint c
    WHERE c.conrelid = p_table::regclass
      AND c.contype IN ('u', 'p')
      AND (SELECT array_agg(k ORDER BY k) FROM unnest(c.conkey) k) = v_attnums
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table, v_con.conname);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I %s (tenant_id, %s)',
      p_table, v_con.conname,
      CASE v_con.contype WHEN 'p' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END,
      (SELECT string_agg(quote_ident(c), ', ') FROM unnest(p_cols) c)
    );
  END LOOP;
END;
$$;

SELECT _mt_scope_unique('organization_units', ARRAY['code']);
SELECT _mt_scope_unique('organization_units', ARRAY['ltree_path']);
SELECT _mt_scope_unique('persons', ARRAY['membership_code']);
SELECT _mt_scope_unique('system_users', ARRAY['auth_user_id']);   -- one login, one account per tenant
SELECT _mt_scope_unique('system_users', ARRAY['username']);
SELECT _mt_scope_unique('governance_positions', ARRAY['code']);
SELECT _mt_scope_unique('roles', ARRAY['code']);
SELECT _mt_scope_unique('academic_years', ARRAY['name']);
SELECT _mt_scope_unique('subjects', ARRAY['code']);
SELECT _mt_scope_unique('finance_requests', ARRAY['request_no']);
SELECT _mt_scope_unique('donations', ARRAY['receipt_no']);
SELECT _mt_scope_unique('assets', ARRAY['tag']);
SELECT _mt_scope_unique('tasks', ARRAY['task_no']);
SELECT _mt_scope_unique('vestments', ARRAY['code']);
SELECT _mt_scope_unique('push_subscriptions', ARRAY['endpoint']);
SELECT _mt_scope_unique('system_settings', ARRAY['key']);
SELECT _mt_scope_unique('dues_rates', ARRAY['year']);
SELECT _mt_scope_unique('telegram_sessions', ARRAY['chat_id']);   -- one bot per tenant: the same
SELECT _mt_scope_unique('telegram_chats', ARRAY['chat_id']);      -- Telegram user talks to each
SELECT _mt_scope_unique('automation_log', ARRAY['job', 'ref']);

DROP INDEX IF EXISTS uq_academic_years_current;
CREATE UNIQUE INDEX uq_academic_years_current ON academic_years (tenant_id) WHERE is_current;

-- -----------------------------------------------------------------------------
-- Foreign keys between tenant tables also match tenant_id
-- -----------------------------------------------------------------------------
-- Each single-column FK child(col) → parent(refcol) is replaced, under the
-- same name and with the same ON DELETE action, by
--   (tenant_id, col) → parent(tenant_id, refcol).
-- The parent gets UNIQUE (tenant_id, refcol). A child column that is unique on
-- its own (one-to-one, e.g. students.person_id) also gets UNIQUE (tenant_id,
-- col), so the API keeps returning a single embedded row, not a list.
CREATE TEMP TABLE _mt_fks ON COMMIT DROP AS
SELECT
  c.conname,
  c.conrelid::regclass::text  AS child,
  c.confrelid::regclass::text AS parent,
  a.attname                   AS col,
  pa.attname                  AS refcol,
  c.confdeltype               AS on_delete,
  c.confupdtype               AS on_update,
  EXISTS (
    SELECT 1 FROM pg_constraint u
    WHERE u.conrelid = c.conrelid AND u.contype IN ('u', 'p') AND u.conkey = ARRAY[a.attnum]
  )                           AS col_unique
FROM pg_constraint c
JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[1]
JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND cardinality(c.conkey) = 1
  AND c.conrelid::regclass::text = ANY (_mt_tenant_tables())
  AND c.confrelid::regclass::text = ANY (_mt_tenant_tables());

DO $$
DECLARE
  r       RECORD;
  v_name  TEXT;
  v_del   TEXT;
  v_upd   TEXT;
BEGIN
  FOR r IN SELECT * FROM _mt_fks LOOP
    v_name := left(r.parent || '_tid_' || r.refcol || '_key', 63);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = r.parent::regclass AND conname = v_name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (tenant_id, %I)', r.parent, v_name, r.refcol);
    END IF;

    IF r.col_unique THEN
      v_name := left(r.child || '_tid_' || r.col || '_key', 63);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = r.child::regclass AND conname = v_name) THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (tenant_id, %I)', r.child, v_name, r.col);
      END IF;
    END IF;

    v_del := CASE r.on_delete
      WHEN 'c' THEN 'CASCADE'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'n' THEN format('SET NULL (%I)', r.col)
      WHEN 'd' THEN format('SET DEFAULT (%I)', r.col)
      ELSE 'NO ACTION'
    END;
    v_upd := CASE r.on_update WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END;

    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.child, r.conname);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %I) REFERENCES %I (tenant_id, %I) ON DELETE %s ON UPDATE %s',
      r.child, r.conname, r.col, r.parent, r.refcol, v_del, v_upd
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Numbers per tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_tenant_number(p_tenant UUID, p_name TEXT)
RETURNS BIGINT
LANGUAGE sql
AS $$
  INSERT INTO tenant_counters (tenant_id, name, value) VALUES (p_tenant, p_name, 1)
  ON CONFLICT (tenant_id, name) DO UPDATE SET value = tenant_counters.value + 1
  RETURNING value;
$$;

-- BEFORE INSERT: fills TG_ARGV[0] with "<prefix>-<year>-<0001>" when it is empty.
-- Prefix TG_ARGV[2]; '@reg' means the tenant's student prefix.
CREATE OR REPLACE FUNCTION tenant_fill_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_col     TEXT := TG_ARGV[0];
  v_counter TEXT := TG_ARGV[1];
  v_prefix  TEXT := TG_ARGV[2];
BEGIN
  IF to_jsonb(NEW) ->> v_col IS NULL THEN
    IF v_prefix = '@reg' THEN
      SELECT reg_prefix INTO v_prefix FROM tenants WHERE id = NEW.tenant_id;
    END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      v_col,
      v_prefix || '-' || TO_CHAR(NOW(), 'YYYY') || '-'
        || LPAD(next_tenant_number(NEW.tenant_id, v_counter)::TEXT, 4, '0')
    ));
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r       RECORD;
  v_last  BIGINT;
  v_called BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('students',         'reg_no',     'student_reg',      '@reg', 'student_reg_seq'),
      ('finance_requests', 'request_no', 'finance_request',  'FR',   'finance_request_seq'),
      ('donations',        'receipt_no', 'donation_receipt', 'DON',  'donation_receipt_seq'),
      ('assets',           'tag',        'asset_tag',        'AST',  'asset_tag_seq'),
      ('tasks',            'task_no',    'task_no',          'TSK',  'task_no_seq')
    ) AS v(tbl, col, counter, prefix, seq)
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', r.tbl, r.col);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_number ON %I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_number BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION tenant_fill_number(%L, %L, %L)',
      r.tbl, r.col, r.counter, r.prefix
    );
    -- Hamere Hiwot continues where the old sequence stopped
    IF to_regclass('public.' || r.seq) IS NOT NULL THEN
      EXECUTE format('SELECT last_value, is_called FROM %I', r.seq) INTO v_last, v_called;
      INSERT INTO tenant_counters (tenant_id, name, value)
      VALUES ('a0000000-0000-4000-8000-000000000001', r.counter, CASE WHEN v_called THEN v_last ELSE v_last - 1 END)
      ON CONFLICT (tenant_id, name) DO NOTHING;
    END IF;
  END LOOP;

  IF to_regclass('public.dues_receipt_seq') IS NOT NULL THEN
    SELECT last_value, is_called INTO v_last, v_called FROM dues_receipt_seq;
    INSERT INTO tenant_counters (tenant_id, name, value)
    VALUES ('a0000000-0000-4000-8000-000000000001', 'dues_receipt', CASE WHEN v_called THEN v_last ELSE v_last - 1 END)
    ON CONFLICT (tenant_id, name) DO NOTHING;
  END IF;
END $$;

-- Dues receipts: DUE-2019-0001 … per tenant (the requesting one unless given)
DROP FUNCTION IF EXISTS next_dues_receipt(INT);
CREATE OR REPLACE FUNCTION next_dues_receipt(p_year INT, p_tenant UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID := COALESCE(p_tenant, request_tenant_id());
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'next_dues_receipt: no tenant';
  END IF;
  RETURN 'DUE-' || p_year || '-' || LPAD(next_tenant_number(v_tenant, 'dues_receipt')::TEXT, 4, '0');
END;
$$;

-- -----------------------------------------------------------------------------
-- Audit trail records the tenant; the acting user is looked up in that tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_actor()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor  UUID;
  v_header TEXT;
  v_tenant UUID := request_tenant_id();
BEGIN
  SELECT id INTO v_actor FROM system_users
  WHERE auth_user_id = auth.uid() AND (v_tenant IS NULL OR tenant_id = v_tenant)
  LIMIT 1;
  IF v_actor IS NOT NULL THEN
    RETURN v_actor;
  END IF;

  BEGIN
    v_header := current_setting('request.headers', true)::json ->> 'x-ssms-actor';
  EXCEPTION WHEN others THEN
    v_header := NULL;
  END;

  IF v_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_actor FROM system_users
    WHERE id = v_header::uuid AND (v_tenant IS NULL OR tenant_id = v_tenant);
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ignore  TEXT[] := ARRAY['created_at', 'updated_at', 'last_login_at'];
  v_old     JSONB;
  v_new     JSONB;
  v_row     JSONB;
  v_action  audit_action;
  v_key     TEXT;
  v_diff_old JSONB := '{}'::jsonb;
  v_diff_new JSONB := '{}'::jsonb;
  v_unit    UUID;
  v_tenant  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW); v_row := v_new; v_action := 'INSERT';
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_row := v_old; v_action := 'DELETE';
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_row := v_new;
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF NOT (v_key = ANY (v_ignore)) AND (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
        v_diff_old := v_diff_old || jsonb_build_object(v_key, v_old -> v_key);
        v_diff_new := v_diff_new || jsonb_build_object(v_key, v_new -> v_key);
      END IF;
    END LOOP;
    IF v_diff_new = '{}'::jsonb THEN
      RETURN NULL; -- nothing meaningful changed (e.g. only last_login_at)
    END IF;
    v_old := v_diff_old;
    v_new := v_diff_new;
    v_action := 'UPDATE';
    IF TG_TABLE_NAME IN ('finance_requests', 'grades') AND v_new ? 'status' THEN
      IF v_new ->> 'status' = 'APPROVED' THEN
        v_action := 'APPROVE';
      ELSIF v_new ->> 'status' IN ('REJECTED', 'RETURNED') THEN
        v_action := 'REJECT';
      END IF;
    END IF;
  END IF;

  v_tenant := COALESCE((v_row ->> 'tenant_id')::uuid, request_tenant_id());

  BEGIN
    v_unit := (v_row ->> 'organization_unit_id')::uuid;
  EXCEPTION WHEN others THEN
    v_unit := NULL;
  END;
  IF v_unit IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_units WHERE id = v_unit AND tenant_id IS NOT DISTINCT FROM v_tenant
  ) THEN
    v_unit := NULL;
  END IF;

  INSERT INTO system_audit_logs (tenant_id, user_id, action, table_name, record_id, old_values, new_values, organization_unit_id)
  VALUES (
    v_tenant,
    audit_actor(),
    v_action,
    TG_TABLE_NAME,
    COALESCE(v_row ->> 'id', v_row ->> 'key', v_row ->> 'session_id', ''),
    v_old,
    v_new,
    v_unit
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION forbid_audit_log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.action = OLD.action
     AND NEW.table_name = OLD.table_name
     AND NEW.record_id = OLD.record_id
     AND NEW.old_values IS NOT DISTINCT FROM OLD.old_values
     AND NEW.new_values IS NOT DISTINCT FROM OLD.new_values
     AND NEW.created_at = OLD.created_at
     AND (NEW.user_id IS NULL OR NEW.user_id = OLD.user_id)
     AND (NEW.organization_unit_id IS NULL OR NEW.organization_unit_id = OLD.organization_unit_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Audit log entries cannot be changed or deleted';
END;
$$;

-- -----------------------------------------------------------------------------
-- View carries the tenant, so scoped reads can filter it
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW attendance_session_totals
WITH (security_invoker = true) AS
SELECT
  s.id AS session_id,
  COUNT(*) FILTER (WHERE r.status = 'PRESENT') AS present,
  COUNT(*) FILTER (WHERE r.status = 'ABSENT')  AS absent,
  COUNT(*) FILTER (WHERE r.status = 'LATE')    AS late,
  COUNT(*) FILTER (WHERE r.status = 'EXCUSED') AS excused,
  s.tenant_id
FROM attendance_sessions s
LEFT JOIN attendance_records r ON r.session_id = s.id
GROUP BY s.id;

REVOKE ALL ON TABLE attendance_session_totals FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Default structure for new Sunday schools
-- -----------------------------------------------------------------------------
-- Deterministic new id for a copied row: the same source row copied into the
-- same tenant always gets the same id, so references can be rewritten
-- without a lookup table.
CREATE OR REPLACE FUNCTION _mt_map(p_tenant UUID, p_old UUID)
RETURNS UUID
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT md5(p_tenant::text || ':' || p_old::text)::uuid;
$$;

-- Copies one table's rows from p_src to p_dst. Ids and references to tables
-- in p_cloned are remapped; references to other tenant tables (created_by…)
-- are cleared; references to global tables are kept.
CREATE OR REPLACE FUNCTION _mt_clone_table(p_table TEXT, p_src UUID, p_dst UUID, p_cloned TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_cols   TEXT[] := '{}';
  v_exprs  TEXT[] := '{}';
  v_att    RECORD;
  v_parent TEXT;
BEGIN
  FOR v_att IN
    SELECT a.attname, a.attnum, format_type(a.atttypid, a.atttypmod) AS typ
    FROM pg_attribute a
    WHERE a.attrelid = p_table::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    ORDER BY a.attnum
  LOOP
    v_cols := array_append(v_cols, quote_ident(v_att.attname));
    IF v_att.attname = 'tenant_id' THEN
      v_exprs := array_append(v_exprs, quote_literal(p_dst) || '::uuid');
      CONTINUE;
    END IF;
    IF v_att.attname = 'id' AND v_att.typ = 'uuid' THEN
      v_exprs := array_append(v_exprs, format('_mt_map(%L, id)', p_dst));
      CONTINUE;
    END IF;
    SELECT c.confrelid::regclass::text INTO v_parent
    FROM pg_constraint c
    WHERE c.conrelid = p_table::regclass AND c.contype = 'f'
      AND v_att.attnum = ANY (c.conkey) AND c.confrelid <> 'tenants'::regclass
    LIMIT 1;
    IF v_parent IS NULL THEN
      v_exprs := array_append(v_exprs, quote_ident(v_att.attname));
    ELSIF v_parent = ANY (p_cloned) THEN
      v_exprs := array_append(v_exprs, format('_mt_map(%L, %I)', p_dst, v_att.attname));
    ELSIF v_parent = ANY (_mt_tenant_tables()) THEN
      v_exprs := array_append(v_exprs, 'NULL');
    ELSE
      v_exprs := array_append(v_exprs, quote_ident(v_att.attname));
    END IF;
  END LOOP;

  EXECUTE format(
    'INSERT INTO %I (%s) SELECT %s FROM %I WHERE tenant_id = %L ON CONFLICT DO NOTHING',
    p_table, array_to_string(v_cols, ', '), array_to_string(v_exprs, ', '), p_table, p_src
  );
END;
$$;

-- Copies the organization structure, governance bodies and rules, positions,
-- roles and role permissions from one tenant to another.
CREATE OR REPLACE FUNCTION clone_tenant_config(p_src UUID, p_dst UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'organization_units', 'organization_relationships', 'governance_bodies', 'governance_body_rules',
    'governance_positions', 'roles', 'role_permissions'
  ];
  t TEXT;
BEGIN
  IF p_src = p_dst THEN
    RAISE EXCEPTION 'clone_tenant_config: source and destination are the same';
  END IF;
  FOREACH t IN ARRAY v_tables LOOP
    PERFORM _mt_clone_table(t, p_src, p_dst, v_tables);
  END LOOP;
END;
$$;

-- The template: a snapshot of Hamere Hiwot's structure (no people, no records)
INSERT INTO tenants (id, slug, name_en, status, reg_prefix, created_via)
VALUES ('a0000000-0000-4000-8000-000000000000', 'template-defaults', 'Default structure (template)', 'TEMPLATE', 'TPL', 'MIGRATION')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000') THEN
    PERFORM clone_tenant_config('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Only the server may call these
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION request_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION next_tenant_number(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION next_dues_receipt(INT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _mt_map(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _mt_clone_table(TEXT, UUID, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _mt_scope_unique(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION clone_tenant_config(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The server's key (service_role) keeps what it needs
GRANT EXECUTE ON FUNCTION next_dues_receipt(INT, UUID), clone_tenant_config(UUID, UUID), request_tenant_id(),
  next_tenant_number(UUID, TEXT) TO service_role;
GRANT ALL ON TABLE tenants, tenant_counters, tenant_secrets TO service_role;
GRANT SELECT ON TABLE attendance_session_totals TO service_role;

-- -----------------------------------------------------------------------------
-- Final check: every table in public except the global ones has tenant_id
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_missing
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
    AND c.relname NOT IN ('permissions', 'tenants')
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tables without tenant_id: % — add them to _mt_tenant_tables()', v_missing;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
