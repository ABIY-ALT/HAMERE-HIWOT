-- =============================================================================
-- SSMS — Migration 041: Subscriptions, billing and the platform owner
-- Depends on: 040_multi_tenancy.sql
-- Apply via: Supabase Dashboard → SQL Editor (after a backup). One transaction.
-- Undo: 041_billing_and_platform_down.sql
-- =============================================================================
-- • platform_admins: the SaaS owner's accounts (/platform). Separate from every
--   tenant role — no Sunday school role can grant platform access.
-- • platform_modules: feature modules a plan can include (core features are
--   always on). The app maps permissions to modules (lib/billing/modules.ts),
--   so a module missing from the plan removes its permissions everywhere.
-- • plans: prices, trial length, included modules and limits — all edited on
--   /platform/plans, nothing hard-coded. Missing limit = unlimited.
-- • subscriptions: each tenant's current plan and state; subscription_events
--   is its permanent history.
-- • invoices, payments: manual payment for now (bank transfer / mobile money
--   with a reference and receipt, confirmed by a platform admin). Provider
--   payments (Chapa, Telebirr) later use payments.provider/provider_ref and
--   payment_webhook_events (unique per provider event → duplicates ignored).
-- • Limits are enforced by the database on insert (persons, students,
--   system_users), so no page or API call can go around them.
-- • rate_limits + hit_rate_limit(): login / sign-up / sensitive-action throttle.
-- • platform_audit_logs: everything platform admins and billing do; permanent.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'Apply 040_multi_tenancy.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'SUSPENDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle') THEN
    CREATE TYPE billing_cycle AS ENUM ('MONTHLY', 'ANNUAL', 'NONE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELED');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PLATFORM ADMINS & SETTINGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID NOT NULL UNIQUE,          -- auth.users.id
  full_name      TEXT NOT NULL,
  phone          TEXT NOT NULL UNIQUE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_by     UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (key, value) VALUES
  ('billing', jsonb_build_object(
    'currency', 'ETB',
    'trial_days', 14,
    'trial_plan_code', 'PROFESSIONAL',   -- plan a new Sunday school tries
    'after_trial_plan_code', 'FREE',     -- plan it falls back to if it does not pay ('' = read-only)
    'grace_days', 7,                     -- days after a missed renewal before read-only
    'invoice_due_days', 7,
    'warn_usage_pct', 80
  )),
  ('registration', jsonb_build_object('open', true)),
  ('manual_payment', jsonb_build_object(
    'instructions_en', 'Pay by bank transfer or mobile money, then enter the transaction reference and attach the receipt.',
    'instructions_am', 'በባንክ ወይም በሞባይል ገንዘብ ይክፈሉ፤ ከዚያ የግብይት ቁጥሩን ያስገቡና ደረሰኙን ያያይዙ።',
    'accounts', '[]'::jsonb             -- [{ "bank": "...", "name": "...", "number": "..." }]
  ))
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- MODULES & PLANS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_modules (
  code         TEXT PRIMARY KEY CHECK (code ~ '^[a-z_]{2,40}$'),
  name_en      TEXT NOT NULL,
  name_am      TEXT,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,   -- off = not offered on any plan
  sort_order   INT NOT NULL DEFAULT 0
);

