// ─────────────────────────────────────────────────────────────────────────────
// Choir & sacred arts — data shapes and fixed lists
// ─────────────────────────────────────────────────────────────────────────────

import type { AttendanceStatus } from '@/lib/attendance/store';

export type VoicePart = 'SOPRANO' | 'ALTO' | 'TENOR' | 'BASS' | 'NOT_SET';
export type HymnCategory = 'KIDASE' | 'MEZMUR' | 'WEDASE' | 'KINE' | 'ZEMA' | 'OTHER';
export type SessionKind = 'REHEARSAL' | 'SERVICE' | 'PERFORMANCE';
export type SessionStatus = 'PLANNED' | 'HELD' | 'CANCELLED';

export interface ChoirMember {
  id: string;
  person_id: string;
  name: string;
  name_am: string;
  phone: string;
  voice_part: VoicePart;
  instruments: string[];
  vestment_id: string | null;
  vestment: string; // tag · name
  joined_on: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string;
  /** Rehearsal / service attendance over the sessions held so far. */
  attended: number;
  sessions: number;
}

export interface Hymn {
  id: string;
  title_am: string;
  title_en: string;
  category: HymnCategory;
  feast: string;
  lyrics: string;
  notes: string;
  is_active: boolean;
  times_sung: number;
  last_sung: string | null;
}

export interface ChoirSession {
  id: string;
  date: string;
  start_time: string;
  kind: SessionKind;
  title: string;
  location: string;
  program_id: string | null;
  program: string;
  lead_member_id: string | null;
  lead: string;
  status: SessionStatus;
  notes: string;
  hymn_ids: string[];
  attendance: Record<string, AttendanceStatus>; // member id → status
}

export interface ChoirData {
  members: ChoirMember[];
  hymns: Hymn[];
  sessions: ChoirSession[];
  candidates: { id: string; name: string }[]; // members not yet in the choir
  vestments: { id: string; label: string }[];
  programs: { id: string; label: string }[];
}

export const EMPTY_CHOIR: ChoirData = { members: [], hymns: [], sessions: [], candidates: [], vestments: [], programs: [] };

export const VOICE_PARTS: Record<VoicePart, [string, string]> = {
  SOPRANO: ['Soprano', 'ሶፕራኖ'],
  ALTO: ['Alto', 'አልቶ'],
  TENOR: ['Tenor', 'ቴነር'],
  BASS: ['Bass', 'ባስ'],
  NOT_SET: ['Not set', 'ያልተወሰነ'],
};

/** Traditional instruments of the Ethiopian Orthodox Tewahedo liturgy. */
export const INSTRUMENTS: Record<string, [string, string]> = {
  KEBERO: ['Kebero (drum)', 'ከበሮ'],
  TSENATSIL: ['Tsenatsil (sistrum)', 'ጸናጽል'],
  MEKUAMIA: ['Mekuamia (prayer staff)', 'መቋሚያ'],
  BEGENA: ['Begena', 'በገና'],
  MASINKO: ['Masinko', 'ማሲንቆ'],
  OTHER: ['Other', 'ሌላ'],
};

export const HYMN_CATEGORIES: Record<HymnCategory, [string, string]> = {
  KIDASE: ['Kidase (liturgy)', 'ቅዳሴ'],
  MEZMUR: ['Mezmur (hymn)', 'መዝሙር'],
  WEDASE: ['Wedase (praise)', 'ውዳሴ'],
  KINE: ['Kine (poetry)', 'ቅኔ'],
  ZEMA: ['Zema (chant)', 'ዜማ'],
  OTHER: ['Other', 'ሌላ'],
};

export const SESSION_KINDS: Record<SessionKind, [string, string]> = {
  REHEARSAL: ['Rehearsal', 'ልምምድ'],
  SERVICE: ['Service', 'አገልግሎት'],
  PERFORMANCE: ['Performance / event', 'ዝግጅት'],
};
