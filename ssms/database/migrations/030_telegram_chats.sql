-- =============================================================================
-- SSMS — Migration 030: Telegram chats keep their links up to date
-- Depends on: 024 / 027 (telegram_links)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • telegram_chats: the phone number a chat shared with "📱 Share my phone
--   number" (Telegram only lets people share their own). With it the bot can
--   link the chat again whenever the office changes the records: a second
--   child registered with the same parent phone, a member's phone added later,
--   a wrong guardian phone corrected (the old link is then removed). A number
--   that matched nobody is kept too, so the chat connects by itself once the
--   office puts the number on a record.
-- • telegram_links.via_phone: the link came from that phone number (not from
--   "Connect Telegram" on the website), so the bot may remove it when the
--   records no longer match.
-- =============================================================================

CREATE TABLE IF NOT EXISTS telegram_chats (
  chat_id        BIGINT PRIMARY KEY,
  phone          TEXT NOT NULL,            -- 09XXXXXXXX / 07XXXXXXXX
  telegram_name  TEXT,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_chats_phone ON telegram_chats(phone);

ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS via_phone BOOLEAN NOT NULL DEFAULT FALSE;

-- Parents' links (027) only ever came from a shared phone
UPDATE telegram_links SET via_phone = TRUE WHERE relation = 'GUARDIAN' AND via_phone = FALSE;

ALTER TABLE telegram_chats ENABLE ROW LEVEL SECURITY;
-- No policies: only the server reads and writes it