INSERT INTO platform_modules (code, name_en, name_am, sort_order) VALUES
  ('education',      'Education (classes, attendance, grades)', 'ትምህርት',            10),
  ('online_exams',   'Online exams',                            'የኦንላይን ፈተና',       20),
  ('portals',        'Student & parent portals',                'የተማሪና ወላጅ መግቢያ',   30),
  ('programs',       'Programs & events',                       'ፕሮግራሞች',            40),
  ('check_in',       'Check-in',                                'መገኘት መመዝገቢያ',       50),
  ('sacred_arts',    'Choir & sacred arts',                     'ዜማና ቅዱስ ጥበብ',       60),
  ('hr',             'Human resources',                         'የሰው ሀብት',           70),
  ('finance',        'Finance & budget',                        'ፋይናንስ',              80),
  ('dues',           'Member dues',                             'ወርሃዊ መዋጮ',           90),
  ('property',       'Property & assets',                       'ንብረት',              100),
  ('tasks',          'Tasks, plans & questions',                'ተግባራትና እቅድ',       110),
  ('telegram',       'Telegram bot',                            'ቴሌግራም ቦት',          120),
  ('website',        'Public website',                          'ድረ ገጽ',              130),
  ('reports_export', 'Advanced reports & exports',              'ሪፖርትና መላክ',         140),
  ('audit',          'Audit trail',                             'የኦዲት መዝገብ',         150),
  ('automation',     'Daily automation & reminders',            'ራስ-ሰር ማስታወሻ',       160)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{2,30}$'),
  name_en         TEXT NOT NULL,
  name_am         TEXT,
  description_en  TEXT,
  description_am  TEXT,
  price_monthly   NUMERIC(12, 2) CHECK (price_monthly IS NULL OR price_monthly >= 0),  -- NULL = not offered monthly
  price_annual    NUMERIC(12, 2) CHECK (price_annual IS NULL OR price_annual >= 0),
  currency        TEXT NOT NULL DEFAULT 'ETB',
  is_free         BOOLEAN NOT NULL DEFAULT FALSE,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,    -- offered on sign-up / upgrade pages
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0,
  features        TEXT[] NOT NULL DEFAULT '{}',     -- platform_modules codes
  -- { "staff_users": 10, "people": 1000, "students": 600, "storage_mb": 2048 }; missing key = unlimited
  limits          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Allowed over a limit before new records are refused (soft limit), in percent
  overage_pct     INT NOT NULL DEFAULT 0 CHECK (overage_pct BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Example plans — prices and limits are placeholders, edit them on /platform/plans
INSERT INTO plans (code, name_en, name_am, price_monthly, price_annual, is_free, is_public, sort_order, features, limits) VALUES
  ('FREE', 'Free', 'ነፃ', 0, 0, TRUE, TRUE, 10,
    ARRAY['education', 'programs'],
    '{"staff_users": 3, "people": 150, "students": 100, "storage_mb": 200}'),
  ('BASIC', 'Basic', 'መሠረታዊ', 500, 5000, FALSE, TRUE, 20,
    ARRAY['education', 'portals', 'programs', 'check_in', 'finance', 'dues', 'tasks', 'telegram'],
    '{"staff_users": 10, "people": 1000, "students": 600, "storage_mb": 2048}'),
  ('PROFESSIONAL', 'Professional', 'ፕሮፌሽናል', 1500, 15000, FALSE, TRUE, 30,
    ARRAY['education', 'online_exams', 'portals', 'programs', 'check_in', 'sacred_arts', 'hr', 'finance',
          'dues', 'property', 'tasks', 'telegram', 'website', 'reports_export', 'audit', 'automation'],
    '{"staff_users": 40, "people": 5000, "students": 3000, "storage_mb": 10240}'),
  ('ENTERPRISE', 'Enterprise', 'ኢንተርፕራይዝ', NULL, NULL, FALSE, FALSE, 40,
    ARRAY['education', 'online_exams', 'portals', 'programs', 'check_in', 'sacred_arts', 'hr', 'finance',
          'dues', 'property', 'tasks', 'telegram', 'website', 'reports_export', 'audit', 'automation'],
    '{}')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- SUBSCRIPTIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id                UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status                 subscription_status NOT NULL,
  billing_cycle          billing_cycle NOT NULL DEFAULT 'NONE',
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at          TIMESTAMPTZ,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,              -- NULL = does not expire (free / complimentary)
  grace_days             INT NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 90),
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at            TIMESTAMPTZ,
  ended_at               TIMESTAMPTZ,
  suspended_at           TIMESTAMPTZ,
  -- Change that starts at the next renewal (downgrades)
  pending_plan_id        UUID REFERENCES plans(id) ON DELETE SET NULL,
  pending_billing_cycle  billing_cycle,
  -- Per-tenant exceptions (Enterprise): { "staff_users": 200 } / { "add": ["hr"], "remove": [] }
  limit_overrides        JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_overrides      JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status, current_period_end);

