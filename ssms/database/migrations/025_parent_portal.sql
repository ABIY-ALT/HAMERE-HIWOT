-- =============================================================================
-- SSMS — Migration 025: Parent portal
-- Depends on: 002 (roles, permissions), 005 (student_guardians), 023
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • Parents sign in with their phone number and a 6-digit PIN. The account has
--   the PARENT role, whose single permission PARENT_PORTAL opens only
--   /dashboard/family: their own children's results, attendance and exams.
-- • A parent's children are the student_guardians rows that point at the
--   parent's person. Staff create them under People → Parent logins, from the
--   guardian phone recorded on each student; a staff member who is also a
--   parent gets the PARENT role on their existing account.
-- • Absence alerts and new results go to linked parents on Telegram (024).
-- • persons.is_guardian_only marks a parent's record made only for the login,
--   so they do not show up as members (registry, dues).
-- =============================================================================

INSERT INTO permissions (code, name_en, name_am, category)
VALUES ('PARENT_PORTAL', 'Parent portal (own children''s results, attendance, exams)', 'የወላጅ ገጽ (የልጆች ውጤት፣ ክትትልና ፈተና)', 'ACADEMIC')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'PARENT', 'Parent / guardian', 'ወላጅ / አሳዳጊ',
       'Signs in with their phone number and PIN; sees only their own children''s results, attendance and exams',
       'በስልክ ቁጥርና በሚስጥር ቁጥር ይገባል፤ የልጆቹን ውጤት፣ ክትትልና ፈተና ብቻ ያያል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'PARENT');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'PARENT_PORTAL'
WHERE r.code = 'PARENT'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- The portal permissions belong to the portal roles only
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND ((p.code = 'PARENT_PORTAL' AND r.code <> 'PARENT') OR (p.code = 'STUDENT_PORTAL' AND r.code <> 'STUDENT'));

-- A parent who is not a member themself: kept out of the members registry and dues
ALTER TABLE persons ADD COLUMN IF NOT EXISTS is_guardian_only BOOLEAN NOT NULL DEFAULT FALSE;

-- "Which children does this parent have?"
CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian ON student_guardians(guardian_person_id);
