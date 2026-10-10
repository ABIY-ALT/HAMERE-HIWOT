-- =============================================================================
-- SSMS — Migration 018: Configurable assessment weights
-- Depends on: 005 (academic_years, grades)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • Each academic year has its own assessment scheme: the parts of a grade
--   and how many of the 100 marks each part carries, e.g.
--     Attendance 10 · Assignment 15 · Mid exam 25 · Final exam 50.
--   A part marked "source": "attendance" is filled from the roll calls.
--   Existing years get the old fixed scheme (continuous 30 · final 70).
-- • grades.scores keeps what was entered, part by part, together with the
--   marks the part carried at the time:
--     [{"key": "mid", "max": 25, "score": 21}, …]
--   so a grade stays correct even if the year's weights change later.
-- • grades.total_score is now written by the server (sum of the parts)
--   instead of being computed from continuous_score + final_score.
--   continuous_score / final_score are no longer written; they are kept
--   only so nothing that already read them breaks.
-- =============================================================================

ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS assessment_scheme JSONB NOT NULL DEFAULT '[
    {"key": "continuous", "name_en": "Continuous assessment", "name_am": "ተከታታይ ምዘና", "weight": 30},
    {"key": "final", "name_en": "Final exam", "name_am": "የማጠቃለያ ፈተና", "weight": 70}
  ]'::jsonb;

-- total_score: generated column → ordinary column (values are kept)
ALTER TABLE grades ALTER COLUMN total_score DROP EXPRESSION IF EXISTS;
ALTER TABLE grades ALTER COLUMN total_score SET DEFAULT 0;
UPDATE grades SET total_score = continuous_score + final_score WHERE total_score IS NULL;
ALTER TABLE grades ALTER COLUMN total_score SET NOT NULL;
ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_total_score_range;
ALTER TABLE grades ADD CONSTRAINT grades_total_score_range CHECK (total_score BETWEEN 0 AND 100);

-- Part-by-part scores; existing grades are copied from the two old columns
ALTER TABLE grades ADD COLUMN IF NOT EXISTS scores JSONB;
UPDATE grades
SET scores = jsonb_build_array(
  jsonb_build_object('key', 'continuous', 'max', 30, 'score', continuous_score),
  jsonb_build_object('key', 'final', 'max', 70, 'score', final_score)
)
WHERE scores IS NULL;
ALTER TABLE grades ALTER COLUMN scores SET DEFAULT '[]'::jsonb;
ALTER TABLE grades ALTER COLUMN scores SET NOT NULL;
