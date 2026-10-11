-- =============================================================================
-- SSMS — Migration 023: Student portal
-- Depends on: 002 (roles, permissions, role_permissions), 004 (seed)
-- Apply via: Supabase Dashboard → SQL Editor. Safe to re-run.
-- =============================================================================
-- • Students sign in with their registration number (REG-YYYY-NNNN) and a
--   6-digit PIN. Their account is an ordinary system user (username = reg no)
--   with the STUDENT role, which has a single permission: STUDENT_PORTAL.
-- • STUDENT_PORTAL opens only the "My …" pages (/dashboard/my), and every one
--   of them loads only the signed-in student's own exams, results and
--   attendance on the server.
-- • Staff create the logins and reset PINs under People → Student logins
--   (STUDENT_CREATE or USER_MANAGE).
-- =============================================================================

INSERT INTO permissions (code, name_en, name_am, category)
VALUES ('STUDENT_PORTAL', 'Student portal (own exams, results, attendance)', 'የተማሪ ገጽ (የራስ ፈተና፣ ውጤትና ክትትል)', 'ACADEMIC')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'STUDENT', 'Student', 'ተማሪ',
       'Signs in with the registration number and PIN; sees only their own exams, results and attendance',
       'በምዝገባ ቁጥርና በሚስጥር ቁጥር ይገባል፤ የራሱን ፈተና፣ ውጤትና ክትትል ብቻ ያያል',
       FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'STUDENT');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'STUDENT_PORTAL'
WHERE r.code = 'STUDENT'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- The portal is for students only: no staff role carries it (e.g. a "grant
-- everything to SUPER_ADMIN" step in an earlier migration that is run again)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.code = 'STUDENT_PORTAL'
  AND r.code <> 'STUDENT';
