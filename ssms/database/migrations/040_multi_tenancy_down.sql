-- =============================================================================
-- SSMS — UNDO of migration 040 (multi-tenancy)
-- Only possible while Hamere Hiwot is the only Sunday school with data: it
-- refuses to run otherwise (undo 041 first if it was applied).
-- Back up first: pg_dump "$DATABASE_URL" -Fc -f before_040_down.dump
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_other INT;
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    RAISE EXCEPTION 'Undo migration 041 first (041_billing_and_platform_down.sql)';
  END IF;
  SELECT count(*) INTO v_other FROM tenants
  WHERE id NOT IN ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000');
  IF v_other > 0 THEN
    RAISE EXCEPTION 'Other Sunday schools exist (%) — their data would be mixed in; not undoing', v_other;
  END IF;
END $$;

-- Guards and number triggers off
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY _mt_tenant_tables() LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tenant_guard ON %I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_number ON %I', t);
  END LOOP;
END $$;

-- Remove the template's copy of the structure (and its audit entries)
ALTER TABLE system_audit_logs DISABLE TRIGGER trg_audit_logs_immutable;
DELETE FROM system_audit_logs WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM role_permissions WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM roles WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM governance_body_rules WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM governance_bodies WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM governance_positions WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM organization_relationships WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
UPDATE organization_units SET parent_id = NULL WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM organization_units WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
DELETE FROM system_audit_logs WHERE tenant_id = 'a0000000-0000-4000-8000-000000000000';
ALTER TABLE system_audit_logs ENABLE TRIGGER trg_audit_logs_immutable;

-- Foreign keys back to single columns (same names, same ON DELETE)
CREATE TEMP TABLE _mt_fks ON COMMIT DROP AS
SELECT
  c.conname,
  c.conrelid::regclass::text  AS child,
  c.confrelid::regclass::text AS parent,
  a.attname                   AS col,
  pa.attname                  AS refcol,
  c.confdeltype               AS on_delete
FROM pg_constraint c
JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[2]
JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[2]
JOIN pg_attribute t0 ON t0.attrelid = c.conrelid AND t0.attnum = c.conkey[1] AND t0.attname = 'tenant_id'
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND cardinality(c.conkey) = 2;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM _mt_fks LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.child, r.conname);
  END LOOP;
  FOR r IN SELECT * FROM _mt_fks LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I (%I) ON DELETE %s',
      r.child, r.conname, r.col, r.parent, r.refcol,
      CASE r.on_delete WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END
    );
  END LOOP;
END $$;

-- Extra (tenant_id, …) unique constraints added for those keys
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace AND c.contype = 'u' AND c.conname LIKE '%\_tid\_%\_key'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- Per-tenant uniques / primary keys back to system-wide (same names)
DO $$
DECLARE
  r       RECORD;
  v_cols  TEXT;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, c.conname, c.contype, c.conkey
    FROM pg_constraint c
    JOIN pg_attribute t0 ON t0.attrelid = c.conrelid AND t0.attnum = c.conkey[1] AND t0.attname = 'tenant_id'
    WHERE c.connamespace = 'public'::regnamespace AND c.contype IN ('u', 'p') AND cardinality(c.conkey) >= 2
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO v_cols
    FROM unnest(r.conkey) WITH ORDINALITY k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.tbl::regclass AND a.attnum = k.attnum
    WHERE k.ord > 1;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s (%s)', r.tbl, r.conname,
      CASE r.contype WHEN 'p' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END, v_cols);
  END LOOP;
END $$;

DROP INDEX IF EXISTS uq_academic_years_current;
CREATE UNIQUE INDEX uq_academic_years_current ON academic_years (is_current) WHERE is_current;

