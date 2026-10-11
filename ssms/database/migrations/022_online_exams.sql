-- =============================================================================
-- SSMS — Migration 022: Online exams
-- Depends on: 005 (classes, subjects, students, academic_years, grades),
--             018 (assessment scheme), 011 (audit, optional)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • exams: a teacher's exam for one class and subject in a term. Its result can
--   fill one part of the year's assessment scheme (part_key, e.g. "mid"): the
--   score is scaled to that part's marks and written to grades as PENDING.
--   DRAFT (questions are written) → OPEN (students can sit it) → CLOSED.
-- • exam_questions: multiple choice, true/false or short answer. The right
--   answer never leaves the server; short answers are marked by the teacher.
-- • exam_attempts: one per student, created when the exam is opened. `ticket`
--   is the code printed for the student, who types it on /exam — students do
--   not need an account. The server keeps time (started_at + duration, plus
--   extra_minutes when the teacher gives that student extra time).
-- • Against someone else sitting a student's exam: the ticket is locked to the
--   phone that starts it (device_id, a cookie), a phone can sit only one
--   student's exam, and starting needs the room key the teacher shows in class
--   (start_key). Tries are counted for the teacher (blocked_tries,
--   tried_other_codes); the teacher can allow another phone or give a new code.
-- • Leaving the exam page is counted (focus_lost) and timed (away_seconds);
--   with leave_limit set, the exam is handed in after that many times.
-- Permissions: GRADE_VIEW (see), GRADE_CREATE (write, open, mark, send to grades).
-- =============================================================================

CREATE TABLE IF NOT EXISTS exams (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title              TEXT NOT NULL,
  instructions       TEXT,
  class_id           UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id         UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  academic_year_id   UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  term               SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 4),
  part_key           TEXT,
  duration_minutes   INT NOT NULL CHECK (duration_minutes BETWEEN 1 AND 300),
  shuffle            BOOLEAN NOT NULL DEFAULT TRUE,
  show_score         BOOLEAN NOT NULL DEFAULT TRUE,
  status             TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  opened_at          TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  sent_to_grades_at  TIMESTAMPTZ,
  created_by         UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id);

CREATE TABLE IF NOT EXISTS exam_questions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id     UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL CHECK (kind IN ('CHOICE', 'TRUE_FALSE', 'SHORT')),
  prompt      TEXT NOT NULL,
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- CHOICE: ["…", "…"]
  answer      TEXT,                                  -- CHOICE: option number ("0"…); TRUE_FALSE: "true"/"false"; SHORT: model answer
  marks       NUMERIC(5,2) NOT NULL CHECK (marks > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id, position);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id        UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  ticket         TEXT NOT NULL UNIQUE,
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  answers        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {question id: answer}
  marks          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {question id: marks given}
  score          NUMERIC(6,2),
  needs_marking  BOOLEAN NOT NULL DEFAULT FALSE,
  focus_lost     INT NOT NULL DEFAULT 0,              -- times the student left the exam page
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, student_id)
);

-- Extra time for one student (a phone that died, a student who needs longer); added to the exam time
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS extra_minutes INT NOT NULL DEFAULT 0 CHECK (extra_minutes >= 0);

-- Exam rules: room key to start, and hand-in after leaving the page too often (0 = off)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS use_start_key BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_key     TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS leave_limit   INT NOT NULL DEFAULT 0 CHECK (leave_limit BETWEEN 0 AND 20);

-- One student, one phone: the phone that started the exam, and what was tried
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS device_id          TEXT;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS new_device_allowed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS device_changes     INT NOT NULL DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS blocked_tries      INT NOT NULL DEFAULT 0;  -- this code tried on another phone
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS tried_other_codes  INT NOT NULL DEFAULT 0;  -- this student's phone tried another student's code
-- Leaving the page: total time away, and since when while away
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS away_seconds       INT NOT NULL DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS left_at            TIMESTAMPTZ;
-- How the exam ended: handed in by the student, time up, teacher closed it, or left the page too often
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS ended_reason       TEXT CHECK (ended_reason IN ('STUDENT', 'TIME', 'CLOSED', 'LEFT_PAGE'));

CREATE INDEX IF NOT EXISTS idx_exam_attempts_device ON exam_attempts(exam_id, device_id);

DROP TRIGGER IF EXISTS trg_exams_updated_at ON exams;
CREATE TRIGGER trg_exams_updated_at BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exams and questions are audited; attempts are not (answers are saved every few seconds)
DO $$
DECLARE t TEXT;
BEGIN
  IF to_regproc('audit_row_change') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['exams', 'exam_questions'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END LOOP;
  END IF;
END $$;

-- Row level security: the answers must never be readable with the public key.
-- Students reach their exam only through the server (service role) with their ticket.
ALTER TABLE exams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['exams', 'exam_questions', 'exam_attempts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_select ON %1$I FOR SELECT USING (
      auth_user_has_permission('GRADE_VIEW') OR auth_user_has_permission('AUDIT_VIEW_ALL'))$p$, t);
  END LOOP;
END $$;