CREATE TABLE IF NOT EXISTS subscription_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  event            TEXT NOT NULL,                  -- CREATED, PLAN_CHANGED, RENEWED, STATUS_CHANGED, …
  from_status      subscription_status,
  to_status        subscription_status,
  from_plan_id     UUID REFERENCES plans(id) ON DELETE SET NULL,
  to_plan_id       UUID REFERENCES plans(id) ON DELETE SET NULL,
  actor_type       TEXT NOT NULL CHECK (actor_type IN ('PLATFORM_ADMIN', 'TENANT_USER', 'SYSTEM', 'PAYMENT')),
  actor_id         UUID,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_tenant ON subscription_events (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- INVOICES & PAYMENTS
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq;

CREATE OR REPLACE FUNCTION generate_invoice_no()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_no_seq')::TEXT, 6, '0');
$$;

CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no       TEXT NOT NULL UNIQUE DEFAULT generate_invoice_no(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id          UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  billing_cycle    billing_cycle NOT NULL,
  period_start     TIMESTAMPTZ NOT NULL,
  period_end       TIMESTAMPTZ NOT NULL,
  -- Price copied from the plan when the invoice is made (never from the browser)
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency         TEXT NOT NULL DEFAULT 'ETB',
  status           invoice_status NOT NULL DEFAULT 'OPEN',
  kind             TEXT NOT NULL DEFAULT 'RENEWAL' CHECK (kind IN ('NEW', 'RENEWAL', 'UPGRADE', 'MANUAL')),
  due_at           TIMESTAMPTZ NOT NULL,
  paid_at          TIMESTAMPTZ,
  voided_at        TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status, due_at);
-- At most one unpaid invoice for the same tenant and period
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_open_period
  ON invoices (tenant_id, period_start) WHERE status IN ('DRAFT', 'OPEN');

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  provider         TEXT NOT NULL DEFAULT 'MANUAL',          -- MANUAL, later CHAPA / TELEBIRR
  provider_ref     TEXT,                                    -- provider's transaction id
  method           TEXT NOT NULL CHECK (method IN ('BANK_TRANSFER', 'MOBILE_MONEY', 'CASH', 'CARD', 'OTHER')),
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency         TEXT NOT NULL DEFAULT 'ETB',
  status           payment_status NOT NULL DEFAULT 'PENDING',
  payer_name       TEXT,
  payer_phone      TEXT,
  reference_no     TEXT,                                    -- bank / mobile-money reference the payer gives
  proof_path       TEXT,                                    -- receipt in the billing-proofs bucket
  submitted_by     UUID,                                    -- system_users.id of the tenant user
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by      UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT,
  refunded_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  refunded_at      TIMESTAMPTZ,
  raw              JSONB,                                   -- provider's verified response
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (refunded_amount <= amount)
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status, submitted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_ref
  ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
-- The same bank / mobile-money reference cannot be claimed twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_reference
  ON payments (provider, method, reference_no) WHERE reference_no IS NOT NULL AND status IN ('PENDING', 'SUCCEEDED');

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL,
  event_id         TEXT NOT NULL,
  event_type       TEXT,
  signature_valid  BOOLEAN NOT NULL,
  payload          JSONB NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  error            TEXT,
  attempts         INT NOT NULL DEFAULT 1,
  UNIQUE (provider, event_id)
);

-- -----------------------------------------------------------------------------
-- USAGE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_snapshots (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  taken_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  metrics    JSONB NOT NULL,
  PRIMARY KEY (tenant_id, taken_on)
);