-- Numbers: sequences continue from Hamere Hiwot's counters; defaults restored
DO $$
DECLARE
  r RECORD;
  v BIGINT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('students',         'reg_no',     'student_reg',      'student_reg_seq',      'generate_student_reg_no()'),
      ('finance_requests', 'request_no', 'finance_request',  'finance_request_seq',  'generate_finance_request_no()'),
      ('donations',        'receipt_no', 'donation_receipt', 'donation_receipt_seq', 'generate_donation_receipt_no()'),
      ('assets',           'tag',        'asset_tag',        'asset_tag_seq',        'generate_asset_tag()'),
      ('tasks',            'task_no',    'task_no',          'task_no_seq',          'generate_task_no()'),
      (NULL,               NULL,         'dues_receipt',     'dues_receipt_seq',     NULL)
    ) AS x(tbl, col, counter, seq, fn)
  LOOP
    SELECT value INTO v FROM tenant_counters
    WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001' AND name = r.counter;
    IF v IS NOT NULL AND v > 0 THEN
      PERFORM setval(r.seq, v, true);
    END IF;
    IF r.tbl IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', r.tbl, r.col, r.fn);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS next_dues_receipt(INT, UUID);
CREATE OR REPLACE FUNCTION next_dues_receipt(p_year INT)
RETURNS TEXT AS $$
BEGIN
  RETURN 'DUE-' || p_year || '-' || LPAD(nextval('dues_receipt_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Audit functions as in 011
CREATE OR REPLACE FUNCTION audit_actor()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor  UUID;
  v_header TEXT;
BEGIN
  SELECT id INTO v_actor FROM system_users WHERE auth_user_id = auth.uid();
  IF v_actor IS NOT NULL THEN
    RETURN v_actor;
  END IF;
  BEGIN
    v_header := current_setting('request.headers', true)::json ->> 'x-ssms-actor';
  EXCEPTION WHEN others THEN
    v_header := NULL;
  END;
  IF v_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_actor FROM system_users WHERE id = v_header::uuid;
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
      RETURN NULL;
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
  BEGIN
    v_unit := (v_row ->> 'organization_unit_id')::uuid;
  EXCEPTION WHEN others THEN
    v_unit := NULL;
  END;
  IF v_unit IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_units WHERE id = v_unit) THEN
    v_unit := NULL;
  END IF;
  INSERT INTO system_audit_logs (user_id, action, table_name, record_id, old_values, new_values, organization_unit_id)
  VALUES (audit_actor(), v_action, TG_TABLE_NAME,
    COALESCE(v_row ->> 'id', v_row ->> 'key', v_row ->> 'session_id', ''), v_old, v_new, v_unit);
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

DROP VIEW IF EXISTS attendance_session_totals;
CREATE VIEW attendance_session_totals
WITH (security_invoker = true) AS
SELECT
  s.id AS session_id,
  COUNT(*) FILTER (WHERE r.status = 'PRESENT') AS present,
  COUNT(*) FILTER (WHERE r.status = 'ABSENT')  AS absent,
  COUNT(*) FILTER (WHERE r.status = 'LATE')    AS late,
  COUNT(*) FILTER (WHERE r.status = 'EXCUSED') AS excused
FROM attendance_sessions s
LEFT JOIN attendance_records r ON r.session_id = s.id
GROUP BY s.id;

-- tenant_id columns go (their indexes and the tenants FK with them); API grants as before
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY _mt_tenant_tables() LOOP
    IF t NOT IN ('tenant_counters', 'tenant_secrets') THEN
      EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS tenant_id', t);
      EXECUTE format('GRANT ALL ON TABLE %I TO anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
GRANT ALL ON TABLE attendance_session_totals TO anon, authenticated;

DROP TABLE IF EXISTS tenant_counters;
DROP TABLE IF EXISTS tenant_secrets;
DROP FUNCTION IF EXISTS clone_tenant_config(UUID, UUID);
DROP FUNCTION IF EXISTS _mt_clone_table(TEXT, UUID, UUID, TEXT[]);
DROP FUNCTION IF EXISTS _mt_map(UUID, UUID);
DROP FUNCTION IF EXISTS _mt_scope_unique(TEXT, TEXT[]);
DROP FUNCTION IF EXISTS tenant_fill_number();
DROP FUNCTION IF EXISTS next_tenant_number(UUID, TEXT);
DROP FUNCTION IF EXISTS tenant_guard();
DROP FUNCTION IF EXISTS _mt_tenant_tables();
DROP TABLE IF EXISTS tenants;
DROP FUNCTION IF EXISTS request_tenant_id();
DROP TYPE IF EXISTS tenant_status;

COMMIT;

NOTIFY pgrst, 'reload schema';
