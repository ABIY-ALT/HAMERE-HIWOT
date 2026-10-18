-- =============================================================================
-- SSMS — Migration 024: Telegram bot
-- Depends on: 002 (persons, system_users)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • telegram_links: a person's Telegram chat(s). Made when the person taps
--   "Connect Telegram" in the app and then Start in the bot (a one-time code
--   from telegram_link_codes ties the chat to the person). /stop removes it.
-- • Messages go to linked chats only: the staff notifications that are also
--   sent as phone notifications, absence alerts and new results for students
--   and their parents, and messages staff send to a group (telegram_broadcasts).
-- • Only the server (service role) reads or writes these tables.
-- The bot needs one setting on the server: TELEGRAM_BOT_TOKEN (from @BotFather).
-- =============================================================================

CREATE TABLE IF NOT EXISTS telegram_links (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  chat_id        BIGINT NOT NULL,
  telegram_name  TEXT,
  linked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chat_id);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code        TEXT PRIMARY KEY,
  person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_broadcasts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audience    TEXT NOT NULL,
  message     TEXT NOT NULL,
  recipients  INT NOT NULL DEFAULT 0,   -- linked chats it was sent to
  delivered   INT NOT NULL DEFAULT 0,
  sent_by     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Server only: no policies, so the public API key cannot read chats or codes
ALTER TABLE telegram_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_broadcasts ENABLE ROW LEVEL SECURITY;
