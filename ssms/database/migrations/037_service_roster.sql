-- =============================================================================
-- SSMS — Migration 037: Service roster (ምደባ) and vestments (የክብር ልብስ)
-- Depends on: 015 (choir_members, choir_sessions, choir_attendance), 024 (Telegram)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- Instead of a roster written on paper and posted on Telegram:
-- • For a choir SERVICE or PERFORMANCE, the leader picks who serves. The page
--   shows each member's rehearsal attendance before that day and suggests the
--   ones at or above the rule (e.g. 75 % of the last 4 weeks' rehearsals).
-- • Publishing tells every active choir member in the bot — assigned (with
--   their role) or not on the list this time — and they confirm or say they
--   cannot come ("🎵 My service" in the bot, or "My service" on the website).
-- Instead of handing out vestments by memory:
-- • The choir keeps its own vestment store (separate from the property
--   register). A vestment is issued to a person for a service, with the day it
--   must come back; receiving it back records its condition. Overdue ones show
--   on the page and the leader can remind the holders in the bot.
-- Who: CHOIR_MANAGE runs both; members see only their own.
-- =============================================================================

ALTER TABLE choir_sessions ADD COLUMN IF NOT EXISTS roster_status TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE choir_sessions ADD COLUMN IF NOT EXISTS roster_published_at TIMESTAMPTZ;
-- The rule used for the suggestions: minimum rehearsal %, over how many weeks
ALTER TABLE choir_sessions ADD COLUMN IF NOT EXISTS roster_min_rate INT;
ALTER TABLE choir_sessions ADD COLUMN IF NOT EXISTS roster_weeks INT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choir_sessions_roster_status') THEN
    ALTER TABLE choir_sessions ADD CONSTRAINT choir_sessions_roster_status CHECK (roster_status IN ('NONE', 'DRAFT', 'PUBLISHED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_roster (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     UUID NOT NULL REFERENCES choir_sessions(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL REFERENCES choir_members(id) ON DELETE CASCADE,
  role           TEXT,
  -- rehearsal attendance (%) when they were put on the roster
  rate           INT CHECK (rate IS NULL OR rate BETWEEN 0 AND 100),
  response       TEXT NOT NULL DEFAULT 'PENDING' CHECK (response IN ('PENDING', 'CONFIRMED', 'DECLINED')),
  response_note  TEXT,
  responded_at   TIMESTAMPTZ,
  -- told in the bot / website (set when the roster is published)
  notified_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_service_roster UNIQUE (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_service_roster_member ON service_roster(member_id);

CREATE TABLE IF NOT EXISTS vestments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL,
  size        TEXT,
  condition   TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('GOOD', 'WORN', 'DAMAGED')),
  -- OUT while a loan is open; REPAIR / RETIRED / LOST are set by the leader
  status      TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OUT', 'REPAIR', 'RETIRED', 'LOST')),
  notes       TEXT,
  created_by  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vestment_loans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vestment_id       UUID NOT NULL REFERENCES vestments(id) ON DELETE CASCADE,
  person_id         UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES choir_sessions(id) ON DELETE SET NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by         UUID REFERENCES system_users(id) ON DELETE SET NULL,
  due_on            DATE NOT NULL,
  returned_at       TIMESTAMPTZ,
  received_by       UUID REFERENCES system_users(id) ON DELETE SET NULL,
  return_condition  TEXT CHECK (return_condition IS NULL OR return_condition IN ('GOOD', 'WORN', 'DAMAGED', 'LOST')),
  notes             TEXT,
  reminded_at       TIMESTAMPTZ
);

-- A vestment can be out with one person at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_vestment_open_loan ON vestment_loans(vestment_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vestment_loans_person ON vestment_loans(person_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_vestment_loans_session ON vestment_loans(session_id);

DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['service_roster', 'vestments', 'vestment_loans'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Server only
ALTER TABLE service_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE vestments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vestment_loans      ENABLE ROW LEVEL SECURITY;
