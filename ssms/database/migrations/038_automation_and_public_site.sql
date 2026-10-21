-- =============================================================================
-- SSMS — Migration 038: Daily automation and the public website
-- Depends on: 006 (system_settings), 013 (programs), 033 (member_questions)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- Daily automation (GET /api/cron, called once a day by an outside timer):
-- • automation_log remembers every reminder already sent (job + what it was
--   about), so a second run on the same day — or two runs at once — never
--   sends the same reminder twice.
-- • What runs is chosen under Administration → Automation (system_settings
--   "automation"); the last run's results are kept there too.
-- The public website (/, /about, /events, /contact — no sign-in):
-- • programs.is_public: only programs the office marks "Show on the public
--   website" appear there, and only those get the day-before reminder that
--   goes to everyone connected to the bot.
-- • member_questions can come from the website's contact form: no Telegram
--   chat, a phone number instead, source = 'WEB'. The department answers on
--   the same Members' questions page and calls them back.
-- =============================================================================

CREATE TABLE IF NOT EXISTS automation_log (
  job         TEXT NOT NULL,
  ref         TEXT NOT NULL,
  done_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job, ref)
);

CREATE INDEX IF NOT EXISTS idx_automation_log_day ON automation_log(done_on);

-- Server only
ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_programs_public ON programs(start_date) WHERE is_public;

ALTER TABLE member_questions ALTER COLUMN chat_id DROP NOT NULL;
ALTER TABLE member_questions ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE member_questions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'BOT';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_questions_source') THEN
    ALTER TABLE member_questions ADD CONSTRAINT member_questions_source CHECK (source IN ('BOT', 'WEB'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_questions_reply_to') THEN
    ALTER TABLE member_questions ADD CONSTRAINT member_questions_reply_to CHECK (chat_id IS NOT NULL OR contact_phone IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_questions_phone ON member_questions(contact_phone, created_at) WHERE contact_phone IS NOT NULL;
