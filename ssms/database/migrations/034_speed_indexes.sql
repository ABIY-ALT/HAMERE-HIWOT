-- =============================================================================
-- SSMS — Migration 034: Indexes for lookups that run often
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run. Changes no data.
-- =============================================================================
-- Each one serves a lookup that runs on many page loads or on every bot
-- message, and was not yet covered by another index or unique constraint.
-- =============================================================================

-- The bot's dues answers and "💳 I paid": a member's waiting payment reports
CREATE INDEX IF NOT EXISTS idx_dues_claims_person ON dues_claims(person_id, status);

-- The student portal, the bot and report cards: a student's online exams
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON exam_attempts(student_id);

-- Education pages and Telegram class audiences: this year's enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_year ON enrollments(academic_year_id, status);

-- Education pages and reports: this year's grades
CREATE INDEX IF NOT EXISTS idx_grades_year ON grades(academic_year_id, term);
