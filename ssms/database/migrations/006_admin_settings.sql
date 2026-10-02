-- =============================================================================
-- SSMS — Migration 006: Administration (settings table, permissions, super admin)
-- Depends on: 002 (roles, permissions, role_permissions, system_users,
--             set_updated_at), 003 (auth_user_has_permission)
-- Apply via: Supabase Dashboard → SQL Editor (after 001–005). Safe to re-run.
-- =============================================================================
-- • system_settings holds the parish profile edited on Administration → Settings.
-- • Every permission code the app checks is inserted if missing.
-- • A SUPER_ADMIN system role with every permission is ensured, so the first
--   administrator (scripts/create-admin.mjs) can manage everything else.
-- =============================================================================

-- =============================================================================
-- SYSTEM SETTINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_authenticated" ON system_settings;
CREATE POLICY "settings_select_authenticated"
  ON system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "settings_insert_system_configure" ON system_settings;
CREATE POLICY "settings_insert_system_configure"
  ON system_settings FOR INSERT
  WITH CHECK (auth_user_has_permission('SYSTEM_CONFIGURE'));

DROP POLICY IF EXISTS "settings_update_system_configure" ON system_settings;
CREATE POLICY "settings_update_system_configure"
  ON system_settings FOR UPDATE
  USING (auth_user_has_permission('SYSTEM_CONFIGURE'))
  WITH CHECK (auth_user_has_permission('SYSTEM_CONFIGURE'));

-- =============================================================================
-- PERMISSIONS — every code used by the app (types/index.ts → PermissionCode)
-- =============================================================================

INSERT INTO permissions (code, name_en, name_am, category, is_active)
SELECT v.code, v.name_en, v.name_am, v.category, TRUE
FROM (VALUES
  ('STUDENT_VIEW',      'View Students',                  'ተማሪዎችን ይመልከቱ',                 'ACADEMIC'),
  ('STUDENT_CREATE',    'Register Students',              'ተማሪዎችን ይመዝግቡ',                 'ACADEMIC'),
  ('STUDENT_UPDATE',    'Update Student Records',         'የተማሪ መዝገቦችን ያዘምኑ',             'ACADEMIC'),
  ('STUDENT_DELETE',    'Delete Student Records',         'የተማሪ መዝገቦችን ሰርዙ',              'ACADEMIC'),
  ('ATTENDANCE_VIEW',   'View Attendance',                'ክትትልን ይመልከቱ',                   'ACADEMIC'),
  ('ATTENDANCE_RECORD', 'Record Attendance',              'ክትትልን ይመዝግቡ',                   'ACADEMIC'),
  ('ATTENDANCE_UPDATE', 'Update Attendance',              'ክትትልን ያዘምኑ',                    'ACADEMIC'),
  ('GRADE_VIEW',        'View Grades',                    'ውጤቶችን ይመልከቱ',                   'ACADEMIC'),
  ('GRADE_CREATE',      'Enter Grades',                   'ውጤቶችን ያስገቡ',                    'ACADEMIC'),
  ('GRADE_UPDATE',      'Update Grades',                  'ውጤቶችን ያዘምኑ',                    'ACADEMIC'),
  ('GRADE_APPROVE',     'Approve Grades',                 'ውጤቶችን ያጸድቁ',                    'ACADEMIC'),
  ('FINANCE_VIEW',      'View Finance',                   'ፋይናንስን ይመልከቱ',                  'FINANCE'),
  ('FINANCE_CREATE',    'Create Financial Records',       'የፋይናንስ መዝገቦች ይፍጠሩ',             'FINANCE'),
  ('FINANCE_APPROVE',   'Approve Financial Transactions', 'የፋይናንስ ግብይቶችን ያጸድቁ',            'FINANCE'),
  ('ASSET_VIEW',        'View Assets',                    'ንብረቶችን ይመልከቱ',                  'PROPERTY'),
  ('ASSET_CREATE',      'Register Assets',                'ንብረቶችን ይመዝግቡ',                  'PROPERTY'),
  ('ASSET_ASSIGN',      'Assign Assets',                  'ንብረቶችን ያስረክቡ',                  'PROPERTY'),
  ('ASSET_TRANSFER',    'Transfer Assets',                'ንብረቶችን ያዛውሩ',                   'PROPERTY'),
  ('AUDIT_VIEW_ALL',    'View All Audit Logs',            'ሁሉንም ኦዲት መዝገቦች ይመልከቱ',          'AUDIT'),
  ('GOVERNANCE_VIEW',   'View Governance',                'አስተዳደርን ይመልከቱ',                  'GOVERNANCE'),
  ('GOVERNANCE_MANAGE', 'Manage Governance',              'አስተዳደርን ያስተዳድሩ',                 'GOVERNANCE'),
  ('REPORT_VIEW',       'View Reports',                   'ሪፖርቶችን ይመልከቱ',                   'REPORTS'),
  ('REPORT_EXPORT',     'Export Reports',                 'ሪፖርቶችን ይላኩ',                     'REPORTS'),
  ('MEMBER_VIEW',       'View Members',                   'አባላትን ይመልከቱ',                    'PEOPLE'),
  ('MEMBER_CREATE',     'Register Members',               'አባላትን ይመዝግቡ',                    'PEOPLE'),
  ('MEMBER_UPDATE',     'Update Member Records',          'የአባል መዝገቦችን ያዘምኑ',               'PEOPLE'),
  ('USER_MANAGE',       'Manage System Users',            'የስርዓት ተጠቃሚዎችን ያስተዳድሩ',           'ADMIN'),
  ('ROLE_MANAGE',       'Manage Roles & Permissions',     'ሚናዎችን እና ፈቃዶችን ያስተዳድሩ',          'ADMIN'),
  ('SYSTEM_CONFIGURE',  'Configure System Settings',      'የስርዓት ቅንብሮችን ያዋቅሩ',              'ADMIN'),
  ('PROGRAM_VIEW',      'View Programs',                  'ፕሮግራሞችን ይመልከቱ',                  'PROGRAMS'),
  ('PROGRAM_CREATE',    'Create Programs',                'ፕሮግራሞች ይፍጠሩ',                    'PROGRAMS'),
  ('PROGRAM_MANAGE',    'Manage Programs',                'ፕሮግራሞችን ያስተዳድሩ',                 'PROGRAMS'),
  ('HR_VIEW',           'View HR Records',                'የሰው ሀብት መዝገቦችን ይመልከቱ',            'HR'),
  ('HR_MANAGE',         'Manage HR Records',              'የሰው ሀብት መዝገቦችን ያስተዳድሩ',           'HR')
) AS v(code, name_en, name_am, category)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = v.code);

-- =============================================================================
-- SUPER_ADMIN — system role holding every permission
-- =============================================================================

INSERT INTO roles (code, name_en, name_am, description_en, description_am, is_system_role, is_active)
SELECT 'SUPER_ADMIN', 'Super Administrator', 'ዋና አስተዳዳሪ',
       'Full system access — all permissions', 'ሙሉ ስርዓት መዳረሻ — ሁሉም ፈቃዶች',
       TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'SUPER_ADMIN');

UPDATE roles SET is_system_role = TRUE WHERE code = 'SUPER_ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
