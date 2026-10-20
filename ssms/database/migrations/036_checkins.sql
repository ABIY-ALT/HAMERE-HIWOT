-- =============================================================================
-- SSMS — Migration 036: Check-in at programs and choir rehearsals
-- Depends on: 013 (programs), 015 (choir_sessions, choir_attendance), 024 (Telegram)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- "Trust, but verify":
-- • The leader opens check-in for an event (a program, a choir rehearsal, or
--   another gathering). A 4-digit code shows on the leader's screen and
--   changes every 30 seconds (made from `secret`, never sent to phones).
-- • A person checks in — in the bot ("✅ I'm here") or on the website — with
--   the code on the screen, only during the event's time (30 minutes before
--   the start until the end).
-- • Location is optional: when the leader set the place, a check-in with the
--   phone's location within the radius counts at once; with no location or
--   too far away it is FLAGGED for the leader to confirm or remove.
-- • The leader can mark anyone present (no phone) and remove anyone.
-- • Closing a choir event writes the choir attendance; closing a program sets
--   its number of participants.
-- Who: PROGRAM_CREATE / PROGRAM_MANAGE for programs and other gatherings,
--      CHOIR_MANAGE for choir rehearsals.
-- =============================================================================

CREATE TABLE IF NOT EXISTS checkin_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind              TEXT NOT NULL CHECK (kind IN ('PROGRAM', 'CHOIR', 'OTHER')),
  program_id        UUID REFERENCES programs(id) ON DELETE CASCADE,
  choir_session_id  UUID REFERENCES choir_sessions(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  secret            TEXT NOT NULL,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  radius_m          INT NOT NULL DEFAULT 200 CHECK (radius_m BETWEEN 50 AND 5000),
  status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_by        UUID REFERENCES system_users(id) ON DELETE SET NULL,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checkin_events_times CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS checkins (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID NOT NULL REFERENCES checkin_events(id) ON DELETE CASCADE,
  person_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('CODE', 'LEADER')),
  status       TEXT NOT NULL CHECK (status IN ('PRESENT', 'FLAGGED', 'REMOVED')),
  flag         TEXT CHECK (flag IS NULL OR flag IN ('NO_LOCATION', 'FAR')),
  distance_m   INT,
  chat_id      BIGINT,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  CONSTRAINT uq_checkin UNIQUE (event_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_checkin_events_time ON checkin_events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_checkins_person ON checkins(person_id, checked_at);

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['checkin_events', 'checkins'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Server only (the code's secret must never be readable from a browser)
ALTER TABLE checkin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins       ENABLE ROW LEVEL SECURITY;
