-- =============================================================================
-- SSMS — Migration 028: Dues paid, reported in the Telegram bot
-- Depends on: 026 (member_dues), 024/027 (Telegram)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • dues_claims: a member says in the bot "I paid" — which months, how (cash,
--   bank, Telebirr…), a transaction number and/or a photo of the receipt
--   (kept by Telegram; proof_file_id). Finance approves it, which records the
--   payment exactly like Finance → Member dues → Record payment (receipt
--   number, the months, an income entry), or rejects it with a reason. The
--   member is told in the bot either way.
-- • telegram_sessions: where a chat is in a multi-step conversation (e.g. the
--   steps of reporting a payment). Short-lived; only the server uses it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS dues_claims (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id      UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  year           INT NOT NULL,
  months         SMALLINT[] NOT NULL,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),   -- the total the member says they paid
  method         TEXT NOT NULL CHECK (method IN ('CASH', 'BANK', 'TELEBIRR', 'OTHER')),
  reference      TEXT,                                          -- transaction / bank reference number
  proof_file_id  TEXT,                                          -- Telegram file id of the receipt photo
  paid_on        DATE NOT NULL,
  chat_id        BIGINT,                                        -- where to send the answer
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  receipt_no     TEXT,
  review_note    TEXT,
  reviewed_by    UUID REFERENCES system_users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dues_claims_status ON dues_claims(status, created_at);

CREATE TABLE IF NOT EXISTS telegram_sessions (
  chat_id     BIGINT PRIMARY KEY,
  step        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_dues_claims ON dues_claims;
    CREATE TRIGGER trg_audit_dues_claims AFTER INSERT OR UPDATE OR DELETE ON dues_claims FOR EACH ROW EXECUTE FUNCTION audit_row_change();
  END IF;
END $$;

ALTER TABLE dues_claims       ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dues_claims_select ON dues_claims;
CREATE POLICY dues_claims_select ON dues_claims FOR SELECT USING (
  auth_user_has_permission('FINANCE_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'));
-- telegram_sessions: no policies — server only
