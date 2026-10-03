-- =============================================================================
-- SSMS — Migration 017: Push notifications
-- Depends on: 002 (system_users)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- One row per phone / browser that agreed to receive notifications. The
-- server sends to the signed-in user's devices when something needs them
-- (a request to approve, a decision on their request, grades to approve…).
-- Only the server reads this table: RLS is on with no policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_user_id  UUID NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(system_user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
