-- =============================================================================
-- SSMS — Migration 021: Member registration form
-- Depends on: 002 (persons, organization_units)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- Adds the fields of the paper form "የሐመረ ሕይወት ሰንበት ትምህርት ቤት የአባላት
-- መመዝገቢያ ቅጽ" (salo_hamere_hiwot_member_form_with_logo.docx) to persons:
-- • header: registration term (20__/20__ ዓ.ም.), registration date, membership
--   type (መደበኛ / ልዩ መደበኛ / የክብር አባል). The photo goes in the existing
--   profile_photo_url as a path in the private bucket "member-photos".
-- • ፩ personal & family: father's and mother's full name, marital status,
--   education level, profession, workplace, woreda, house number
--   (sub-city stays in address).
-- • ፪ spiritual & service: served in another Sunday school before (where, what
--   role), preferred service departments (+ other).
-- • ፫ emergency contact: relationship.
-- • ፬ declaration: signed or not.
-- • ፭ office use: assigned department, secretary who registered, approval by
--   the chairperson / general secretary and its date.
-- =============================================================================

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS registration_term           TEXT,
  ADD COLUMN IF NOT EXISTS registered_on               DATE,
  ADD COLUMN IF NOT EXISTS membership_type             TEXT CHECK (membership_type IN ('REGULAR', 'SPECIAL', 'HONORARY')),
  ADD COLUMN IF NOT EXISTS father_name                 TEXT,
  ADD COLUMN IF NOT EXISTS mother_name                 TEXT,
  ADD COLUMN IF NOT EXISTS marital_status              TEXT CHECK (marital_status IN ('MARRIED', 'SINGLE')),
  ADD COLUMN IF NOT EXISTS education_level             TEXT,
  ADD COLUMN IF NOT EXISTS profession                  TEXT,
  ADD COLUMN IF NOT EXISTS workplace                   TEXT,
  ADD COLUMN IF NOT EXISTS woreda                      TEXT,
  ADD COLUMN IF NOT EXISTS house_no                    TEXT,
  ADD COLUMN IF NOT EXISTS served_elsewhere            BOOLEAN,
  ADD COLUMN IF NOT EXISTS previous_school             TEXT,
  ADD COLUMN IF NOT EXISTS previous_role               TEXT,
  ADD COLUMN IF NOT EXISTS preferred_departments       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_department_other  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation  TEXT,
  ADD COLUMN IF NOT EXISTS declaration_signed          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assigned_unit_id            UUID REFERENCES organization_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registered_by_name          TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_name            TEXT,
  ADD COLUMN IF NOT EXISTS approved_on                 DATE;

CREATE INDEX IF NOT EXISTS idx_persons_assigned_unit ON persons(assigned_unit_id);

-- Private bucket: no storage policies, so only the server (service role) can read or write it
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-photos', 'member-photos', FALSE)
ON CONFLICT (id) DO NOTHING;
