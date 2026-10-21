-- =============================================================================
-- SSMS — tenant isolation test (migrations 040 + 041)
-- Run against a COPY of the database (or a fresh one with 001–041 applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/tenant_isolation_test.sql
-- Everything runs in one transaction that is rolled back at the end, so it
-- leaves nothing behind. Each check prints PASS; the first failure stops the
-- run with FAIL and what went wrong.
-- =============================================================================

BEGIN;

-- Two test Sunday schools from the template, on the FREE plan
INSERT INTO tenants (id, slug, name_en, reg_prefix, status) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'iso-test-one', 'Isolation test one', 'ISOA', 'ACTIVE'),
  ('e2000000-0000-4000-8000-000000000002', 'iso-test-two', 'Isolation test two', 'ISOB', 'ACTIVE');
SELECT clone_tenant_config('a0000000-0000-4000-8000-000000000000', 'e1000000-0000-4000-8000-000000000001');
SELECT clone_tenant_config('a0000000-0000-4000-8000-000000000000', 'e2000000-0000-4000-8000-000000000002');
INSERT INTO subscriptions (tenant_id, plan_id, status)
SELECT t, p.id, 'ACTIVE' FROM plans p, unnest(ARRAY['e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002']::uuid[]) t
WHERE p.code = 'FREE';

-- Acting as tenant one (what the server's scoped client sends)
SELECT set_config('request.headers', '{"x-ssms-tenant":"e1000000-0000-4000-8000-000000000001"}', true);
INSERT INTO persons (id, membership_code, full_name_en, gender) VALUES ('e1000000-0000-4000-8000-0000000000a1', 'ISO-1', 'Person of one', 'MALE');
INSERT INTO students (person_id) VALUES ('e1000000-0000-4000-8000-0000000000a1');

DO $$
DECLARE
  v TEXT;
BEGIN
  -- tenant_id comes from the request
  IF (SELECT tenant_id FROM persons WHERE id = 'e1000000-0000-4000-8000-0000000000a1') <> 'e1000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL: tenant_id was not taken from the request';
  END IF;
  RAISE NOTICE 'PASS: rows get the requesting tenant';

  SELECT reg_no INTO v FROM students WHERE person_id = 'e1000000-0000-4000-8000-0000000000a1';
  IF v NOT LIKE 'ISOA-%' THEN RAISE EXCEPTION 'FAIL: registration number % lacks the tenant prefix', v; END IF;
  RAISE NOTICE 'PASS: student numbers use the tenant prefix (%)', v;
END $$;

-- Switch to tenant two and try to touch tenant one
SELECT set_config('request.headers', '{"x-ssms-tenant":"e2000000-0000-4000-8000-000000000002"}', true);

DO $$
BEGIN
  BEGIN
    UPDATE persons SET full_name_en = 'changed' WHERE id = 'e1000000-0000-4000-8000-0000000000a1';
    RAISE EXCEPTION 'FAIL: tenant two changed tenant one''s person';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cross-tenant update refused';
  END;

  BEGIN
    DELETE FROM persons WHERE id = 'e1000000-0000-4000-8000-0000000000a1';
    RAISE EXCEPTION 'FAIL: tenant two deleted tenant one''s person';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cross-tenant delete refused';
  END;

  BEGIN
    INSERT INTO persons (tenant_id, membership_code, full_name_en, gender) VALUES ('e1000000-0000-4000-8000-000000000001', 'X', 'x', 'MALE');
    RAISE EXCEPTION 'FAIL: tenant two inserted into tenant one';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cross-tenant insert refused';
  END;

  BEGIN
    -- A row of tenant two pointing at tenant one's person
    INSERT INTO system_users (auth_user_id, person_id, username) VALUES (gen_random_uuid(), 'e1000000-0000-4000-8000-0000000000a1', 'iso-x');
    RAISE EXCEPTION 'FAIL: a reference to another tenant''s row was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: cross-tenant reference refused';
  END;
END $$;

-- Same codes in two tenants are fine; tenant_id never changes
INSERT INTO persons (id, membership_code, full_name_en, gender) VALUES ('e2000000-0000-4000-8000-0000000000b1', 'ISO-1', 'Person of two', 'FEMALE');

DO $$
BEGIN
  BEGIN
    UPDATE persons SET tenant_id = 'e1000000-0000-4000-8000-000000000001' WHERE id = 'e2000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'FAIL: tenant_id was changed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: tenant_id cannot be changed';
  END;
  RAISE NOTICE 'PASS: the same membership code is allowed in two tenants';
END $$;

-- Plan limits are enforced by the database
UPDATE subscriptions SET limit_overrides = '{"people": 1}' WHERE tenant_id = 'e2000000-0000-4000-8000-000000000002';
DO $$
BEGIN
  BEGIN
    INSERT INTO persons (membership_code, full_name_en, gender) VALUES ('ISO-2', 'Over the limit', 'MALE');
    RAISE EXCEPTION 'FAIL: a record over the plan limit was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'QUOTA_EXCEEDED:people:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: plan limit enforced (%)', SQLERRM;
  END;
END $$;

-- Without a tenant, nothing can be written to a tenant table
SELECT set_config('request.headers', '', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO persons (membership_code, full_name_en, gender) VALUES ('ISO-3', 'No tenant', 'MALE');
    RAISE EXCEPTION 'FAIL: a row without a tenant was accepted';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS: rows without a tenant refused';
  END;
END $$;

-- The public API keys cannot read tenant data at all
DO $$
BEGIN
  IF has_table_privilege('anon', 'persons', 'SELECT') OR has_table_privilege('authenticated', 'persons', 'SELECT')
     OR has_table_privilege('anon', 'subscriptions', 'SELECT') OR has_table_privilege('authenticated', 'tenant_secrets', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: anon / authenticated can read tenant or billing tables';
  END IF;
  IF has_function_privilege('anon', 'clone_tenant_config(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can call clone_tenant_config';
  END IF;
  RAISE NOTICE 'PASS: public API keys have no access';
END $$;

-- Every table in public (except the global ones) has tenant_id and the guard
DO $$
DECLARE
  v TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    AND c.relname NOT IN ('permissions', 'tenants', 'platform_admins', 'platform_settings', 'platform_modules', 'plans',
                          'subscriptions', 'subscription_events', 'invoices', 'payments', 'payment_webhook_events',
                          'usage_snapshots', 'platform_audit_logs', 'rate_limits')
    AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'trg_tenant_guard');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL: tables without the tenant guard: %', v; END IF;
  RAISE NOTICE 'PASS: every tenant table is guarded';
END $$;

ROLLBACK;
