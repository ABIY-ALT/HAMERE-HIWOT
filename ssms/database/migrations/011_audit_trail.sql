-- =============================================================================
-- SSMS — Migration 011: Automatic audit trail
-- Depends on: 002 (system_audit_logs, system_users), 005, 006, 008, 009
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- Every insert, update and delete on the important tables is written to
-- system_audit_logs by a trigger — the application cannot forget to log, and
-- changes made directly in the database are logged too.
--
-- WHO made the change:
--   • a signed-in user calling the API directly → their system_users row
--     (via auth.uid());
--   • the app's server (service role) → the x-ssms-actor request header the
--     server sets to the signed-in user's system_users id;
--   • otherwise (e.g. the SQL editor) → NULL, shown as "System / database".
--
-- WHAT changed: INSERT/DELETE keep the whole row; UPDATE keeps only the fields
-- that changed (old → new). Approving / rejecting finance requests and grades
-- is logged as APPROVE / REJECT.
--
-- Log entries cannot be edited or deleted (trigger below).
-- =============================================================================

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

  BEGIN
    v_unit := (v_row ->> 'organization_unit_id')::uuid;
  EXCEPTION WHEN others THEN
    v_unit := NULL;
  END;
  IF v_unit IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_units WHERE id = v_unit) THEN
    v_unit := NULL;
  END IF;

  INSERT INTO system_audit_logs (user_id, action, table_name, record_id, old_values, new_values, organization_unit_id)
  VALUES (
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

-- Attach to every table whose changes matter (skipped if the table doesn't exist)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'persons', 'system_users', 'user_unit_assignments', 'roles', 'role_permissions', 'permissions',
    'organization_units', 'governance_bodies', 'governance_body_rules', 'governance_memberships',
    'academic_years', 'classes', 'subjects', 'students', 'enrollments', 'grades', 'attendance_sessions',
    'finance_requests', 'finance_transactions', 'budget_allocations', 'system_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Log entries are permanent. The only allowed change is a foreign key
-- clearing user_id / organization_unit_id when that user or unit is deleted.
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

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON system_audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON system_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_change();
