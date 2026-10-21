-- =============================================================================
-- SSMS — Migration 039: Public website — news and photo gallery
-- Depends on: 002 (system_users, roles, permissions), 038 (public website)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • site_posts: news & announcements written on the website (Public website →
--   News). Published ones show under /news; publishing can also send them to
--   everyone connected to the Telegram bot (telegram_sent_at: once only).
-- • site_albums / site_photos: the photo gallery (Public website → Gallery).
--   Published albums show under /gallery. Photos are made smaller in the
--   browser before upload (a large copy and a thumbnail) — which also drops
--   the camera's hidden details such as the GPS location.
-- • Storage bucket "site-media" is PUBLIC (anyone with the link can see a
--   file): only pictures meant for the website go in it. Uploads and deletes
--   go through the server only (no storage policies).
-- • Permission WEBSITE_MANAGE + role WEBSITE_EDITOR (media department): news
--   and gallery, without any other admin access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_posts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_am          TEXT NOT NULL,
  title_en          TEXT,
  body_am           TEXT NOT NULL DEFAULT '',
  body_en           TEXT,
  cover_path        TEXT,                                -- object path in site-media
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  pinned            BOOLEAN NOT NULL DEFAULT FALSE,      -- kept at the top of the list
  published_at      TIMESTAMPTZ,
  telegram_sent_at  TIMESTAMPTZ,
  created_by        UUID REFERENCES system_users(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_posts_published ON site_posts(published_at DESC) WHERE status = 'PUBLISHED';

CREATE TABLE IF NOT EXISTS site_albums (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_am        TEXT NOT NULL,
  title_en        TEXT,
  description_am  TEXT,
  description_en  TEXT,
  event_date      DATE,                                  -- when the photos were taken
  cover_photo_id  UUID,                                  -- else the first photo
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_photos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id    UUID NOT NULL REFERENCES site_albums(id) ON DELETE CASCADE,
  path        TEXT NOT NULL UNIQUE,                      -- large copy (about 1600 px)
  thumb_path  TEXT NOT NULL UNIQUE,                      -- thumbnail (about 480 px)
  width       INT NOT NULL CHECK (width > 0),
  height      INT NOT NULL CHECK (height > 0),
  size_bytes  INT NOT NULL DEFAULT 0,
  caption_am  TEXT,
  caption_en  TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_photos_album ON site_photos(album_id, sort_order, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_albums_cover_fkey') THEN
    ALTER TABLE site_albums ADD CONSTRAINT site_albums_cover_fkey FOREIGN KEY (cover_photo_id) REFERENCES site_photos(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_site_posts_updated_at ON site_posts;
CREATE TRIGGER trg_site_posts_updated_at BEFORE UPDATE ON site_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_site_albums_updated_at ON site_albums;
CREATE TRIGGER trg_site_albums_updated_at BEFORE UPDATE ON site_albums
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['site_posts', 'site_albums', 'site_photos'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Server only
ALTER TABLE site_posts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos ENABLE ROW LEVEL SECURITY;

-- Public bucket (files readable by link); no storage policies, so only the server can upload or delete
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('site-media', 'site-media', TRUE, 3145728, ARRAY['image/jpeg', 'image/webp', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Permission & role
INSERT INTO permissions (code, name_en, name_am, category, is_active)
SELECT 'WEBSITE_MANAGE', 'Manage the Public Website (news, gallery)', 'የሕዝብ ድረ-ገጹን ማስተዳደር (ዜና፣ የፎቶ ማዕከል)', 'ADMIN', TRUE
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'WEBSITE_MANAGE');

INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'WEBSITE_EDITOR', 'Website Editor (Media)', 'የድረ-ገጽ አርታኢ (ሚዲያ)',
       'Writes news and announcements and keeps the photo gallery of the public website',
       'በሕዝብ ድረ-ገጹ ላይ ዜናና ማስታወቂያ ይጽፋል፤ የፎቶ ማዕከሉን ይይዛል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'WEBSITE_EDITOR');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('WEBSITE_MANAGE', 'PROGRAM_VIEW')
WHERE r.code = 'WEBSITE_EDITOR'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- The secretariat also keeps the website; the super admin has everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'WEBSITE_MANAGE'
WHERE r.code IN ('SUPER_ADMIN', 'SECRETARIAT')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
