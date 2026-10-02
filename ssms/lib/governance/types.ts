// ─────────────────────────────────────────────────────────────────────────────
// Governance (bodies, positions, appointments) data shapes
// ─────────────────────────────────────────────────────────────────────────────

export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'RESIGNED' | 'REMOVED';

export interface GovPosition {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  authority_level: number;
}

export interface GovMembership {
  id: string;
  person_id: string;
  person: string;
  person_am: string;
  member_code: string;
  phone: string;
  position_id: string;
  position: string;
  position_am: string;
  position_code: string;
  authority_level: number;
  appointment_date: string;
  term_start: string;
  term_end: string | null;
  status: MembershipStatus;
  appointed_by: string;
  remarks: string;
}

export interface GovCandidate {
  id: string;
  name_en: string;
  name_am: string;
  code: string;
}

export interface GovBodyView {
  body: { id: string; name_en: string; name_am: string; description_en: string; description_am: string } | null;
  /** Number of seats when the body has an EXACT_MEMBER_COUNT rule. */
  seatLimit: number | null;
  ruleText_en: string;
  ruleText_am: string;
  positions: GovPosition[];
  memberships: GovMembership[];
  candidates: GovCandidate[];
}

/** Positions that only one active member of a body may hold. */
export const SINGLE_HOLDER_POSITIONS = ['CHAIRPERSON', 'VICE_CHAIR', 'SECRETARY', 'TREASURER'];
