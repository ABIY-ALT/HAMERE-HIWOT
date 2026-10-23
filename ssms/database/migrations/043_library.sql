-- =============================================================================
-- SSMS — Migration 043: Physical library (books, copies, lending)
-- Depends on: 040 (multi-tenancy) and 041 (plans and modules) — checked below
-- Apply via: Supabase Dashboard → SQL Editor (runs in one transaction)
-- Undo: 043_library_down.sql
-- =============================================================================
-- What it adds
-- • library_books: the catalogue — one row per title (author, category,
--   language, shelf…).
-- • library_copies: each physical copy of a title, numbered LIB-<year>-0001
--   per Sunday school, with its status (available, on loan, being read in the
--   library, lost, damaged, withdrawn).
-- • library_requests: a person asks for a book (Telegram bot); the librarian
--   says when it is ready; lending it to them closes the request.
-- • library_loans: a copy given to a person — a student, teacher or member —
--   either to take HOME (with a due date) or to READ in the library room.
--   A copy has at most one open loan; the copy's status follows its loans.
-- • Permissions LIBRARY_VIEW / LIBRARY_MANAGE, a Librarian role in every
--   Sunday school, and the "library" module (in the Professional and
--   Enterprise plans; the platform admin can add it to others).
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
END $$;

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS library_books (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  author          TEXT,
  category        TEXT NOT NULL DEFAULT 'GENERAL',
  language        TEXT NOT NULL DEFAULT 'AM' CHECK (language IN ('AM', 'GEEZ', 'EN', 'OM', 'TI', 'OTHER')),
  audience        TEXT NOT NULL DEFAULT 'ALL' CHECK (audience IN ('ALL', 'CHILDREN', 'YOUTH', 'ADULT')),
  isbn            TEXT,
  publisher       TEXT,
  published_year  INT,
  shelf           TEXT,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT library_books_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT library_books_created_by_fkey FOREIGN KEY (tenant_id, created_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE INDEX IF NOT EXISTS idx_library_books_title ON library_books (tenant_id, title);

CREATE TABLE IF NOT EXISTS library_copies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  book_id      UUID NOT NULL,
  -- LIB-2026-0001, filled per Sunday school when left empty
  copy_no      TEXT,
  status       TEXT NOT NULL DEFAULT 'AVAILABLE'
                 CHECK (status IN ('AVAILABLE', 'ON_LOAN', 'IN_LIBRARY', 'LOST', 'DAMAGED', 'WITHDRAWN')),
  condition    TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('NEW', 'GOOD', 'FAIR', 'POOR')),
  source       TEXT NOT NULL DEFAULT 'PURCHASE' CHECK (source IN ('PURCHASE', 'DONATION', 'OTHER')),
  donor        TEXT,
  acquired_on  DATE,
  price        NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT library_copies_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT library_copies_tid_copy_no_key UNIQUE (tenant_id, copy_no),
  CONSTRAINT library_copies_book_fkey FOREIGN KEY (tenant_id, book_id)
    REFERENCES library_books (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_library_copies_book ON library_copies (tenant_id, book_id);

-- -----------------------------------------------------------------------------
-- Lending
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS library_loans (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  copy_id             UUID NOT NULL,
  book_id             UUID NOT NULL,
  borrower_person_id  UUID NOT NULL,
  -- What the borrower was when the book was given (for the readers' numbers)
  borrower_kind       TEXT NOT NULL CHECK (borrower_kind IN ('STUDENT', 'TEACHER', 'MEMBER', 'OTHER')),
  -- HOME: taken home until due_date · READING: read in the library room
  kind                TEXT NOT NULL CHECK (kind IN ('HOME', 'READING')),
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date            DATE,
  returned_at         TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'OUT' CHECK (status IN ('OUT', 'RETURNED', 'LOST')),
  renewals            INT NOT NULL DEFAULT 0,
  condition_in        TEXT CHECK (condition_in IS NULL OR condition_in IN ('GOOD', 'FAIR', 'DAMAGED')),
  issued_by           UUID,
  returned_by         UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind = 'READING' OR due_date IS NOT NULL),
  CHECK ((status = 'OUT') = (returned_at IS NULL)),
  CONSTRAINT library_loans_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT library_loans_copy_fkey FOREIGN KEY (tenant_id, copy_id)
    REFERENCES library_copies (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_book_fkey FOREIGN KEY (tenant_id, book_id)
    REFERENCES library_books (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_borrower_fkey FOREIGN KEY (tenant_id, borrower_person_id)
    REFERENCES persons (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_issued_by_fkey FOREIGN KEY (tenant_id, issued_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (issued_by),
  CONSTRAINT library_loans_returned_by_fkey FOREIGN KEY (tenant_id, returned_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (returned_by)
);
-- One open loan per copy
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_loans_open_copy ON library_loans (tenant_id, copy_id) WHERE status = 'OUT';
CREATE INDEX IF NOT EXISTS idx_library_loans_borrower ON library_loans (tenant_id, borrower_person_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_loans_book ON library_loans (tenant_id, book_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_loans_open ON library_loans (tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_library_loans_issued ON library_loans (tenant_id, issued_at DESC);

-- Requests: someone asks for a book (from the Telegram bot or the desk); the
-- librarian tells them when it is ready, and giving them the book closes it.
CREATE TABLE IF NOT EXISTS library_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL DEFAULT request_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  book_id       UUID NOT NULL,
  person_id     UUID NOT NULL,
  status        TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'READY', 'DONE', 'CANCELLED')),
  via           TEXT NOT NULL DEFAULT 'TELEGRAM' CHECK (via IN ('TELEGRAM', 'DESK')),
  note          TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_by    UUID,
  handled_at    TIMESTAMPTZ,
  loan_id       UUID,
  CONSTRAINT library_requests_tid_id_key UNIQUE (tenant_id, id),
  CONSTRAINT library_requests_book_fkey FOREIGN KEY (tenant_id, book_id)
    REFERENCES library_books (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT library_requests_person_fkey FOREIGN KEY (tenant_id, person_id)
    REFERENCES persons (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT library_requests_handled_by_fkey FOREIGN KEY (tenant_id, handled_by)
    REFERENCES system_users (tenant_id, id) ON DELETE SET NULL (handled_by),
  CONSTRAINT library_requests_loan_fkey FOREIGN KEY (tenant_id, loan_id)
    REFERENCES library_loans (tenant_id, id) ON DELETE SET NULL (loan_id)
);
-- One open request per person and book
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_requests_open ON library_requests (tenant_id, person_id, book_id) WHERE status IN ('WAITING', 'READY');
CREATE INDEX IF NOT EXISTS idx_library_requests_status ON library_requests (tenant_id, status, requested_at);

-- The copy's status follows its loans: given → on loan / in the library room,
-- returned → available (or damaged), lost → lost.
CREATE OR REPLACE FUNCTION library_sync_copy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'OUT' THEN
    UPDATE library_copies SET status = CASE NEW.kind WHEN 'HOME' THEN 'ON_LOAN' ELSE 'IN_LIBRARY' END, updated_at = NOW()
    WHERE id = NEW.copy_id AND tenant_id = NEW.tenant_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'OUT' AND NEW.status <> 'OUT' THEN
    UPDATE library_copies
    SET status = CASE
                   WHEN NEW.status = 'LOST' THEN 'LOST'
                   WHEN NEW.condition_in = 'DAMAGED' THEN 'DAMAGED'
                   ELSE 'AVAILABLE'
                 END,
        condition = CASE WHEN NEW.condition_in = 'FAIR' AND condition IN ('NEW', 'GOOD') THEN 'FAIR' ELSE condition END,
        updated_at = NOW()
    WHERE id = NEW.copy_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_library_sync_copy ON library_loans;
CREATE TRIGGER trg_library_sync_copy AFTER INSERT OR UPDATE ON library_loans
  FOR EACH ROW EXECUTE FUNCTION library_sync_copy();

-- Copy numbers per Sunday school: LIB-2026-0001
DROP TRIGGER IF EXISTS trg_number ON library_copies;
CREATE TRIGGER trg_number BEFORE INSERT ON library_copies
  FOR EACH ROW EXECUTE FUNCTION tenant_fill_number('copy_no', 'library_copy', 'LIB');

-- -----------------------------------------------------------------------------
-- Tenant plumbing, as migration 040 does for every tenant table
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['library_books', 'library_copies', 'library_loans', 'library_requests'] LOOP
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

DROP TRIGGER IF EXISTS trg_library_books_updated_at ON library_books;
CREATE TRIGGER trg_library_books_updated_at BEFORE UPDATE ON library_books FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_library_copies_updated_at ON library_copies;
CREATE TRIGGER trg_library_copies_updated_at BEFORE UPDATE ON library_copies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Permissions, the Librarian role, the module
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, name_en, name_am, category, is_active)
SELECT v.code, v.name_en, v.name_am, 'LIBRARY', TRUE
FROM (VALUES
  ('LIBRARY_VIEW', 'View the library', 'ቤተ መጻሕፍትን ማየት'),
  ('LIBRARY_MANAGE', 'Manage the library and lend books', 'ቤተ መጻሕፍትን ማስተዳደርና መጻሕፍት ማዋስ')
) AS v(code, name_en, name_am)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = v.code);

-- In every Sunday school (and the template new ones are copied from)
INSERT INTO roles (tenant_id, code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT t.id, 'LIBRARIAN', 'Librarian', 'የቤተ መጻሕፍት ኃላፊ',
       'Keeps the book catalogue, lends books and takes them back',
       'የመጻሕፍት ዝርዝሩን ይይዛል፣ መጻሕፍትን ያውሳል፣ ይመልሳል',
       FALSE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.tenant_id = t.id AND r.code = 'LIBRARIAN');

INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
JOIN permissions p ON
     (r.code IN ('SUPER_ADMIN', 'LIBRARIAN') AND p.code IN ('LIBRARY_VIEW', 'LIBRARY_MANAGE'))
  OR (r.code IN ('TEACHER', 'DEPT_HEAD') AND p.code = 'LIBRARY_VIEW')
WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO platform_modules (code, name_en, name_am, sort_order)
VALUES ('library', 'Library (books and lending)', 'ቤተ መጻሕፍት', 105)
ON CONFLICT (code) DO NOTHING;

UPDATE plans SET features = array_append(features, 'library')
WHERE code IN ('PROFESSIONAL', 'ENTERPRISE') AND NOT ('library' = ANY (features));

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
    'library_books', 'library_copies', 'library_loans', 'library_requests'
  ]::TEXT[];
$$;
REVOKE ALL ON FUNCTION _mt_tenant_tables() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
