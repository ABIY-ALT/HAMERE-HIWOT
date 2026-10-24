// ─────────────────────────────────────────────────────────────────────────────
// Event sign-up (migration 046) — data shapes and wording, with no server
// code, so client pages can use them. Server work: lib/events/registrations.
// ─────────────────────────────────────────────────────────────────────────────

export const REG_MIGRATION = 'Run database migration 046 (event sign-up) first';

export type RegSource = 'WEB' | 'BOT' | 'OFFICE';
export type RegStatus = 'REGISTERED' | 'CANCELLED';

/** Seats one person may take from the website or the bot (the office may add up to 20) */
export const MAX_SEATS_SELF = 10;
export const MAX_SEATS_OFFICE = 20;

export const REG_SOURCES: Record<RegSource, [string, string]> = {
  WEB: ['Website', 'ድረ-ገጽ'],
  BOT: ['Telegram bot', 'ቴሌግራም ቦት'],
  OFFICE: ['Office', 'ጽ/ቤት'],
};

export interface Registration {
  id: string;
  ticket_code: string;
  full_name: string;
  phone: string;
  person_id: string | null;
  /** The member's code (on their ID card), when the registration is linked to a member */
  member_code: string;
  seats: number;
  note: string;
  source: RegSource;
  status: RegStatus;
  checked_in_at: string | null;
  created_at: string;
}

export interface RegistrationSettings {
  open: boolean;
  /** Seats; null = no limit */
  capacity: number | null;
  /** Last day to sign up (YYYY-MM-DD); null = until the program ends */
  closes_on: string | null;
}

/** A program on the sign-up page, with its numbers */
export interface RegEvent {
  id: string;
  title_en: string;
  title_am: string;
  start_date: string;
  start_time: string;
  end_date: string | null;
  location: string;
  status: 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  is_public: boolean;
  settings: RegistrationSettings;
  /** Live registrations and the seats they take */
  people: number;
  seats: number;
  /** Seats checked in at the door */
  arrived: number;
  /** The program's creator or a program manager: may change settings and cancel */
  can_manage: boolean;
}

export type RegFailure = 'CLOSED' | 'FULL' | 'DUPLICATE' | 'MIGRATION' | 'FAILED';

/** Why a sign-up did not go through, in both languages. */
export function failureText(reason: RegFailure, left?: number): { am: string; en: string } {
  switch (reason) {
    case 'CLOSED':
      return { am: 'ምዝገባው ተዘግቷል።', en: 'Registration for this event is closed.' };
    case 'FULL':
      return left
        ? { am: `የቀሩት ${left} ቦታዎች ብቻ ናቸው።`, en: `Only ${left} place(s) are left.` }
        : { am: 'ቦታው ሞልቷል።', en: 'This event is full.' };
    case 'DUPLICATE':
      return { am: 'በዚህ ስልክ ቁጥር ቀድሞ ተመዝግበዋል።', en: 'This phone number is already registered for this event.' };
    case 'MIGRATION':
      return { am: 'ምዝገባ ገና አልተዘጋጀም።', en: 'Sign-up is not set up yet.' };
    default:
      return { am: 'ይቅርታ፣ ምዝገባው አልተሳካም። ትንሽ ቆይተው ይሞክሩ።', en: 'Sorry, the registration did not go through. Please try again later.' };
  }
}

/** Seats still free (null = no limit) */
export const seatsLeft = (capacity: number | null, taken: number): number | null => (capacity === null ? null : Math.max(capacity - taken, 0));
