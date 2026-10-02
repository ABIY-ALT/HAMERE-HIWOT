-- =============================================================================
-- SSMS Phase 2 — Migration 005: Education (students, classes, attendance, grades)
-- Depends on: 001 (enums), 002 (persons, set_updated_at), 003 (auth_user_has_permission)
-- Apply via: Supabase Dashboard → SQL Editor (after 001–004)
-- =============================================================================
-- DESIGN NOTES:
-- • A student is a persons row (name, gender, birth date, baptismal name,
--   father of confession live there) plus a students row (reg_no, status).
-- • Class membership is per academic year (enrollments), so history is kept
--   and promotion to the next grade is a new enrollment, not an overwrite.
-- • Attendance is stored per student per session (attendance_records), not as
--   present/absent totals. Totals are derived with a query/view.
-- • Permissions reuse existing codes: STUDENT_*, ATTENDANCE_*, GRADE_*.
--   Structure tables (years/classes/subjects) are managed with STUDENT_UPDATE.
-- =============================================================================

CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TYPE academic_year_status AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- =============================================================================
-- ACADEMIC YEARS
-- =============================================================================

CREATE TABLE academic_years (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,                 -- e.g. 2025/2026
  name_am     TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  status      academic_year_status NOT NULL DEFAULT 'PLANNED',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_academic_year_dates CHECK (end_date > start_date)
);

-- Only one current academic year at a time
CREATE UNIQUE INDEX uq_academic_years_current
  ON academic_years (is_current) WHERE is_current;

-- =============================================================================
-- CLASSES
-- =============================================================================

CREATE TABLE classes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year_id   UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  name_en            TEXT NOT NULL,
  name_am            TEXT,
  grade_level        SMALLINT NOT NULL CHECK (grade_level > 0),
  teacher_person_id  UUID REFERENCES persons(id) ON DELETE SET NULL,
  capacity           SMALLINT CHECK (capacity IS NULL OR capacity > 0),
  room               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year_id, name_en)
);

CREATE INDEX idx_classes_year    ON classes(academic_year_id);
CREATE INDEX idx_classes_teacher ON classes(teacher_person_id);

-- =============================================================================
-- SUBJECTS
-- =============================================================================

CREATE TABLE subjects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE,                 -- e.g. BIBL-101
  name_en     TEXT NOT NULL,
  name_am     TEXT,
  min_grade   SMALLINT NOT NULL DEFAULT 1 CHECK (min_grade > 0),
  credits     SMALLINT NOT NULL DEFAULT 1 CHECK (credits > 0),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- STUDENTS (+ guardians)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS student_reg_seq;

-- Generates REG-YYYY-XXXX
CREATE OR REPLACE FUNCTION generate_student_reg_no()
RETURNS TEXT AS $$
BEGIN
  RETURN 'REG-' || TO_CHAR(NOW(), 'YYYY') || '-'
         || LPAD(nextval('student_reg_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE students (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id        UUID NOT NULL UNIQUE REFERENCES persons(id) ON DELETE RESTRICT,
  reg_no           TEXT NOT NULL UNIQUE DEFAULT generate_student_reg_no(),
  status           member_status NOT NULL DEFAULT 'ACTIVE',
  enrollment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_status ON students(status);

-- A student can have several guardians; a guardian can have several students.
CREATE TABLE student_guardians (
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  relationship         TEXT NOT NULL,               -- Mother, Father, Uncle, ...
  is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (student_id, guardian_person_id)
);

CREATE UNIQUE INDEX uq_student_primary_guardian
  ON student_guardians (student_id) WHERE is_primary;

-- =============================================================================
-- ENROLLMENTS (class membership per academic year; keeps history)
-- =============================================================================

CREATE TABLE enrollments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  status            member_status NOT NULL DEFAULT 'ACTIVE',
  enrolled_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one class per student per academic year
  UNIQUE (student_id, academic_year_id)
);

CREATE INDEX idx_enrollments_class ON enrollments(class_id);

-- =============================================================================
-- ATTENDANCE (per student per session)
-- =============================================================================

CREATE TABLE attendance_sessions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id           UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  session_date       DATE NOT NULL,
  topic_en           TEXT,
  topic_am           TEXT,
  teacher_person_id  UUID REFERENCES persons(id) ON DELETE SET NULL,
  status             workflow_status NOT NULL DEFAULT 'DRAFT',
  recorded_by        UUID REFERENCES system_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one session per class per day
  UNIQUE (class_id, session_date)
);

CREATE INDEX idx_att_sessions_date ON attendance_sessions(session_date);

CREATE TABLE attendance_records (
  session_id  UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status      attendance_status NOT NULL DEFAULT 'PRESENT',
  note        TEXT,
  PRIMARY KEY (session_id, student_id)
);

-- "Show one student's attendance history" query path
CREATE INDEX idx_att_records_student ON attendance_records(student_id);

-- Per-session totals (replaces the old stored present/absent/late/excused counts)
CREATE VIEW attendance_session_totals
WITH (security_invoker = true) AS
SELECT
  s.id AS session_id,
  COUNT(*) FILTER (WHERE r.status = 'PRESENT') AS present,
  COUNT(*) FILTER (WHERE r.status = 'ABSENT')  AS absent,
  COUNT(*) FILTER (WHERE r.status = 'LATE')    AS late,
  COUNT(*) FILTER (WHERE r.status = 'EXCUSED') AS excused
FROM attendance_sessions s
LEFT JOIN attendance_records r ON r.session_id = s.id
GROUP BY s.id;

-- =============================================================================
-- GRADES
-- =============================================================================

