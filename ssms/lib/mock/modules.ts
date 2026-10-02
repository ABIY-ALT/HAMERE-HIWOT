// =============================================================================
// SSMS — Complete Module Mock Data
// All data for Education, Finance, Property, HR, Programs, Sacred Arts modules
// =============================================================================

// ── Academic Years ────────────────────────────────────────────────────────────
export const MOCK_ACADEMIC_YEARS = [
  { id: 'ay-001', name: '2025/2026', name_am: '2025/2026', is_current: true, start_date: '2025-09-01', end_date: '2026-06-30', status: 'ACTIVE', opened_by: 'Dawit Tadesse', students_enrolled: 183 },
  { id: 'ay-002', name: '2024/2025', name_am: '2024/2025', is_current: false, start_date: '2024-09-01', end_date: '2025-06-30', status: 'COMPLETED', opened_by: 'Dawit Tadesse', students_enrolled: 171 },
  { id: 'ay-003', name: '2023/2024', name_am: '2023/2024', is_current: false, start_date: '2023-09-01', end_date: '2024-06-30', status: 'COMPLETED', opened_by: 'Abebe Bekele', students_enrolled: 158 },
];

// ── Classes ───────────────────────────────────────────────────────────────────
export const MOCK_CLASSES = [
  { id: 'cls-001', name_en: 'Grade 1 — Angels', name_am: 'ክፍል 1 — መላዕክት', grade_level: 1, academic_year_id: 'ay-001', teacher: 'Tigist Haile', capacity: 30, enrolled: 28, room: 'Room A' },
  { id: 'cls-002', name_en: 'Grade 2 — Cherubs', name_am: 'ክፍል 2 — ኪሩቤል', grade_level: 2, academic_year_id: 'ay-001', teacher: 'Selamawit Girma', capacity: 30, enrolled: 27, room: 'Room B' },
  { id: 'cls-003', name_en: 'Grade 3 — Seraphim', name_am: 'ክፍል 3 — ሱራፌል', grade_level: 3, academic_year_id: 'ay-001', teacher: 'Abebe Bekele', capacity: 25, enrolled: 24, room: 'Room C' },
  { id: 'cls-004', name_en: 'Grade 4 — Apostles', name_am: 'ክፍል 4 — ሐዋርያት', grade_level: 4, academic_year_id: 'ay-001', teacher: 'Yohannes Tesfaye', capacity: 25, enrolled: 22, room: 'Room D' },
  { id: 'cls-005', name_en: 'Grade 5 — Prophets', name_am: 'ክፍል 5 — ነቢያት', grade_level: 5, academic_year_id: 'ay-001', teacher: 'Dawit Tadesse', capacity: 25, enrolled: 20, room: 'Room E' },
  { id: 'cls-006', name_en: 'Grade 6 — Saints', name_am: 'ክፍል 6 — ቅዱሳን', grade_level: 6, academic_year_id: 'ay-001', teacher: 'Tigist Haile', capacity: 25, enrolled: 18, room: 'Room F' },
  { id: 'cls-007', name_en: 'Youth — Daniel', name_am: 'ወጣቶች — ዳኒኤል', grade_level: 7, academic_year_id: 'ay-001', teacher: 'Abebe Bekele', capacity: 40, enrolled: 36, room: 'Hall' },
  { id: 'cls-008', name_en: 'Senior — Solomon', name_am: 'ሽምግልና — ሰሎሞን', grade_level: 8, academic_year_id: 'ay-001', teacher: 'Selamawit Girma', capacity: 40, enrolled: 28, room: 'Hall B' },
];

// ── Subjects ──────────────────────────────────────────────────────────────────
export const MOCK_SUBJECTS = [
  { id: 'sub-001', code: 'BIBL-101', name_en: 'Holy Bible Studies', name_am: 'የቅዱስ መፅሐፍ ጥናት', grade_level: 'All', credits: 4, teacher: 'Multiple' },
  { id: 'sub-002', code: 'LITG-101', name_en: 'Ethiopian Liturgy (ቅዳሴ)', name_am: 'የኢትዮጵያ ቅዳሴ', grade_level: '3+', credits: 3, teacher: 'Dawit Tadesse' },
  { id: 'sub-003', code: 'HIST-101', name_en: 'Church History', name_am: 'የቤተ ክርስቲያን ታሪክ', grade_level: '4+', credits: 3, teacher: 'Abebe Bekele' },
  { id: 'sub-004', code: 'HYMD-101', name_en: 'Hymnody (ዜማ)', name_am: 'ዜማ', grade_level: 'All', credits: 2, teacher: 'Choir Dept' },
  { id: 'sub-005', code: 'PATR-201', name_en: 'Patristics', name_am: 'ፓትሪስቲክስ', grade_level: '5+', credits: 3, teacher: 'Yohannes Tesfaye' },
  { id: 'sub-006', code: 'ETHS-101', name_en: 'Christian Ethics', name_am: 'የክርስቲያን ሥነ-ምግባር', grade_level: 'All', credits: 2, teacher: 'Multiple' },
  { id: 'sub-007', code: 'SACR-101', name_en: 'Sacraments & Rites', name_am: 'ቅዱሳን ምሥጢራት', grade_level: '4+', credits: 3, teacher: 'Tigist Haile' },
];

