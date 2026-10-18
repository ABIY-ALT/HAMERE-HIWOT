-- =============================================================================
-- SSMS — Migration 027: Telegram sign-in by phone number
-- Depends on: 024 (telegram_links)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- In the bot, a person can tap "Share my phone number" (Telegram sends the
-- number of their own account only). The bot then links the chat:
-- • relation SELF     to the people whose phone_primary is that number
--                     (members, staff, students with their own phone);
-- • relation GUARDIAN to the students whose guardian phone (the emergency
--                     contact on the student's record) is that number — so
--                     parents need no website login, and absence alerts and
--                     results for that student reach them.
-- The bot's menu (results, attendance, exams, dues) answers only about the
-- people and students linked to that chat.
-- =============================================================================

ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS relation TEXT NOT NULL DEFAULT 'SELF'
  CHECK (relation IN ('SELF', 'GUARDIAN'));
