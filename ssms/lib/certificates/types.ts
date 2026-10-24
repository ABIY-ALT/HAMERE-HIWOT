// ─────────────────────────────────────────────────────────────────────────────
// Spiritual courses, who completed them, and certificates (migration 045) —
// data shapes and fixed lists. No server code.
// ─────────────────────────────────────────────────────────────────────────────

export type Bilingual = [en: string, am: string];
export type CourseKind = 'COURSE' | 'TRAINING' | 'SEMINAR' | 'RETREAT' | 'OTHER';
export type CompletionResult = 'COMPLETED' | 'PASSED' | 'ATTENDED';
export type CertificateKind = 'COURSE' | 'GRADUATION' | 'SERVICE' | 'MEMBERSHIP' | 'APPRECIATION' | 'OTHER';

export const COURSE_KINDS: Record<CourseKind, Bilingual> = {
  COURSE: ['Course', 'ኮርስ'],
  TRAINING: ['Training', 'ሥልጠና'],
  SEMINAR: ['Seminar', 'ሴሚናር'],
  RETREAT: ['Spiritual retreat', 'መንፈሳዊ ጉዞ / ጉባኤ'],
  OTHER: ['Other', 'ሌላ'],
};

export const RESULTS: Record<CompletionResult, Bilingual> = {
  COMPLETED: ['Completed', 'አጠናቋል'],
  PASSED: ['Passed', 'አልፏል'],
  ATTENDED: ['Attended', 'ተሳትፏል'],
};

/** Title, and the line under the name, of each kind of certificate ({x}: the course, department or year) */
export const CERTIFICATE_KINDS: Record<CertificateKind, { title: Bilingual; reason: Bilingual }> = {
  COURSE: { title: ['Certificate of Completion', 'የምስክር ወረቀት'], reason: ['for successfully completing {x}', '{x}ን በብቃት በማጠናቀቃቸው'] },
  GRADUATION: { title: ['Certificate of Graduation', 'የምረቃ የምስክር ወረቀት'], reason: ['for graduating from {x}', 'ከ{x} በመመረቃቸው'] },
  SERVICE: { title: ['Certificate of Service', 'የአገልግሎት የምስክር ወረቀት'], reason: ['for faithful service in {x}', 'በ{x} በታማኝነት በማገልገላቸው'] },
  MEMBERSHIP: { title: ['Certificate of Membership', 'የአባልነት የምስክር ወረቀት'], reason: ['as a member of {x}', 'የ{x} አባል በመሆናቸው'] },
  APPRECIATION: { title: ['Certificate of Appreciation', 'የምስጋና የምስክር ወረቀት'], reason: ['in appreciation of {x}', 'ለ{x} ምስጋና'] },
  OTHER: { title: ['Certificate', 'የምስክር ወረቀት'], reason: ['{x}', '{x}'] },
};

export interface Course {
  id: string;
  name_en: string;
  name_am: string;
  kind: CourseKind;
  hours: number | null;
  description: string;
  is_active: boolean;
  completed: number;
}

export interface Completion {
  id: string;
  course_id: string;
  person_id: string;
  name: string;
  name_am: string;
  code: string;
  completed_on: string;
  result: CompletionResult;
  note: string;
  /** Certificate number when one was given for it */
  certificate_no: string;
}

export interface Certificate {
  id: string;
  certificate_no: string;
  verify_code: string;
  person_id: string | null;
  person_name_en: string;
  person_name_am: string;
  kind: CertificateKind;
  title_en: string;
  title_am: string;
  reason_en: string;
  reason_am: string;
  issued_on: string;
  revoked_at: string | null;
  revoked_reason: string;
  issued_by: string;
}

/** A person to choose (a member or a student) */
export interface PersonOption {
  id: string;
  name: string;
  name_am: string;
  code: string;
  phone: string;
}

export interface CertificatesData {
  courses: Course[];
  completions: Completion[];
  certificates: Certificate[];
  /** The Sunday school's names, for printing */
  school: Bilingual;
  canManage: boolean;
}

/** What a public /verify page shows */
export interface VerifiedCertificate {
  school: Bilingual;
  certificate_no: string;
  person_name_en: string;
  person_name_am: string;
  title_en: string;
  title_am: string;
  reason_en: string;
  reason_am: string;
  issued_on: string;
  revoked: boolean;
}

export const fillReason = (template: string, x: string) => template.replace('{x}', x);
