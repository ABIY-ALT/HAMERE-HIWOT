// ─────────────────────────────────────────────────────────────────────────────
// Mock Data — Phase 1 Foundation
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true
// Mirrors the exact production database schema.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  OrganizationUnit,
  GovernanceBody,
  GovernancePosition,
  GovernanceBodyRule,
  Person,
  SystemUser,
  Role,
  Permission,
  RolePermission,
  UserUnitAssignment,
  AuditLog,
} from '@/types';

// ── Organization Units ────────────────────────────────────────────────────────

export const MOCK_ORG_UNITS: OrganizationUnit[] = [
  // Governance Layer
  {
    id: 'org-001',
    code: 'GENERAL_ASSEMBLY',
    name_en: 'General Assembly',
    name_am: 'ጠቅላላ ጉባኤ',
    unit_type: 'GENERAL_ASSEMBLY',
    ltree_path: 'general_assembly',
    parent_id: null,
    description_en: 'The supreme decision-making body of the Sunday School',
    description_am: 'የሰንበት ት/ቤቱ ጠቅላይ ውሳኔ ሰጪ አካል',
    is_active: true,
    sort_order: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-002',
    code: 'AUDIT_COMMITTEE',
    name_en: 'Performance Audit Committee',
    name_am: 'የአፈጻጸም ክትትል ጉባኤ',
    unit_type: 'AUDIT_COMMITTEE',
    ltree_path: 'general_assembly.audit_committee',
    parent_id: 'org-001',
    description_en: 'Autonomous supervisory body with read-only cross-organizational access',
    description_am: 'ሁሉን አቀፍ የቁጥጥር ስልጣን ያለው ራሱን ችሎ የሚሰራ ክትትል ጉባኤ',
    is_active: true,
    sort_order: 2,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-003',
    code: 'MANAGEMENT_BOARD',
    name_en: 'Board of Management',
    name_am: 'የሥራ አመራር ጉባኤ',
    unit_type: 'MANAGEMENT_BOARD',
    ltree_path: 'general_assembly.management_board',
    parent_id: 'org-001',
    description_en: 'Strategic governance body — exactly 9 members',
    description_am: 'ስልታዊ አስተዳደር ጉባኤ — በትክክል 9 አባላት',
    is_active: true,
    sort_order: 3,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-004',
    code: 'MANAGEMENT_SECRETARIAT',
    name_en: 'Management Secretariat',
    name_am: 'የሥራ አመራር ጽሕፈት ቤት',
    unit_type: 'MANAGEMENT_SECRETARIAT',
    ltree_path: 'general_assembly.management_board.management_secretariat',
    parent_id: 'org-003',
    description_en: 'Administrative secretariat of the Management Board',
    description_am: 'የሥራ አመራር ጉባኤ አስተዳደራዊ ጽሕፈት ቤት',
    is_active: true,
    sort_order: 4,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-005',
    code: 'ADVISORY_COUNCIL',
    name_en: 'Advisory Council',
    name_am: 'አፈጻጸም አማካሪዎች',
    unit_type: 'ADVISORY_COUNCIL',
    ltree_path: 'general_assembly.advisory_council',
    parent_id: 'org-001',
    description_en: 'Advisory body providing guidance to governance structures',
    description_am: 'ለአስተዳደር አካላት ምክር የሚሰጥ አካል',
    is_active: true,
    sort_order: 5,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-006',
    code: 'EXECUTIVE_COMMITTEE',
    name_en: 'Executive Committee',
    name_am: 'የሥራ አስፈጻሚ ጉባኤ',
    unit_type: 'EXECUTIVE_COMMITTEE',
    ltree_path: 'general_assembly.management_board.executive_committee',
    parent_id: 'org-003',
    description_en: 'Operational executive body — exactly 9 members',
    description_am: 'ስራ አስፈጻሚ አካል — በትክክል 9 አባላት',
    is_active: true,
    sort_order: 6,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-007',
    code: 'EXECUTIVE_SECRETARIAT',
    name_en: 'Executive Secretariat',
    name_am: 'የሥራ አስፈጻሚ ጽሕፈት ቤት',
    unit_type: 'EXECUTIVE_SECRETARIAT',
    ltree_path: 'general_assembly.management_board.executive_committee.executive_secretariat',
    parent_id: 'org-006',
    description_en: 'Administrative secretariat of the Executive Committee',
    description_am: 'የሥራ አስፈጻሚ ጉባኤ አስተዳደራዊ ጽሕፈት ቤት',
    is_active: true,
    sort_order: 7,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  // Seven Coordinations
  {
    id: 'org-c01',
    code: 'COORD_PLANNING',
    name_en: 'Planning, Monitoring & Evaluation Coordination',
    name_am: 'እቅድ፣ ክትትልና ግምገማ ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_planning',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 10,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-c02',
    code: 'COORD_MEDIA',
    name_en: 'Media & Public Relations Coordination',
    name_am: 'ሚዲያ እና ሕዝብ ግንኙነት ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_media',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 11,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-c03',
    code: 'COORD_EDUCATION',
    name_en: 'Education & Patristics Coordination',
    name_am: 'ትምህርት እና ፓትሪስቲክስ ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_education',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 12,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-c04',
    code: 'COORD_MEMBERS',
    name_en: 'Members & Organizational Structure Coordination',
    name_am: 'አባላትና ድርጅታዊ መዋቅር ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_members',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 13,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-c05',
    code: 'COORD_INFO',
    name_en: 'Information & Current Affairs Coordination',
    name_am: 'መረጃ እና ወቅታዊ ጉዳዮች ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_info',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 14,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-c06',
    code: 'COORD_RESOURCE',
    name_en: 'Resource Mobilization & Social Services Coordination',
    name_am: 'ሀብት ማሰባሰብ እና ማህበራዊ አገልግሎት ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_resource',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 15,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-c07',
    code: 'COORD_FINANCE',
    name_en: 'Finance & Property Administration Coordination',
    name_am: 'ፋይናንስ እና ንብረት አስተዳደር ቅንጅት',
    unit_type: 'COORDINATION',
    ltree_path: 'general_assembly.management_board.executive_committee.coord_finance',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 16,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  // Seven Departments
  {
    id: 'org-d01',
    code: 'DEPT_EDUCATION',
    name_en: 'Education & Training Department',
    name_am: 'ትምህርትና ስልጠና ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_education',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 20,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-d02',
    code: 'DEPT_PROGRAMS',
    name_en: 'Programs & Assemblies Department',
    name_am: 'ፕሮግራምና ስብሰባ ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_programs',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 21,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-d03',
    code: 'DEPT_INTERNAL_RELATIONS',
    name_en: 'Information & Internal Relations Department',
    name_am: 'መረጃ እና ውስጣዊ ግንኙነት ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_internal_relations',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 22,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-d04',
    code: 'DEPT_SACRED_ARTS',
    name_en: 'Hymnody, Choir & Sacred Arts Department',
    name_am: 'ዜማ፣ ዘማሪ እና ቅዱስ ጥበብ ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_sacred_arts',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 23,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-d05',
    code: 'DEPT_HR',
    name_en: 'Human Resources Administration Department',
    name_am: 'የሰው ሀብት አስተዳደር ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_hr',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 24,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-d06',
    code: 'DEPT_DEVELOPMENT',
    name_en: 'Development & Investment Department',
    name_am: 'ልማትና ኢንቨስትመንት ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_development',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 25,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-d07',
    code: 'DEPT_FINANCE_PROPERTY',
    name_en: 'Budget & Property Management Department',
    name_am: 'በጀትና ንብረት አስተዳደር ክፍል',
    unit_type: 'DEPARTMENT',
    ltree_path: 'general_assembly.management_board.executive_committee.dept_finance_property',
    parent_id: 'org-006',
    description_en: null,
    description_am: null,
    is_active: true,
    sort_order: 26,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// ── Governance Bodies ─────────────────────────────────────────────────────────

export const MOCK_GOVERNANCE_BODIES: GovernanceBody[] = [
  {
    id: 'gb-001',
    organization_unit_id: 'org-001',
    name_en: 'General Assembly',
    name_am: 'ጠቅላላ ጉባኤ',
    description_en: 'Supreme decision-making body',
    description_am: 'ጠቅላይ ውሳኔ ሰጪ አካል',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'gb-002',
    organization_unit_id: 'org-002',
    name_en: 'Performance Audit Committee',
    name_am: 'የአፈጻጸም ክትትል ጉባኤ',
    description_en: 'Autonomous supervisory body',
    description_am: 'ራሱን ችሎ የሚሰራ ክትትል ጉባኤ',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'gb-003',
    organization_unit_id: 'org-003',
    name_en: 'Board of Management',
    name_am: 'የሥራ አመራር ጉባኤ',
    description_en: 'Strategic governance body — exactly 9 members',
    description_am: 'ስልታዊ አስተዳደር ጉባኤ — 9 አባላት',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'gb-004',
    organization_unit_id: 'org-006',
    name_en: 'Executive Committee',
    name_am: 'የሥራ አስፈጻሚ ጉባኤ',
    description_en: 'Operational executive body — exactly 9 members',
    description_am: 'ስራ አስፈጻሚ አካል — 9 አባላት',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// ── Governance Body Rules ─────────────────────────────────────────────────────

export const MOCK_GOVERNANCE_RULES: GovernanceBodyRule[] = [
  {
    id: 'rule-001',
    body_id: 'gb-003',
    rule_code: 'EXACT_MEMBER_COUNT',
    rule_value: '9',
    description_en: 'Management Board must have exactly 9 active members',
    description_am: 'የሥራ አመራር ጉባኤ በትክክል 9 ንቁ አባላት ሊኖሩት ይገባል',
    is_enforced: true,
  },
  {
    id: 'rule-002',
    body_id: 'gb-004',
    rule_code: 'EXACT_MEMBER_COUNT',
    rule_value: '9',
    description_en: 'Executive Committee must have exactly 9 active members',
    description_am: 'የሥራ አስፈጻሚ ጉባኤ በትክክል 9 ንቁ አባላት ሊኖሩት ይገባል',
    is_enforced: true,
  },
];

// ── Governance Positions ──────────────────────────────────────────────────────

export const MOCK_GOVERNANCE_POSITIONS: GovernancePosition[] = [
  { id: 'pos-001', code: 'CHAIRPERSON', name_en: 'Chairperson', name_am: 'ሰብሳቢ', authority_level: 1, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-002', code: 'VICE_CHAIR', name_en: 'Vice Chairperson', name_am: 'ምክትል ሰብሳቢ', authority_level: 2, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-003', code: 'SECRETARY', name_en: 'Secretary', name_am: 'ጸሐፊ', authority_level: 3, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-004', code: 'TREASURER', name_en: 'Treasurer', name_am: 'ያዥ', authority_level: 4, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-005', code: 'MEMBER', name_en: 'Member', name_am: 'አባል', authority_level: 9, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-006', code: 'COORDINATOR', name_en: 'Coordinator', name_am: 'አስተባባሪ', authority_level: 5, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-007', code: 'DEPT_HEAD', name_en: 'Department Head', name_am: 'የክፍል ኃላፊ', authority_level: 5, is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 'pos-008', code: 'ADVISOR', name_en: 'Advisor', name_am: 'አማካሪ', authority_level: 4, is_active: true, created_at: '2024-01-01T00:00:00Z' },
];

// ── Persons ───────────────────────────────────────────────────────────────────

export const MOCK_PERSONS: Person[] = [
  {
    id: 'person-001',
    membership_code: 'MBR-2024-0001',
    full_name_en: 'Abebe Bekele',
    full_name_am: 'አበበ በቀለ',
    baptismal_name: 'Girma',
    gender: 'MALE',
    date_of_birth: '1985-03-15',
    phone_primary: '+251911000001',
    phone_secondary: null,
    email: 'abebe.bekele@example.com',
    address: 'Addis Ababa, Bole Sub-city',
    emergency_contact_name: 'Kebede Bekele',
    emergency_contact_phone: '+251911000099',
    father_of_confession: 'Memhir Tesfaye',
    profile_photo_url: null,
    status: 'ACTIVE',
    notes: null,
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
  },
  {
    id: 'person-002',
    membership_code: 'MBR-2024-0002',
    full_name_en: 'Tigist Haile',
    full_name_am: 'ትግስት ኃይሌ',
    baptismal_name: 'Marta',
    gender: 'FEMALE',
    date_of_birth: '1990-07-22',
    phone_primary: '+251911000002',
    phone_secondary: null,
    email: 'tigist.haile@example.com',
    address: 'Addis Ababa, Kirkos Sub-city',
    emergency_contact_name: 'Haile Gebru',
    emergency_contact_phone: '+251911000098',
    father_of_confession: 'Qes Desta',
    profile_photo_url: null,
    status: 'ACTIVE',
    notes: null,
    created_at: '2024-01-12T00:00:00Z',
    updated_at: '2024-01-12T00:00:00Z',
  },
  {
    id: 'person-003',
    membership_code: 'MBR-2024-0003',
    full_name_en: 'Dawit Tadesse',
    full_name_am: 'ዳዊት ታደሰ',
    baptismal_name: 'Dawit',
    gender: 'MALE',
    date_of_birth: '1978-11-05',
    phone_primary: '+251911000003',
    phone_secondary: null,
    email: null,
    address: 'Addis Ababa, Yeka Sub-city',
    emergency_contact_name: null,
    emergency_contact_phone: null,
    father_of_confession: 'Memhir Alemayehu',
    profile_photo_url: null,
    status: 'ACTIVE',
    notes: 'Board Chairperson',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: '2024-01-05T00:00:00Z',
  },
  {
    id: 'person-004',
    membership_code: 'MBR-2024-0004',
    full_name_en: 'Selamawit Girma',
    full_name_am: 'ሰላማዊት ግርማ',
    baptismal_name: 'Selamawit',
    gender: 'FEMALE',
    date_of_birth: '1992-04-18',
    phone_primary: '+251911000004',
    phone_secondary: null,
    email: 'selamawit.g@example.com',
    address: 'Addis Ababa, Addis Ketema',
    emergency_contact_name: null,
    emergency_contact_phone: null,
    father_of_confession: 'Qes Mulugeta',
    profile_photo_url: null,
    status: 'ACTIVE',
    notes: 'Audit Committee member',
    created_at: '2024-01-08T00:00:00Z',
    updated_at: '2024-01-08T00:00:00Z',
  },
  {
    id: 'person-005',
    membership_code: 'MBR-2024-0005',
    full_name_en: 'Yohannes Tesfaye',
    full_name_am: 'ዮሐንስ ተስፋዬ',
    baptismal_name: 'Yohannes',
    gender: 'MALE',
    date_of_birth: '1988-09-12',
    phone_primary: '+251911000005',
    phone_secondary: null,
    email: 'yohannes.t@example.com',
    address: 'Addis Ababa, Gulele Sub-city',
    emergency_contact_name: null,
    emergency_contact_phone: null,
    father_of_confession: 'Abune Mathias',
    profile_photo_url: null,
    status: 'ACTIVE',
    notes: 'Super Admin — System Administrator',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// ── Roles ─────────────────────────────────────────────────────────────────────

export const MOCK_ROLES: Role[] = [
  {
    id: 'role-001',
    code: 'SUPER_ADMIN',
    name_en: 'Super Administrator',
    name_am: 'ዋና አስተዳዳሪ',
    description_en: 'Full system access — all permissions',
    description_am: 'ሙሉ ስርዓት መዳረሻ — ሁሉም ፈቃዶች',
    is_system_role: true,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-002',
    code: 'BOARD_OFFICER',
    name_en: 'Board Officer',
    name_am: 'የሥራ አመራር ኃላፊ',
    description_en: 'Board-level access — governance, finance view, reports',
    description_am: 'የሥራ አመራር ደረጃ — አስተዳደር፣ ፋይናንስ ዕይታ፣ ሪፖርቶች',
    is_system_role: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-003',
    code: 'AUDIT_INSPECTOR',
    name_en: 'Audit Inspector',
    name_am: 'ኦዲት ተቆጣጣሪ',
    description_en: 'Read-only cross-organizational audit access',
    description_am: 'ሁሉን አቀፍ ለማንበብ ብቻ የሚሆን ኦዲት መዳረሻ',
    is_system_role: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-004',
    code: 'SECRETARIAT',
    name_en: 'Secretariat',
    name_am: 'ጽሕፈት ቤት',
    description_en: 'Administrative coordination and records',
    description_am: 'አስተዳደራዊ ቅንጅት እና መዝገቦች',
    is_system_role: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-005',
    code: 'COORDINATOR',
    name_en: 'Coordinator',
    name_am: 'አስተባባሪ',
    description_en: 'Coordination unit leadership',
    description_am: 'የቅንጅት ክፍል አመራር',
    is_system_role: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-006',
    code: 'DEPT_HEAD',
    name_en: 'Department Head',
    name_am: 'የክፍል ኃላፊ',
    description_en: 'Department management and supervision',
    description_am: 'የክፍል አስተዳደርና ቁጥጥር',
    is_system_role: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-007',
    code: 'TEACHER',
    name_en: 'Teacher',
    name_am: 'አስተማሪ',
    description_en: 'Classroom teaching and attendance',
    description_am: 'የክፍል ትምህርት እና ክትትል',
    is_system_role: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// ── Permissions ───────────────────────────────────────────────────────────────

export const MOCK_PERMISSIONS: Permission[] = [
  // Student
  { id: 'perm-s01', code: 'STUDENT_VIEW', name_en: 'View Students', name_am: 'ተማሪዎችን ይመልከቱ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-s02', code: 'STUDENT_CREATE', name_en: 'Register Students', name_am: 'ተማሪዎችን ይመዝግቡ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-s03', code: 'STUDENT_UPDATE', name_en: 'Update Student Records', name_am: 'የተማሪ መዝገቦችን ያዘምኑ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-s04', code: 'STUDENT_DELETE', name_en: 'Delete Student Records', name_am: 'የተማሪ መዝገቦችን ሰርዙ', description_en: null, category: 'ACADEMIC', is_active: true },
  // Attendance
  { id: 'perm-a01', code: 'ATTENDANCE_VIEW', name_en: 'View Attendance', name_am: 'ክትትልን ይመልከቱ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-a02', code: 'ATTENDANCE_RECORD', name_en: 'Record Attendance', name_am: 'ክትትልን ይመዝግቡ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-a03', code: 'ATTENDANCE_UPDATE', name_en: 'Update Attendance', name_am: 'ክትትልን ያዘምኑ', description_en: null, category: 'ACADEMIC', is_active: true },
  // Grades
  { id: 'perm-g01', code: 'GRADE_VIEW', name_en: 'View Grades', name_am: 'ውጤቶችን ይመልከቱ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-g02', code: 'GRADE_CREATE', name_en: 'Enter Grades', name_am: 'ውጤቶችን ያስገቡ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-g03', code: 'GRADE_UPDATE', name_en: 'Update Grades', name_am: 'ውጤቶችን ያዘምኑ', description_en: null, category: 'ACADEMIC', is_active: true },
  { id: 'perm-g04', code: 'GRADE_APPROVE', name_en: 'Approve Grades', name_am: 'ውጤቶችን ያጸድቁ', description_en: null, category: 'ACADEMIC', is_active: true },
  // Finance
  { id: 'perm-f01', code: 'FINANCE_VIEW', name_en: 'View Finance', name_am: 'ፋይናንስን ይመልከቱ', description_en: null, category: 'FINANCE', is_active: true },
  { id: 'perm-f02', code: 'FINANCE_CREATE', name_en: 'Create Financial Records', name_am: 'የፋይናንስ መዝገቦች ይፍጠሩ', description_en: null, category: 'FINANCE', is_active: true },
  { id: 'perm-f03', code: 'FINANCE_APPROVE', name_en: 'Approve Financial Transactions', name_am: 'የፋይናንስ ግብይቶችን ያጸድቁ', description_en: null, category: 'FINANCE', is_active: true },
  // Assets
  { id: 'perm-p01', code: 'ASSET_VIEW', name_en: 'View Assets', name_am: 'ንብረቶችን ይመልከቱ', description_en: null, category: 'PROPERTY', is_active: true },
  { id: 'perm-p02', code: 'ASSET_CREATE', name_en: 'Register Assets', name_am: 'ንብረቶችን ይመዝግቡ', description_en: null, category: 'PROPERTY', is_active: true },
  { id: 'perm-p03', code: 'ASSET_ASSIGN', name_en: 'Assign Assets', name_am: 'ንብረቶችን ያስረክቡ', description_en: null, category: 'PROPERTY', is_active: true },
  { id: 'perm-p04', code: 'ASSET_TRANSFER', name_en: 'Transfer Assets', name_am: 'ንብረቶችን ያዛውሩ', description_en: null, category: 'PROPERTY', is_active: true },
  // Audit
  { id: 'perm-au1', code: 'AUDIT_VIEW_ALL', name_en: 'View All Audit Logs', name_am: 'ሁሉንም ኦዲት መዝገቦች ይመልከቱ', description_en: null, category: 'AUDIT', is_active: true },
  // Governance
  { id: 'perm-gv1', code: 'GOVERNANCE_VIEW', name_en: 'View Governance', name_am: 'አስተዳደርን ይመልከቱ', description_en: null, category: 'GOVERNANCE', is_active: true },
  { id: 'perm-gv2', code: 'GOVERNANCE_MANAGE', name_en: 'Manage Governance', name_am: 'አስተዳደርን ያስተዳድሩ', description_en: null, category: 'GOVERNANCE', is_active: true },
  // Reports
  { id: 'perm-r01', code: 'REPORT_VIEW', name_en: 'View Reports', name_am: 'ሪፖርቶችን ይመልከቱ', description_en: null, category: 'REPORTS', is_active: true },
  { id: 'perm-r02', code: 'REPORT_EXPORT', name_en: 'Export Reports', name_am: 'ሪፖርቶችን ይላኩ', description_en: null, category: 'REPORTS', is_active: true },
  // Members
  { id: 'perm-m01', code: 'MEMBER_VIEW', name_en: 'View Members', name_am: 'አባላትን ይመልከቱ', description_en: null, category: 'PEOPLE', is_active: true },
  { id: 'perm-m02', code: 'MEMBER_CREATE', name_en: 'Register Members', name_am: 'አባላትን ይመዝግቡ', description_en: null, category: 'PEOPLE', is_active: true },
  { id: 'perm-m03', code: 'MEMBER_UPDATE', name_en: 'Update Member Records', name_am: 'የአባል መዝገቦችን ያዘምኑ', description_en: null, category: 'PEOPLE', is_active: true },
  // Admin
  { id: 'perm-ad1', code: 'USER_MANAGE', name_en: 'Manage System Users', name_am: 'የስርዓት ተጠቃሚዎችን ያስተዳድሩ', description_en: null, category: 'ADMIN', is_active: true },
  { id: 'perm-ad2', code: 'ROLE_MANAGE', name_en: 'Manage Roles & Permissions', name_am: 'ሚናዎችን እና ፈቃዶችን ያስተዳድሩ', description_en: null, category: 'ADMIN', is_active: true },
  { id: 'perm-ad3', code: 'SYSTEM_CONFIGURE', name_en: 'Configure System Settings', name_am: 'የስርዓት ቅንብሮችን ያዋቅሩ', description_en: null, category: 'ADMIN', is_active: true },
  // Programs
  { id: 'perm-pr1', code: 'PROGRAM_VIEW', name_en: 'View Programs', name_am: 'ፕሮግራሞችን ይመልከቱ', description_en: null, category: 'PROGRAMS', is_active: true },
  { id: 'perm-pr2', code: 'PROGRAM_CREATE', name_en: 'Create Programs', name_am: 'ፕሮግራሞች ይፍጠሩ', description_en: null, category: 'PROGRAMS', is_active: true },
  { id: 'perm-pr3', code: 'PROGRAM_MANAGE', name_en: 'Manage Programs', name_am: 'ፕሮግራሞችን ያስተዳድሩ', description_en: null, category: 'PROGRAMS', is_active: true },
  // HR
  { id: 'perm-hr1', code: 'HR_VIEW', name_en: 'View HR Records', name_am: 'የሰው ሀብት መዝገቦችን ይመልከቱ', description_en: null, category: 'HR', is_active: true },
  { id: 'perm-hr2', code: 'HR_MANAGE', name_en: 'Manage HR Records', name_am: 'የሰው ሀብት መዝገቦችን ያስተዳድሩ', description_en: null, category: 'HR', is_active: true },
];

// ── Role Permissions ──────────────────────────────────────────────────────────

// Super Admin — everything
const SUPER_ADMIN_PERMS = MOCK_PERMISSIONS.map((p, i) => ({
  id: `rp-001-${i}`,
  role_id: 'role-001',
  permission_id: p.id,
  granted_at: '2024-01-01T00:00:00Z',
}));

// Board Officer
const BOARD_PERMS: RolePermission[] = [
  'perm-gv1', 'perm-gv2', 'perm-f01', 'perm-m01', 'perm-r01', 'perm-r02',
  'perm-s01', 'perm-a01', 'perm-p01', 'perm-g01', 'perm-pr1',
].map((pid, i) => ({ id: `rp-002-${i}`, role_id: 'role-002', permission_id: pid, granted_at: '2024-01-01T00:00:00Z' }));

// Audit Inspector — all VIEW permissions + AUDIT_VIEW_ALL, no mutations
const AUDIT_PERMS: RolePermission[] = [
  'perm-au1', 'perm-s01', 'perm-a01', 'perm-g01', 'perm-f01',
  'perm-p01', 'perm-m01', 'perm-r01', 'perm-r02', 'perm-gv1',
  'perm-pr1', 'perm-hr1',
].map((pid, i) => ({ id: `rp-003-${i}`, role_id: 'role-003', permission_id: pid, granted_at: '2024-01-01T00:00:00Z' }));

// Dept Head
const DEPT_HEAD_PERMS: RolePermission[] = [
  'perm-s01', 'perm-s02', 'perm-s03', 'perm-a01', 'perm-a02', 'perm-a03',
  'perm-g01', 'perm-g02', 'perm-g03', 'perm-g04', 'perm-m01',
  'perm-r01', 'perm-hr1', 'perm-pr1',
].map((pid, i) => ({ id: `rp-006-${i}`, role_id: 'role-006', permission_id: pid, granted_at: '2024-01-01T00:00:00Z' }));

// Teacher
const TEACHER_PERMS: RolePermission[] = [
  'perm-s01', 'perm-a01', 'perm-a02', 'perm-g01', 'perm-g02',
].map((pid, i) => ({ id: `rp-007-${i}`, role_id: 'role-007', permission_id: pid, granted_at: '2024-01-01T00:00:00Z' }));

export const MOCK_ROLE_PERMISSIONS: RolePermission[] = [
  ...SUPER_ADMIN_PERMS,
  ...BOARD_PERMS,
  ...AUDIT_PERMS,
  ...DEPT_HEAD_PERMS,
  ...TEACHER_PERMS,
];

// ── System Users ──────────────────────────────────────────────────────────────

export const MOCK_SYSTEM_USERS: SystemUser[] = [
  {
    id: 'sysuser-001',
    auth_user_id: 'auth-001',
    person_id: 'person-005',
    username: 'admin',
    is_active: true,
    last_login_at: '2024-09-10T09:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sysuser-002',
    auth_user_id: 'auth-002',
    person_id: 'person-003',
    username: 'board_chair',
    is_active: true,
    last_login_at: '2024-09-09T14:30:00Z',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: '2024-01-05T00:00:00Z',
  },
  {
    id: 'sysuser-003',
    auth_user_id: 'auth-003',
    person_id: 'person-004',
    username: 'audit_inspector',
    is_active: true,
    last_login_at: '2024-09-08T10:00:00Z',
    created_at: '2024-01-08T00:00:00Z',
    updated_at: '2024-01-08T00:00:00Z',
  },
];

// ── User Assignments ──────────────────────────────────────────────────────────

export const MOCK_USER_ASSIGNMENTS: UserUnitAssignment[] = [
  {
    id: 'assign-001',
    system_user_id: 'sysuser-001',
    organization_unit_id: 'org-001',
    role_id: 'role-001',
    assigned_at: '2024-01-01T00:00:00Z',
    expires_at: null,
    is_active: true,
    assigned_by: null,
  },
  {
    id: 'assign-002',
    system_user_id: 'sysuser-002',
    organization_unit_id: 'org-003',
    role_id: 'role-002',
    assigned_at: '2024-01-05T00:00:00Z',
    expires_at: null,
    is_active: true,
    assigned_by: 'sysuser-001',
  },
  {
    id: 'assign-003',
    system_user_id: 'sysuser-003',
    organization_unit_id: 'org-002',
    role_id: 'role-003',
    assigned_at: '2024-01-08T00:00:00Z',
    expires_at: null,
    is_active: true,
    assigned_by: 'sysuser-001',
  },
];

// ── Audit Logs (sample) ───────────────────────────────────────────────────────

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    user_id: 'sysuser-001',
    action: 'INSERT',
    table_name: 'persons',
    record_id: 'person-002',
    old_values: null,
    new_values: { full_name_en: 'Tigist Haile', status: 'ACTIVE' },
    organization_unit_id: 'org-001',
    ip_address: '127.0.0.1',
    user_agent: 'SSMS/1.0',
    created_at: '2024-01-12T09:30:00Z',
  },
  {
    id: 'audit-002',
    user_id: 'sysuser-002',
    action: 'LOGIN',
    table_name: 'system_users',
    record_id: 'sysuser-002',
    old_values: null,
    new_values: { last_login_at: '2024-09-09T14:30:00Z' },
    organization_unit_id: 'org-003',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0',
    created_at: '2024-09-09T14:30:00Z',
  },
];

// ── Dashboard Statistics ──────────────────────────────────────────────────────

export interface DashboardStats {
  totalMembers: number;
  activeStudents: number;
  activeTeachers: number;
  departments: number;
  coordinations: number;
  pendingApprovals: number;
  currentAcademicYear: string;
  recentAuditEvents: number;
}

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  totalMembers: 247,
  activeStudents: 183,
  activeTeachers: 24,
  departments: 7,
  coordinations: 7,
  pendingApprovals: 3,
  currentAcademicYear: '2025/2026',
  recentAuditEvents: 12,
};

// ── Helper: resolve permissions for a system user ─────────────────────────────

export function resolveMockUserPermissions(systemUserId: string): Set<string> {
  const assignments = MOCK_USER_ASSIGNMENTS.filter(
    (a) => a.system_user_id === systemUserId && a.is_active
  );
  const roleIds = assignments.map((a) => a.role_id);
  const permissionIds = MOCK_ROLE_PERMISSIONS
    .filter((rp) => roleIds.includes(rp.role_id))
    .map((rp) => rp.permission_id);
  const permissions = MOCK_PERMISSIONS
    .filter((p) => permissionIds.includes(p.id))
    .map((p) => p.code);
  return new Set(permissions);
}

// ── Mock "current" user (admin for dev) ───────────────────────────────────────

export const MOCK_CURRENT_USER = {
  systemUser: MOCK_SYSTEM_USERS[0],
  person: MOCK_PERSONS[4],
  assignments: MOCK_USER_ASSIGNMENTS.filter((a) => a.system_user_id === 'sysuser-001'),
  permissions: resolveMockUserPermissions('sysuser-001'),
  organizationIds: ['org-001'],
};
