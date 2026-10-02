// ─────────────────────────────────────────────────────────────────────────────
// Organization (departments & coordinations) data shapes
// ─────────────────────────────────────────────────────────────────────────────

export type UnitKind = 'DEPARTMENT' | 'COORDINATION';

export interface UnitPerson {
  name: string;
  name_am: string;
  phone: string;
  role: string;
  role_am: string;
  role_code: string;
}

export interface UnitSummary {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  description_en: string;
  description_am: string;
  is_active: boolean;
  sort_order: number;
  /** People assigned with the unit's head role (Department Head / Coordinator). */
  heads: UnitPerson[];
  /** Everyone with an active account assignment to the unit. */
  people: UnitPerson[];
  /** Current-year budget; null when the viewer cannot see finance or none is set up. */
  budget: { year: string; allocated: number | null; used: number } | null;
  /** Payment requests awaiting approval or payment; null without finance access. */
  openRequests: number | null;
}

export interface StructureView {
  coordinations: UnitSummary[];
  departments: UnitSummary[];
  /** Active members per governance body, by organization unit code. */
  bodies: Record<string, { active: number; seats: number | null }>;
}

/** The role that marks someone as the head of a unit of this kind. */
export const HEAD_ROLE: Record<UnitKind, string> = {
  DEPARTMENT: 'DEPT_HEAD',
  COORDINATION: 'COORDINATOR',
};
