// ─────────────────────────────────────────────────────────────────────────────
// Programs (assemblies, conferences, holidays, events) — data shapes
// ─────────────────────────────────────────────────────────────────────────────

export type ProgramType = 'ASSEMBLY' | 'CONFERENCE' | 'HOLIDAY' | 'SERVICE' | 'TRAINING' | 'ACADEMIC' | 'OUTREACH' | 'OTHER';
export type ProgramStatus = 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface Program {
  id: string;
  title_en: string;
  title_am: string;
  type: ProgramType;
  unit_id: string | null;
  unit: string;
  unit_am: string;
  start_date: string;
  start_time: string; // HH:MM or ''
  end_date: string | null;
  location: string;
  coordinator_id: string | null;
  coordinator: string;
  expected: number | null;
  actual: number | null;
  description: string;
  outcome: string;
  status: ProgramStatus;
  created_by_id: string | null;
}

export interface ProgramOptions {
  units: { id: string; name_en: string; name_am: string }[];
  people: { id: string; name: string }[];
}

export const PROGRAM_TYPES: Record<ProgramType, [string, string]> = {
  ASSEMBLY: ['Assembly', 'ስብሰባ / ጉባኤ'],
  CONFERENCE: ['Spiritual conference', 'መንፈሳዊ ጉባኤ'],
  HOLIDAY: ['Holy day celebration', 'የበዓል አከባበር'],
  SERVICE: ['Service / worship', 'አገልግሎት'],
  TRAINING: ['Training / seminar', 'ሥልጠና / ሴሚናር'],
  ACADEMIC: ['Academic event', 'የትምህርት ዝግጅት'],
  OUTREACH: ['Outreach / charity', 'ስብከተ ወንጌል / በጎ አድራጎት'],
  OTHER: ['Other', 'ሌላ'],
};

/** Which types each Programs page shows. */
export const ASSEMBLY_TYPES: ProgramType[] = ['ASSEMBLY', 'CONFERENCE'];
export const EVENT_TYPES: ProgramType[] = ['HOLIDAY', 'SERVICE', 'TRAINING', 'ACADEMIC', 'OUTREACH', 'OTHER'];