CREATE TABLE grades (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  term              SMALLINT NOT NULL DEFAULT 1 CHECK (term BETWEEN 1 AND 4),
  continuous_score  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (continuous_score BETWEEN 0 AND 30),
  final_score       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (final_score BETWEEN 0 AND 70),
  total_score       NUMERIC(5,2) GENERATED ALWAYS AS (continuous_score + final_score) STORED,
  status            workflow_status NOT NULL DEFAULT 'PENDING',
  entered_by        UUID REFERENCES system_users(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES system_users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, subject_id, academic_year_id, term)
);

CREATE INDEX idx_grades_student ON grades(student_id);
CREATE INDEX idx_grades_status  ON grades(status);

-- =============================================================================
-- updated_at TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_academic_years_updated_at BEFORE UPDATE ON academic_years
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_classes_updated_at BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subjects_updated_at BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_att_sessions_updated_at BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_grades_updated_at BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- Same rule as 003: every policy checks a named permission; no FOR ALL.
-- =============================================================================

ALTER TABLE academic_years       ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians    ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades               ENABLE ROW LEVEL SECURITY;

-- Structure tables: read with STUDENT_VIEW, write with STUDENT_UPDATE
CREATE POLICY academic_years_select ON academic_years FOR SELECT
  USING (auth_user_has_permission('STUDENT_VIEW'));
CREATE POLICY academic_years_insert ON academic_years FOR INSERT
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY academic_years_update ON academic_years FOR UPDATE
  USING (auth_user_has_permission('STUDENT_UPDATE'))
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));

CREATE POLICY classes_select ON classes FOR SELECT
  USING (auth_user_has_permission('STUDENT_VIEW'));
CREATE POLICY classes_insert ON classes FOR INSERT
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY classes_update ON classes FOR UPDATE
  USING (auth_user_has_permission('STUDENT_UPDATE'))
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));

CREATE POLICY subjects_select ON subjects FOR SELECT
  USING (auth_user_has_permission('STUDENT_VIEW'));
CREATE POLICY subjects_insert ON subjects FOR INSERT
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY subjects_update ON subjects FOR UPDATE
  USING (auth_user_has_permission('STUDENT_UPDATE'))
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));

-- Students
CREATE POLICY students_select ON students FOR SELECT
  USING (auth_user_has_permission('STUDENT_VIEW'));
CREATE POLICY students_insert ON students FOR INSERT
  WITH CHECK (auth_user_has_permission('STUDENT_CREATE'));
CREATE POLICY students_update ON students FOR UPDATE
  USING (auth_user_has_permission('STUDENT_UPDATE'))
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY students_delete ON students FOR DELETE
  USING (auth_user_has_permission('STUDENT_DELETE'));

CREATE POLICY student_guardians_select ON student_guardians FOR SELECT
  USING (auth_user_has_permission('STUDENT_VIEW'));
CREATE POLICY student_guardians_insert ON student_guardians FOR INSERT
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY student_guardians_update ON student_guardians FOR UPDATE
  USING (auth_user_has_permission('STUDENT_UPDATE'))
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY student_guardians_delete ON student_guardians FOR DELETE
  USING (auth_user_has_permission('STUDENT_UPDATE'));

CREATE POLICY enrollments_select ON enrollments FOR SELECT
  USING (auth_user_has_permission('STUDENT_VIEW'));
CREATE POLICY enrollments_insert ON enrollments FOR INSERT
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));
CREATE POLICY enrollments_update ON enrollments FOR UPDATE
  USING (auth_user_has_permission('STUDENT_UPDATE'))
  WITH CHECK (auth_user_has_permission('STUDENT_UPDATE'));

-- Attendance
CREATE POLICY att_sessions_select ON attendance_sessions FOR SELECT
  USING (auth_user_has_permission('ATTENDANCE_VIEW'));
CREATE POLICY att_sessions_insert ON attendance_sessions FOR INSERT
  WITH CHECK (auth_user_has_permission('ATTENDANCE_RECORD'));
CREATE POLICY att_sessions_update ON attendance_sessions FOR UPDATE
  USING (auth_user_has_permission('ATTENDANCE_UPDATE'))
  WITH CHECK (auth_user_has_permission('ATTENDANCE_UPDATE'));

CREATE POLICY att_records_select ON attendance_records FOR SELECT
  USING (auth_user_has_permission('ATTENDANCE_VIEW'));
CREATE POLICY att_records_insert ON attendance_records FOR INSERT
  WITH CHECK (auth_user_has_permission('ATTENDANCE_RECORD'));
CREATE POLICY att_records_update ON attendance_records FOR UPDATE
  USING (auth_user_has_permission('ATTENDANCE_UPDATE'))
  WITH CHECK (auth_user_has_permission('ATTENDANCE_UPDATE'));

-- Grades: entering needs GRADE_CREATE; changing needs GRADE_UPDATE.
-- Approval (status → APPROVED, approved_by/at) is a separate permission and
-- must be enforced in the server action that approves; RLS here only gates
-- who may update rows at all.
CREATE POLICY grades_select ON grades FOR SELECT
  USING (auth_user_has_permission('GRADE_VIEW'));
CREATE POLICY grades_insert ON grades FOR INSERT
  WITH CHECK (auth_user_has_permission('GRADE_CREATE'));
CREATE POLICY grades_update ON grades FOR UPDATE
  USING (auth_user_has_permission('GRADE_UPDATE') OR auth_user_has_permission('GRADE_APPROVE'))
  WITH CHECK (auth_user_has_permission('GRADE_UPDATE') OR auth_user_has_permission('GRADE_APPROVE'));
