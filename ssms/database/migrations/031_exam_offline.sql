-- =============================================================================
-- SSMS — Migration 031: An online exam keeps going when the network drops
-- Depends on: 022 (exam_attempts)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- A student whose phone loses the network keeps answering; the answers stay on
-- the phone and are sent when it is back. Answers written before the time was
-- up still count when they arrive up to 10 minutes after it. How late they
-- arrived is kept for the teacher (shown on the exam's results), since the
-- phone's word is all there is for when they were written.
-- =============================================================================

ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS late_sync_seconds INT NOT NULL DEFAULT 0;
