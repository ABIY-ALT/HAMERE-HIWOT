-- =============================================================================
-- SSMS — Migration 015: Choir & sacred arts
-- Depends on: 002 (persons, roles, permissions), 005 (attendance_status),
--             013 (programs, optional link), 014 (assets, vestments),
--             011 (audit, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • choir_members: registered members who sing / play, with voice part,
--   instruments and the vestment they hold (an asset in the register).
-- • hymns: the hymn library (title, type, feast/season, lyrics).
-- • choir_sessions: rehearsals, services and performances (optionally for a
--   program), with the hymns planned (choir_session_hymns) and attendance
--   per member (choir_attendance).
-- Permission CHOIR_MANAGE + role CHOIR_LEADER; viewing uses MEMBER_VIEW.
-- =============================================================================

CREATE TABLE IF NOT EXISTS choir_members (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id           UUID NOT NULL UNIQUE REFERENCES persons(id) ON DELETE CASCADE,
  voice_part          TEXT NOT NULL DEFAULT 'NOT_SET' CHECK (voice_part IN ('SOPRANO', 'ALTO', 'TENOR', 'BASS', 'NOT_SET')),
  instruments         TEXT[] NOT NULL DEFAULT '{}',
  vestment_asset_id   UUID REFERENCES assets(id) ON DELETE SET NULL,
  joined_on           DATE,
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hymns (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_am     TEXT NOT NULL,
  title_en     TEXT,
  category     TEXT NOT NULL CHECK (category IN ('KIDASE', 'MEZMUR', 'WEDASE', 'KINE', 'ZEMA', 'OTHER')),
  feast        TEXT,
  lyrics       TEXT,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS choir_sessions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_date     DATE NOT NULL,
  start_time       TIME,
  kind             TEXT NOT NULL CHECK (kind IN ('REHEARSAL', 'SERVICE', 'PERFORMANCE')),
  title            TEXT,
  location         TEXT,
  program_id       UUID REFERENCES programs(id) ON DELETE SET NULL,
  lead_member_id   UUID REFERENCES choir_members(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'HELD', 'CANCELLED')),
  notes            TEXT,
  created_by       UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_choir_sessions_date ON choir_sessions(session_date);

CREATE TABLE IF NOT EXISTS choir_session_hymns (
  session_id  UUID NOT NULL REFERENCES choir_sessions(id) ON DELETE CASCADE,
  hymn_id     UUID NOT NULL REFERENCES hymns(id) ON DELETE RESTRICT,
  position    SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (session_id, hymn_id)
);

CREATE TABLE IF NOT EXISTS choir_attendance (
  session_id  UUID NOT NULL REFERENCES choir_sessions(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES choir_members(id) ON DELETE CASCADE,
  status      attendance_status NOT NULL,
  PRIMARY KEY (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_choir_attendance_member ON choir_attendance(member_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['choir_members', 'hymns', 'choir_sessions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['choir_members', 'hymns', 'choir_sessions'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Permission & role
INSERT INTO permissions (code, name_en, name_am, category, is_active)
SELECT 'CHOIR_MANAGE', 'Manage Choir & Hymns', 'መዘምራንና መዝሙራትን ማስተዳደር', 'PROGRAMS', TRUE
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'CHOIR_MANAGE');

INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'CHOIR_LEADER', 'Choir Leader', 'የመዘምራን ኃላፊ',
       'Keeps the choir roster, hymn library, rehearsals and choir attendance',
       'የመዘምራንን ዝርዝር፣ የመዝሙራት ማውጫ፣ ልምምድና ክትትል ይይዛል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'CHOIR_LEADER');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('CHOIR_MANAGE', 'MEMBER_VIEW', 'PROGRAM_VIEW', 'ASSET_VIEW')
WHERE r.code = 'CHOIR_LEADER'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Row level security
ALTER TABLE choir_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hymns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE choir_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE choir_session_hymns ENABLE ROW LEVEL SECURITY;
ALTER TABLE choir_attendance    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['choir_members', 'hymns', 'choir_sessions', 'choir_session_hymns', 'choir_attendance'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('MEMBER_VIEW') OR auth_user_has_permission('CHOIR_MANAGE') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_write ON %1$I FOR INSERT WITH CHECK (auth_user_has_permission('CHOIR_MANAGE'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_update ON %1$I FOR UPDATE USING (auth_user_has_permission('CHOIR_MANAGE'))$p$, t);
  END LOOP;
END $$;
