-- =============================================================================
-- SSMS — Migration 007: Subject instructor & syllabus
-- Depends on: 005 (subjects)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- The Subjects page records a lead instructor and a syllabus description.
-- =============================================================================

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS instructor TEXT;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS syllabus   TEXT;