// ── Students ──────────────────────────────────────────────────────────────────
export const MOCK_STUDENTS = [
  { id: 'stu-001', reg_no: 'REG-2026-0001', name_en: 'Mikael Abebe', name_am: 'ሚካኤል አበበ', baptismal: 'Mikael', gender: 'MALE', class: 'Grade 3 — Seraphim', class_id: 'cls-003', grade_level: 3, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Abebe Bekele', phone: '+251911000011' },
  { id: 'stu-002', reg_no: 'REG-2026-0002', name_en: 'Marta Tadesse', name_am: 'ማርታ ታደሰ', baptismal: 'Marta', gender: 'FEMALE', class: 'Grade 2 — Cherubs', class_id: 'cls-002', grade_level: 2, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Dawit Tadesse', phone: '+251911000012' },
  { id: 'stu-003', reg_no: 'REG-2026-0003', name_en: 'Yared Haile', name_am: 'ያሬድ ኃይሌ', baptismal: 'Yared', gender: 'MALE', class: 'Grade 4 — Apostles', class_id: 'cls-004', grade_level: 4, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Tigist Haile', phone: '+251911000013' },
  { id: 'stu-004', reg_no: 'REG-2026-0004', name_en: 'Selam Girma', name_am: 'ሰላም ግርማ', baptismal: 'Selam', gender: 'FEMALE', class: 'Youth — Daniel', class_id: 'cls-007', grade_level: 7, status: 'ACTIVE', enrollment_date: '2025-09-07', parent: 'Selamawit Girma', phone: '+251911000014' },
  { id: 'stu-005', reg_no: 'REG-2026-0005', name_en: 'Daniel Bekele', name_am: 'ዳኒኤል በቀለ', baptismal: 'Daniel', gender: 'MALE', class: 'Grade 1 — Angels', class_id: 'cls-001', grade_level: 1, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Abebe Bekele', phone: '+251911000015' },
  { id: 'stu-006', reg_no: 'REG-2026-0006', name_en: 'Sara Tesfaye', name_am: 'ሳራ ተስፋዬ', baptismal: 'Sara', gender: 'FEMALE', class: 'Grade 5 — Prophets', class_id: 'cls-005', grade_level: 5, status: 'ACTIVE', enrollment_date: '2025-09-06', parent: 'Yohannes Tesfaye', phone: '+251911000016' },
  { id: 'stu-007', reg_no: 'REG-2026-0007', name_en: 'Eyob Tadesse', name_am: 'እዮብ ታደሰ', baptismal: 'Eyob', gender: 'MALE', class: 'Senior — Solomon', class_id: 'cls-008', grade_level: 8, status: 'INACTIVE', enrollment_date: '2024-09-05', parent: 'Dawit Tadesse', phone: '+251911000017' },
  { id: 'stu-008', reg_no: 'REG-2026-0008', name_en: 'Hiwot Haile', name_am: 'ሕይወት ኃይሌ', baptismal: 'Hiwot', gender: 'FEMALE', class: 'Grade 6 — Saints', class_id: 'cls-006', grade_level: 6, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Tigist Haile', phone: '+251911000018' },
  { id: 'stu-009', reg_no: 'REG-2026-0009', name_en: 'Kidus Alemu', name_am: 'ቅዱስ ዓለሙ', baptismal: 'Kidus', gender: 'MALE', class: 'Grade 3 — Seraphim', class_id: 'cls-003', grade_level: 3, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Alemu Wolde', phone: '+251911000019' },
  { id: 'stu-010', reg_no: 'REG-2026-0010', name_en: 'Rahel Mekonnen', name_am: 'ራሄል መኮንን', baptismal: 'Rahel', gender: 'FEMALE', class: 'Grade 3 — Seraphim', class_id: 'cls-003', grade_level: 3, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Mekonnen Assefa', phone: '+251911000020' },
  { id: 'stu-011', reg_no: 'REG-2026-0011', name_en: 'Natnael Getachew', name_am: 'ናትናኤል ጌታቸው', baptismal: 'Natnael', gender: 'MALE', class: 'Grade 3 — Seraphim', class_id: 'cls-003', grade_level: 3, status: 'ACTIVE', enrollment_date: '2025-09-12', parent: 'Getachew Bayu', phone: '+251911000021' },
  { id: 'stu-012', reg_no: 'REG-2026-0012', name_en: 'Bethlehem Desta', name_am: 'ቤተልሔም ደስታ', baptismal: 'Bethlehem', gender: 'FEMALE', class: 'Grade 3 — Seraphim', class_id: 'cls-003', grade_level: 3, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Desta Kebede', phone: '+251911000022' },
  { id: 'stu-013', reg_no: 'REG-2026-0013', name_en: 'Abel Fikre', name_am: 'አቤል ፍቅረ', baptismal: 'Abel', gender: 'MALE', class: 'Grade 1 — Angels', class_id: 'cls-001', grade_level: 1, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Fikre Tilahun', phone: '+251911000023' },
  { id: 'stu-014', reg_no: 'REG-2026-0014', name_en: 'Tsion Berhanu', name_am: 'ጽዮን ብርሃኑ', baptismal: 'Tsion', gender: 'FEMALE', class: 'Grade 1 — Angels', class_id: 'cls-001', grade_level: 1, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Berhanu Lemma', phone: '+251911000024' },
  { id: 'stu-015', reg_no: 'REG-2026-0015', name_en: 'Eden Tamrat', name_am: 'ኤደን ታምራት', baptismal: 'Eden', gender: 'FEMALE', class: 'Grade 1 — Angels', class_id: 'cls-001', grade_level: 1, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Tamrat Wondimu', phone: '+251911000025' },
  { id: 'stu-016', reg_no: 'REG-2026-0016', name_en: 'Biruk Hailu', name_am: 'ብሩክ ኃይሉ', baptismal: 'Biruk', gender: 'MALE', class: 'Grade 2 — Cherubs', class_id: 'cls-002', grade_level: 2, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Hailu Gebre', phone: '+251911000026' },
  { id: 'stu-017', reg_no: 'REG-2026-0017', name_en: 'Meron Yilma', name_am: 'ሜሮን ይልማ', baptismal: 'Meron', gender: 'FEMALE', class: 'Grade 2 — Cherubs', class_id: 'cls-002', grade_level: 2, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Yilma Tadesse', phone: '+251911000027' },
  { id: 'stu-018', reg_no: 'REG-2026-0018', name_en: 'Henok Assefa', name_am: 'ሄኖክ አሰፋ', baptismal: 'Henok', gender: 'MALE', class: 'Youth — Daniel', class_id: 'cls-007', grade_level: 7, status: 'ACTIVE', enrollment_date: '2025-09-07', parent: 'Assefa Worku', phone: '+251911000028' },
  { id: 'stu-019', reg_no: 'REG-2026-0019', name_en: 'Lidya Negash', name_am: 'ሊዲያ ነጋሽ', baptismal: 'Lidya', gender: 'FEMALE', class: 'Youth — Daniel', class_id: 'cls-007', grade_level: 7, status: 'ACTIVE', enrollment_date: '2025-09-07', parent: 'Negash Abate', phone: '+251911000029' },
  { id: 'stu-020', reg_no: 'REG-2026-0020', name_en: 'Samuel Teka', name_am: 'ሳሙኤል ተካ', baptismal: 'Samuel', gender: 'MALE', class: 'Grade 4 — Apostles', class_id: 'cls-004', grade_level: 4, status: 'ACTIVE', enrollment_date: '2025-09-05', parent: 'Teka Zewdu', phone: '+251911000030' },
];

// ── Attendance ────────────────────────────────────────────────────────────────
export const MOCK_ATTENDANCE_SESSIONS = [
  { id: 'att-001', class: 'Grade 3 — Seraphim', class_id: 'cls-003', date: '2026-09-07', topic: 'The Book of Genesis', topic_am: 'የዘፍጥረት መፅሐፍ', teacher: 'Abebe Bekele', present: 20, absent: 3, late: 1, excused: 0, status: 'COMPLETED' },
  { id: 'att-002', class: 'Grade 1 — Angels', class_id: 'cls-001', date: '2026-09-07', topic: 'The Lord\'s Prayer', topic_am: 'የጌታ ጸሎት', teacher: 'Tigist Haile', present: 25, absent: 2, late: 1, excused: 0, status: 'COMPLETED' },
  { id: 'att-003', class: 'Youth — Daniel', class_id: 'cls-007', date: '2026-09-07', topic: 'Patristics: St. Yared', topic_am: 'ፓትሪስቲክስ: ቅዱስ ያሬድ', teacher: 'Abebe Bekele', present: 30, absent: 4, late: 2, excused: 0, status: 'COMPLETED' },
  { id: 'att-004', class: 'Grade 2 — Cherubs', class_id: 'cls-002', date: '2026-09-07', topic: 'Ten Commandments', topic_am: 'አሥርቱ ትዕዛዛት', teacher: 'Selamawit Girma', present: 24, absent: 3, late: 0, excused: 0, status: 'COMPLETED' },
];

// ── Grades ────────────────────────────────────────────────────────────────────
export const MOCK_GRADES = [
  { id: 'gr-001', student: 'Mikael Abebe', reg_no: 'REG-2026-0001', class: 'Grade 3 — Seraphim', subject: 'Holy Bible Studies', continuous: 27, final: 61, total: 88, grade: 'A', status: 'APPROVED', approved_by: 'Abebe Bekele' },
  { id: 'gr-002', student: 'Mikael Abebe', reg_no: 'REG-2026-0001', class: 'Grade 3 — Seraphim', subject: 'Ethiopian Liturgy', continuous: 25, final: 55, total: 80, grade: 'B+', status: 'APPROVED', approved_by: 'Abebe Bekele' },
  { id: 'gr-003', student: 'Marta Tadesse', reg_no: 'REG-2026-0002', class: 'Grade 2 — Cherubs', subject: 'Holy Bible Studies', continuous: 28, final: 63, total: 91, grade: 'A+', status: 'PENDING', approved_by: null },
  { id: 'gr-004', student: 'Yared Haile', reg_no: 'REG-2026-0003', class: 'Grade 4 — Apostles', subject: 'Church History', continuous: 20, final: 40, total: 60, grade: 'C+', status: 'PENDING', approved_by: null },
  { id: 'gr-005', student: 'Selam Girma', reg_no: 'REG-2026-0004', class: 'Youth — Daniel', subject: 'Patristics', continuous: 29, final: 65, total: 94, grade: 'A+', status: 'APPROVED', approved_by: 'Yohannes Tesfaye' },
];

// ── Finance ───────────────────────────────────────────────────────────────────
export const MOCK_INCOME = [
  { id: 'inc-001', date: '2026-09-01', category: 'Member Fees', category_am: 'የአባልነት ክፍያ', amount: 15000, currency: 'ETB', received_by: 'Selamawit Girma', description: 'Monthly member contributions', status: 'CONFIRMED' },
  { id: 'inc-002', date: '2026-09-03', category: 'Donations', category_am: 'ስጦታ', amount: 25000, currency: 'ETB', received_by: 'Selamawit Girma', description: 'Anonymous donation', status: 'CONFIRMED' },
  { id: 'inc-003', date: '2026-09-05', category: 'Muda ye Mitsw\'at', category_am: 'ምዕዳ የምጽዋት', amount: 8500, currency: 'ETB', received_by: 'Selamawit Girma', description: 'Collected during Sunday service', status: 'PENDING' },
  { id: 'inc-004', date: '2026-08-28', category: 'Program Fees', category_am: 'የፕሮግራም ክፍያ', amount: 12000, currency: 'ETB', received_by: 'Abebe Bekele', description: 'Youth conference fees', status: 'CONFIRMED' },
  { id: 'inc-005', date: '2026-08-20', category: 'Investment Returns', category_am: 'የኢንቨስትመንት ትርፍ', amount: 5000, currency: 'ETB', received_by: 'Dawit Tadesse', description: 'Monthly investment return', status: 'CONFIRMED' },
];

export const MOCK_EXPENSES = [
  { id: 'exp-001', date: '2026-09-02', category: 'Stationery & Supplies', category_am: 'ቁሳቁስ', amount: 3500, currency: 'ETB', paid_by: 'Selamawit Girma', description: 'Teaching materials', status: 'APPROVED', approved_by: 'Dawit Tadesse' },
  { id: 'exp-002', date: '2026-09-04', category: 'Utilities', category_am: 'አገልግሎቶች', amount: 2000, currency: 'ETB', paid_by: 'Selamawit Girma', description: 'Electricity & water', status: 'APPROVED', approved_by: 'Dawit Tadesse' },
  { id: 'exp-003', date: '2026-09-06', category: 'Event Expense', category_am: 'የዝግጅት ወጪ', amount: 8000, currency: 'ETB', paid_by: 'Abebe Bekele', description: 'Youth conference expenses', status: 'PENDING', approved_by: null },
  { id: 'exp-004', date: '2026-08-30', category: 'Maintenance', category_am: 'ጥገና', amount: 4500, currency: 'ETB', paid_by: 'Abebe Bekele', description: 'Classroom repair', status: 'APPROVED', approved_by: 'Dawit Tadesse' },
  { id: 'exp-005', date: '2026-08-25', category: 'Printing', category_am: 'ህትመት', amount: 1800, currency: 'ETB', paid_by: 'Selamawit Girma', description: 'Study materials printing', status: 'APPROVED', approved_by: 'Dawit Tadesse' },
];

export const MOCK_BUDGET_ITEMS = [
  { id: 'bdg-001', category: 'Education & Training', category_am: 'ትምህርትና ስልጠና', allocated: 80000, spent: 42000, remaining: 38000, percent: 53 },
  { id: 'bdg-002', category: 'Programs & Events', category_am: 'ፕሮግራምና ዝግጅቶች', allocated: 60000, spent: 28000, remaining: 32000, percent: 47 },
  { id: 'bdg-003', category: 'Property & Maintenance', category_am: 'ንብረትና ጥገና', allocated: 40000, spent: 18500, remaining: 21500, percent: 46 },
  { id: 'bdg-004', category: 'HR & Personnel', category_am: 'ሰው ሀብት', allocated: 50000, spent: 30000, remaining: 20000, percent: 60 },
  { id: 'bdg-005', category: 'Media & Communications', category_am: 'ሚዲያ', allocated: 20000, spent: 8000, remaining: 12000, percent: 40 },
];

export const MOCK_DONATIONS = [
  { id: 'don-001', date: '2026-09-03', donor: 'Anonymous', type: 'Cash', amount: 25000, currency: 'ETB', purpose: 'General Fund', receipt: 'DON-2026-0001', status: 'RECEIVED' },
  { id: 'don-002', date: '2026-08-20', donor: 'Abebe Bekele', type: 'Cash', amount: 10000, currency: 'ETB', purpose: 'Library Books', receipt: 'DON-2026-0002', status: 'RECEIVED' },
  { id: 'don-003', date: '2026-08-10', donor: 'Diaspora Group', type: 'Bank Transfer', amount: 50000, currency: 'ETB', purpose: 'Building Fund', receipt: 'DON-2026-0003', status: 'RECEIVED' },
  { id: 'don-004', date: '2026-07-28', donor: 'Anonymous', type: 'Cash', amount: 5000, currency: 'ETB', purpose: 'Education Support', receipt: 'DON-2026-0004', status: 'RECEIVED' },
];

export const MOCK_APPROVALS = [
  { id: 'apr-001', type: 'Expense', ref: 'exp-003', title: 'Youth Conference Expenses', amount: 8000, requested_by: 'Abebe Bekele', requested_at: '2026-09-06', status: 'PENDING', priority: 'NORMAL' },
  { id: 'apr-002', type: 'Purchase', ref: 'prc-001', title: 'New Projector Purchase', amount: 45000, requested_by: 'Yohannes Tesfaye', requested_at: '2026-09-05', status: 'PENDING', priority: 'HIGH' },
  { id: 'apr-003', type: 'Transfer', ref: 'atr-001', title: 'Asset Transfer: Laptop to HR Dept', amount: 0, requested_by: 'Selamawit Girma', requested_at: '2026-09-04', status: 'PENDING', priority: 'LOW' },
];

// ── Assets / Property ─────────────────────────────────────────────────────────
export const MOCK_ASSETS = [
  { id: 'ast-001', tag: 'AST-IT-0001', name_en: 'Dell Laptop', name_am: 'ዴል ላፕቶፕ', category: 'IT Equipment', category_am: 'የኮምፒውተር ዕቃ', serial: 'DL2024001', condition: 'GOOD', custodian: 'Yohannes Tesfaye', dept: 'Admin', purchase_date: '2024-01-15', value: 35000, status: 'IN_USE' },
  { id: 'ast-002', tag: 'AST-IT-0002', name_en: 'HP Printer', name_am: 'HP ፕሪንተር', category: 'IT Equipment', category_am: 'የኮምፒውተር ዕቃ', serial: 'HP2024001', condition: 'GOOD', custodian: 'Selamawit Girma', dept: 'Finance', purchase_date: '2024-02-10', value: 12000, status: 'IN_USE' },
  { id: 'ast-003', tag: 'AST-FRN-0001', name_en: 'Classroom Chairs (Set of 30)', name_am: 'የክፍል ወንበሮች (30 ስብስብ)', category: 'Furniture', category_am: 'ዕቃዎች', serial: 'FRN2024001', condition: 'GOOD', custodian: 'Abebe Bekele', dept: 'Education', purchase_date: '2024-01-20', value: 18000, status: 'IN_USE' },
  { id: 'ast-004', tag: 'AST-AV-0001', name_en: 'Projector & Screen', name_am: 'ፕሮጀክተርና ስክሪን', category: 'AV Equipment', category_am: 'የድምፅና ምስል ዕቃ', serial: 'AV2024001', condition: 'FAIR', custodian: 'Dawit Tadesse', dept: 'Programs', purchase_date: '2023-09-01', value: 22000, status: 'IN_USE' },
  { id: 'ast-005', tag: 'AST-MUS-0001', name_en: 'Electronic Keyboard', name_am: 'ኤሌክትሮኒክ ኪቦርድ', category: 'Musical Instruments', category_am: 'የሙዚቃ መሳሪያ', serial: 'MUS2024001', condition: 'GOOD', custodian: 'Choir Lead', dept: 'Sacred Arts', purchase_date: '2024-03-01', value: 15000, status: 'IN_USE' },
  { id: 'ast-006', tag: 'AST-IT-0003', name_en: 'Network Router', name_am: 'ኔትወርክ ሩተር', category: 'IT Equipment', category_am: 'የኮምፒውተር ዕቃ', serial: 'RT2024001', condition: 'GOOD', custodian: 'Yohannes Tesfaye', dept: 'Admin', purchase_date: '2024-04-15', value: 4500, status: 'IN_USE' },
  { id: 'ast-007', tag: 'AST-FRN-0002', name_en: 'Office Desk (Large)', name_am: 'ትልቅ ጠረጴዛ', category: 'Furniture', category_am: 'ዕቃዎች', serial: 'FRN2024002', condition: 'EXCELLENT', custodian: 'Dawit Tadesse', dept: 'Management Board', purchase_date: '2024-01-10', value: 8000, status: 'IN_USE' },
  { id: 'ast-008', tag: 'AST-MUS-0002', name_en: 'Tsenatsil (Set)', name_am: 'ጽናጽል (ስብስብ)', category: 'Musical Instruments', category_am: 'የሙዚቃ መሳሪያ', serial: 'MUS2024002', condition: 'GOOD', custodian: 'Choir Lead', dept: 'Sacred Arts', purchase_date: '2024-02-20', value: 3000, status: 'IN_USE' },
];

export const MOCK_ASSET_TRANSFERS = [
  { id: 'atr-001', asset: 'Dell Laptop', asset_tag: 'AST-IT-0001', from_dept: 'Admin', to_dept: 'Education', from_custodian: 'Yohannes Tesfaye', to_custodian: 'Abebe Bekele', date: '2026-09-04', reason: 'Temporary use for classes', status: 'PENDING', requested_by: 'Selamawit Girma' },
  { id: 'atr-002', asset: 'HP Printer', asset_tag: 'AST-IT-0002', from_dept: 'Finance', to_dept: 'HR', from_custodian: 'Selamawit Girma', to_custodian: 'Tigist Haile', date: '2026-08-20', reason: 'HR printing needs', status: 'COMPLETED', requested_by: 'Tigist Haile' },
];

export const MOCK_MAINTENANCE = [
  { id: 'mnt-001', asset: 'Projector & Screen', asset_tag: 'AST-AV-0001', type: 'Repair', description: 'Lamp replacement needed', date: '2026-09-01', cost: 2500, status: 'IN_PROGRESS', assigned_to: 'External Vendor' },
  { id: 'mnt-002', asset: 'Network Router', asset_tag: 'AST-IT-0003', type: 'Service', description: 'Firmware update & cleaning', date: '2026-08-15', cost: 500, status: 'COMPLETED', assigned_to: 'Yohannes Tesfaye' },
];

// ── HR / Personnel ────────────────────────────────────────────────────────────
export const MOCK_PERSONNEL = [
  { id: 'per-001', name_en: 'Tigist Haile', name_am: 'ትግስት ኃይሌ', role: 'Teacher', role_am: 'አስተማሪ', dept: 'Education & Training', dept_am: 'ትምህርትና ስልጠና', phone: '+251911000002', status: 'ACTIVE', joined: '2022-09-01', classes: ['Grade 1 — Angels', 'Grade 6 — Saints'] },
  { id: 'per-002', name_en: 'Abebe Bekele', name_am: 'አበበ በቀለ', role: 'Teacher', role_am: 'አስተማሪ', dept: 'Education & Training', dept_am: 'ትምህርትና ስልጠና', phone: '+251911000001', status: 'ACTIVE', joined: '2021-09-01', classes: ['Grade 3 — Seraphim', 'Youth — Daniel'] },
  { id: 'per-003', name_en: 'Selamawit Girma', name_am: 'ሰላማዊት ግርማ', role: 'Department Head', role_am: 'የክፍል ኃላፊ', dept: 'Budget & Property', dept_am: 'በጀትና ንብረት', phone: '+251911000004', status: 'ACTIVE', joined: '2020-01-15', classes: [] },
  { id: 'per-004', name_en: 'Dawit Tadesse', name_am: 'ዳዊት ታደሰ', role: 'Board Chairperson', role_am: 'የሥራ አመራር ሰብሳቢ', dept: 'Management Board', dept_am: 'የሥራ አመራር ጉባኤ', phone: '+251911000003', status: 'ACTIVE', joined: '2019-01-05', classes: ['Grade 5 — Prophets'] },
  { id: 'per-005', name_en: 'Yohannes Tesfaye', name_am: 'ዮሐንስ ተስፋዬ', role: 'Super Admin', role_am: 'ዋና አስተዳዳሪ', dept: 'General Assembly', dept_am: 'ጠቅላላ ጉባኤ', phone: '+251911000005', status: 'ACTIVE', joined: '2018-01-01', classes: ['Grade 4 — Apostles'] },
];

export const MOCK_DISCIPLINE_RECORDS = [
  { id: 'dis-001', person: 'Servant A', type: 'Warning', reason: 'Repeated tardiness', date: '2026-08-15', status: 'RESOLVED', resolved_by: 'Dawit Tadesse' },
  { id: 'dis-002', person: 'Teacher B', type: 'Counseling', reason: 'Conduct issue', date: '2026-07-20', status: 'PENDING', resolved_by: null },
];

// ── Programs ──────────────────────────────────────────────────────────────────
export const MOCK_PROGRAMS = [
  { id: 'prg-001', title_en: 'Annual Sunday School Conference', title_am: 'ዓመታዊ ሰንበት ት/ቤት ጉባኤ', type: 'Conference', dept: 'Programs & Assemblies', date: '2026-10-15', time: '08:00', location: 'Main Hall', status: 'SCHEDULED', participants: 200, coordinator: 'Dawit Tadesse' },
  { id: 'prg-002', title_en: 'Timkat Celebration Program', title_am: 'የጥምቀት ዝግጅት', type: 'Holiday', dept: 'Programs & Assemblies', date: '2027-01-19', time: '06:00', location: 'Church Compound', status: 'DRAFT', participants: 500, coordinator: 'Abebe Bekele' },
  { id: 'prg-003', title_en: 'Monthly Spiritual Conference', title_am: 'ወርሃዊ መንፈሳዊ ጉባኤ', type: 'Assembly', dept: 'Programs & Assemblies', date: '2026-09-28', time: '09:00', location: 'Main Hall', status: 'APPROVED', participants: 150, coordinator: 'Selamawit Girma' },
  { id: 'prg-004', title_en: 'Youth Leadership Workshop', title_am: 'የወጣቶች አመራር ሥልጠና', type: 'Workshop', dept: 'Education & Training', date: '2026-09-14', time: '10:00', location: 'Meeting Room', status: 'COMPLETED', participants: 45, coordinator: 'Yohannes Tesfaye' },
  { id: 'prg-005', title_en: 'Choir Practice Session', title_am: 'የዘማሪ ልምምድ ጊዜ', type: 'Practice', dept: 'Sacred Arts', date: '2026-09-10', time: '15:00', location: 'Choir Room', status: 'IN_PROGRESS', participants: 30, coordinator: 'Choir Lead' },
];

export const MOCK_EVENTS = [
  { id: 'evt-001', title_en: 'Meskel (Finding of the True Cross)', title_am: 'ደመራ / መስቀል', type: 'Holiday', date: '2026-09-27', status: 'SCHEDULED', responsible: 'Executive Committee' },
  { id: 'evt-002', title_en: 'Ethiopian New Year (Enkutatash)', title_am: 'ኢንቁጣጣሽ (አዲስ ዓመት)', type: 'Holiday', date: '2026-09-11', status: 'COMPLETED', responsible: 'Programs Dept' },
  { id: 'evt-003', title_en: 'End of Year Graduation', title_am: 'የዓመት መጨረሻ ምረቃ', type: 'Academic', date: '2026-06-20', status: 'SCHEDULED', responsible: 'Education Dept' },
];

// ── Sacred Arts / Choir ───────────────────────────────────────────────────────
export const MOCK_CHOIR_MEMBERS = [
  { id: 'chr-001', name_en: 'Yared Alemu', name_am: 'ያሬድ አለሙ', baptismal: 'Yared', voice: 'Tenor', instrument: 'Kebero', hymn_categories: ['Kidasie', 'Mezmur'], vestment: 'VST-001', status: 'ACTIVE', joined: '2022-01-01' },
  { id: 'chr-002', name_en: 'Miriam Bekele', name_am: 'ሚሪያም በቀለ', baptismal: 'Miriam', voice: 'Soprano', instrument: 'Tsenatsil', hymn_categories: ['Mezmur', 'Wedase'], vestment: 'VST-002', status: 'ACTIVE', joined: '2022-03-15' },
  { id: 'chr-003', name_en: 'Dawit Haile', name_am: 'ዳዊት ኃይሌ', baptismal: 'Dawit', voice: 'Bass', instrument: 'Mekenajo', hymn_categories: ['Kidasie'], vestment: 'VST-003', status: 'ACTIVE', joined: '2021-09-01' },
  { id: 'chr-004', name_en: 'Hanna Tesfaye', name_am: 'ሃና ተስፋዬ', baptismal: 'Hanna', voice: 'Alto', instrument: 'None', hymn_categories: ['Mezmur', 'Wedase', 'Kidasie'], vestment: 'VST-004', status: 'ACTIVE', joined: '2023-01-10' },
  { id: 'chr-005', name_en: 'Solomon Girma', name_am: 'ሰሎሞን ግርማ', baptismal: 'Solomon', voice: 'Baritone', instrument: 'Kebero', hymn_categories: ['Kidasie', 'Mezmur'], vestment: 'VST-005', status: 'INACTIVE', joined: '2020-06-01' },
];

export const MOCK_HYMN_ASSIGNMENTS = [
  { id: 'hym-001', title_en: 'Kidasie — Sunday Morning', title_am: 'ቅዳሴ — እሁድ ጠዋት', assigned_to: 'Full Choir', date: '2026-09-14', type: 'Kidasie', status: 'ASSIGNED', lead: 'Yared Alemu' },
  { id: 'hym-002', title_en: 'Mezmur for Meskel', title_am: 'ዝማሬ ለመስቀል', assigned_to: 'Full Choir', date: '2026-09-27', type: 'Mezmur', status: 'IN_PREPARATION', lead: 'Miriam Bekele' },
  { id: 'hym-003', title_en: 'Wedase Maryam', title_am: 'ወደሴ ማርያም', assigned_to: 'Women Choir', date: '2026-09-21', type: 'Wedase', status: 'ASSIGNED', lead: 'Hanna Tesfaye' },
];

// ── Audit Logs ────────────────────────────────────────────────────────────────
export const MOCK_AUDIT_TRAIL = [
  { id: 'aul-001', timestamp: '2026-09-10T09:30:00Z', user: 'admin', action: 'INSERT', table: 'persons', record: 'MBR-2026-0008', changes: 'New member registered', org: 'General Assembly', ip: '192.168.1.101' },
  { id: 'aul-002', timestamp: '2026-09-09T14:45:00Z', user: 'board_chair', action: 'UPDATE', table: 'governance_memberships', record: 'gm-002', changes: 'Status changed: PENDING → ACTIVE', org: 'Management Board', ip: '192.168.1.102' },
  { id: 'aul-003', timestamp: '2026-09-09T11:00:00Z', user: 'audit_inspector', action: 'LOGIN', table: 'system_users', record: 'sysuser-003', changes: 'User login', org: 'Audit Committee', ip: '192.168.1.103' },
  { id: 'aul-004', timestamp: '2026-09-08T16:20:00Z', user: 'admin', action: 'INSERT', table: 'student_records', record: 'REG-2026-0008', changes: 'Student enrolled: Hiwot Haile', org: 'Education Dept', ip: '192.168.1.101' },
  { id: 'aul-005', timestamp: '2026-09-08T10:30:00Z', user: 'admin', action: 'UPDATE', table: 'inventory_assets', record: 'AST-IT-0001', changes: 'Condition updated: FAIR → GOOD', org: 'Budget Dept', ip: '192.168.1.101' },
  { id: 'aul-006', timestamp: '2026-09-07T15:00:00Z', user: 'board_chair', action: 'APPROVE', table: 'financial_transactions', record: 'exp-004', changes: 'Expense approved: ETB 4,500', org: 'Finance', ip: '192.168.1.102' },
  { id: 'aul-007', timestamp: '2026-09-06T09:15:00Z', user: 'admin', action: 'INSERT', table: 'attendance_sessions', record: 'att-001', changes: 'Attendance recorded for Grade 3', org: 'Education Dept', ip: '192.168.1.101' },
  { id: 'aul-008', timestamp: '2026-09-05T13:45:00Z', user: 'admin', action: 'INSERT', table: 'income_records', record: 'inc-004', changes: 'Income recorded: ETB 12,000', org: 'Finance', ip: '192.168.1.101' },
];

// ── Admin — Users / Roles ─────────────────────────────────────────────────────
export const MOCK_SYSTEM_USERS_FULL = [
  { id: 'su-001', username: 'admin', name: 'Yohannes Tesfaye', name_am: 'ዮሐንስ ተስፋዬ', role: 'Super Administrator', role_am: 'ዋና አስተዳዳሪ', org: 'General Assembly', is_active: true, last_login: '2026-09-10T09:00:00Z', created: '2024-01-01' },
  { id: 'su-002', username: 'board_chair', name: 'Dawit Tadesse', name_am: 'ዳዊት ታደሰ', role: 'Board Officer', role_am: 'የሥራ አመራር ኃላፊ', org: 'Management Board', is_active: true, last_login: '2026-09-09T14:30:00Z', created: '2024-01-05' },
  { id: 'su-003', username: 'audit_inspector', name: 'Selamawit Girma', name_am: 'ሰላማዊት ግርማ', role: 'Audit Inspector', role_am: 'ኦዲት ተቆጣጣሪ', org: 'Audit Committee', is_active: true, last_login: '2026-09-08T10:00:00Z', created: '2024-01-08' },
  { id: 'su-004', username: 'tigist_teacher', name: 'Tigist Haile', name_am: 'ትግስት ኃይሌ', role: 'Teacher', role_am: 'አስተማሪ', org: 'Education Dept', is_active: true, last_login: '2026-09-07T08:00:00Z', created: '2024-02-01' },
];