-- Current usage of one tenant:
--   staff_users  active logins, not counting student and parent-only logins
--   people       person records (members, students, guardians)
--   students     active students
--   storage_mb   files in the tenant's storage folders
CREATE OR REPLACE FUNCTION tenant_usage(p_tenant UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff    BIGINT;
  v_people   BIGINT;
  v_students BIGINT;
  v_bytes    NUMERIC := 0;
  v_default  BOOLEAN;
BEGIN
  SELECT count(*) INTO v_staff
  FROM system_users su
  JOIN persons p ON p.id = su.person_id
  WHERE su.tenant_id = p_tenant AND su.is_active
    AND NOT COALESCE(p.is_guardian_only, FALSE)
    AND NOT EXISTS (SELECT 1 FROM students s WHERE s.person_id = su.person_id);

  SELECT count(*) INTO v_people FROM persons WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_students FROM students WHERE tenant_id = p_tenant AND status = 'ACTIVE';

  SELECT is_default INTO v_default FROM tenants WHERE id = p_tenant;
  BEGIN
    SELECT COALESCE(sum((o.metadata ->> 'size')::numeric), 0) INTO v_bytes
    FROM storage.objects o
    WHERE o.bucket_id <> 'billing-proofs'
      AND (o.name LIKE p_tenant::text || '/%'
           -- the default tenant's files from before 040 have no tenant folder
           OR (v_default AND split_part(o.name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
  EXCEPTION WHEN others THEN
    v_bytes := 0;   -- storage schema not readable here
  END;

  RETURN jsonb_build_object(
    'staff_users', v_staff,
    'people', v_people,
    'students', v_students,
    'storage_mb', round(v_bytes / 1048576, 1)
  );
END;
$$;

-- The tenant's limit for a metric (NULL = unlimited), overage included
CREATE OR REPLACE FUNCTION tenant_limit(p_tenant UUID, p_metric TEXT)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT floor(
           COALESCE(s.limit_overrides ->> p_metric, p.limits ->> p_metric)::numeric
           * (100 + p.overage_pct) / 100
         )::bigint
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.tenant_id = p_tenant;
$$;

-- BEFORE INSERT (and re-activation of a login): refuse a new record over the plan's limit.
-- Message QUOTA_EXCEEDED:<metric>:<limit> is turned into a readable error by the app.
CREATE OR REPLACE FUNCTION enforce_quota()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_metric TEXT;
  v_limit  BIGINT;
  v_used   BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'system_users' THEN
    IF NOT NEW.is_active OR (TG_OP = 'UPDATE' AND OLD.is_active) THEN
      RETURN NEW;
    END IF;
    -- Student and parent-only logins do not use staff seats
    IF EXISTS (SELECT 1 FROM students s WHERE s.person_id = NEW.person_id)
       OR EXISTS (SELECT 1 FROM persons p WHERE p.id = NEW.person_id AND COALESCE(p.is_guardian_only, FALSE)) THEN
      RETURN NEW;
    END IF;
    v_metric := 'staff_users';
  ELSIF TG_TABLE_NAME = 'persons' THEN
    v_metric := 'people';
  ELSIF TG_TABLE_NAME = 'students' THEN
    IF NEW.status <> 'ACTIVE' OR (TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE') THEN
      RETURN NEW;
    END IF;
    v_metric := 'students';
  ELSE
    RETURN NEW;
  END IF;

  v_limit := tenant_limit(NEW.tenant_id, v_metric);
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;
  v_used := (tenant_usage(NEW.tenant_id) ->> v_metric)::bigint;
  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED:%:%', v_metric, v_limit USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quota ON persons;
CREATE TRIGGER trg_quota BEFORE INSERT ON persons FOR EACH ROW EXECUTE FUNCTION enforce_quota();
DROP TRIGGER IF EXISTS trg_quota ON students;
CREATE TRIGGER trg_quota BEFORE INSERT OR UPDATE OF status ON students FOR EACH ROW EXECUTE FUNCTION enforce_quota();
DROP TRIGGER IF EXISTS trg_quota ON system_users;
CREATE TRIGGER trg_quota BEFORE INSERT OR UPDATE OF is_active ON system_users FOR EACH ROW EXECUTE FUNCTION enforce_quota();

-- -----------------------------------------------------------------------------
-- PLATFORM AUDIT LOG (permanent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id  UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  actor_label     TEXT NOT NULL,                  -- name / 'system' / 'tenant:<user>'
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,                  -- TENANT_SUSPENDED, PLAN_UPDATED, PAYMENT_CONFIRMED, …
  target_type     TEXT,
  target_id       TEXT,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_logs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION forbid_platform_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only the foreign keys may clear themselves when an admin / tenant is removed
  IF TG_OP = 'UPDATE' AND NEW.id = OLD.id AND NEW.action = OLD.action AND NEW.details = OLD.details
     AND NEW.created_at = OLD.created_at AND NEW.actor_label = OLD.actor_label
     AND (NEW.actor_admin_id IS NULL OR NEW.actor_admin_id = OLD.actor_admin_id)
     AND (NEW.tenant_id IS NULL OR NEW.tenant_id = OLD.tenant_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Platform audit entries cannot be changed or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_audit_immutable ON platform_audit_logs;
CREATE TRIGGER trg_platform_audit_immutable BEFORE UPDATE OR DELETE ON platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_platform_audit_change();

-- Subscription history is permanent too (so plans that appear in it cannot be deleted — deactivate them)
CREATE OR REPLACE FUNCTION forbid_history_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% entries cannot be changed or deleted', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_events_immutable ON subscription_events;
CREATE TRIGGER trg_sub_events_immutable BEFORE UPDATE OR DELETE ON subscription_events
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();

-- -----------------------------------------------------------------------------
-- RATE LIMITS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  hits          INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Counts one hit for p_key in the current fixed window; TRUE while within p_max.
CREATE OR REPLACE FUNCTION hit_rate_limit(p_key TEXT, p_window_seconds INT, p_max INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds);
  v_hits   INT;
BEGIN
  INSERT INTO rate_limits (key, window_start, hits) VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_max;
END;
$$;

-- -----------------------------------------------------------------------------
-- updated_at, RLS, grants
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_admins', 'plans', 'subscriptions', 'invoices', 'payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'platform_admins', 'platform_settings', 'platform_modules', 'plans', 'subscriptions', 'subscription_events',
    'invoices', 'payments', 'payment_webhook_events', 'usage_snapshots', 'platform_audit_logs', 'rate_limits'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

REVOKE ALL ON SEQUENCE invoice_no_seq FROM anon, authenticated;
REVOKE ALL ON FUNCTION generate_invoice_no() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tenant_usage(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tenant_limit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enforce_quota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION hit_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;

-- The server's key (service_role) keeps what it needs
GRANT EXECUTE ON FUNCTION generate_invoice_no(), tenant_usage(UUID), tenant_limit(UUID, TEXT), hit_rate_limit(TEXT, INT, INT) TO service_role;
GRANT USAGE ON SEQUENCE invoice_no_seq TO service_role;
GRANT ALL ON TABLE platform_admins, platform_settings, platform_modules, plans, subscriptions, subscription_events,
  invoices, payments, payment_webhook_events, usage_snapshots, platform_audit_logs, rate_limits TO service_role;

-- Receipts for manual payments (private; server reads them with signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('billing-proofs', 'billing-proofs', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Hamere Hiwot: Enterprise, no expiry
-- -----------------------------------------------------------------------------
INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, notes)
SELECT 'a0000000-0000-4000-8000-000000000001', p.id, 'ACTIVE', 'NONE', NOW(),
       'Founding Sunday school — complimentary Enterprise plan'
FROM plans p WHERE p.code = 'ENTERPRISE'
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO subscription_events (tenant_id, subscription_id, event, to_status, to_plan_id, actor_type, details)
SELECT s.tenant_id, s.id, 'CREATED', s.status, s.plan_id, 'SYSTEM', '{"by": "migration 041"}'
FROM subscriptions s
WHERE s.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM subscription_events e WHERE e.tenant_id = s.tenant_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
