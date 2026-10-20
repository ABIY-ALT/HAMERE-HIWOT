-- =============================================================================
-- SSMS — Migration 033: Questions to departments from the Telegram bot
-- Depends on: 002 (organization_units), 024 (Telegram), 019 (TASK_ASSIGN / TASK_REPORT)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- A connected member (or parent) taps "✉️ Ask a department" in the bot, picks
-- the department and writes the question. The department's heads see it on
-- the website (Members' questions) and answer; the answer goes back to the
-- chat. Same people as Tasks: TASK_REPORT for their own units, TASK_ASSIGN
-- for all, AUDIT_VIEW_ALL to read.
-- =============================================================================

CREATE TABLE IF NOT EXISTS member_questions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id      UUID NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  chat_id      BIGINT NOT NULL,
  person_id    UUID REFERENCES persons(id) ON DELETE SET NULL,   -- who asked (their own record, when linked as themselves)
  asker_name   TEXT,                                             -- names of the chat's people, or its Telegram name
  question     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED')),
  answer       TEXT,
  answered_by  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  answered_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_questions_unit ON member_questions(unit_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_member_questions_chat ON member_questions(chat_id, created_at);

DO $$
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_member_questions ON member_questions;
    CREATE TRIGGER trg_audit_member_questions AFTER INSERT OR UPDATE OR DELETE ON member_questions FOR EACH ROW EXECUTE FUNCTION audit_row_change();
  END IF;
END $$;

ALTER TABLE member_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_questions_select ON member_questions;
CREATE POLICY member_questions_select ON member_questions FOR SELECT USING (
  auth_user_has_permission('TASK_ASSIGN') OR auth_user_has_permission('TASK_REPORT') OR auth_user_has_permission('AUDIT_VIEW_ALL'));
