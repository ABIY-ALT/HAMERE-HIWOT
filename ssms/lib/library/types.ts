// ─────────────────────────────────────────────────────────────────────────────
// Physical library (migration 043) — shared shapes, labels and the numbers the
// library pages show (who reads, what is read, what is late). No server code.
// A loan is a copy given to a person: to take HOME until a due date, or to
// READ in the library room (given back the same day).
// ─────────────────────────────────────────────────────────────────────────────

export type BookLanguage = 'AM' | 'GEEZ' | 'EN' | 'OM' | 'TI' | 'OTHER';
export type BookAudience = 'ALL' | 'CHILDREN' | 'YOUTH' | 'ADULT';
export type CopyStatus = 'AVAILABLE' | 'ON_LOAN' | 'IN_LIBRARY' | 'LOST' | 'DAMAGED' | 'WITHDRAWN';
export type CopyCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR';
export type CopySource = 'PURCHASE' | 'DONATION' | 'OTHER';
export type BorrowerKind = 'STUDENT' | 'TEACHER' | 'MEMBER' | 'OTHER';
export type LoanKind = 'HOME' | 'READING';
export type LoanStatus = 'OUT' | 'RETURNED' | 'LOST';

type Label = [en: string, am: string];

/** Stored as the key; the labels are shown */
export const BOOK_CATEGORIES: Record<string, Label> = {
  BIBLE: ['Bible & commentary', 'መጽሐፍ ቅዱስና ትርጓሜ'],
  DOGMA: ['Faith & doctrine', 'ትምህርተ ሃይማኖት'],
  LITURGY: ['Liturgy & prayer', 'ሥርዓተ አምልኮና ጸሎት'],
  SAINTS: ['Saints & synaxarium', 'ገድላት፣ ድርሳናትና ስንክሳር'],
  HISTORY: ['Church history', 'የቤተ ክርስቲያን ታሪክ'],
  ZEMA: ['Zema & hymns', 'ዜማና መዝሙር'],
  GEEZ: ['Ge’ez language', 'የግእዝ ቋንቋ'],
  TEXTBOOK: ['Sunday school textbooks', 'የሰንበት ት/ቤት ማስተማሪያ'],
  CHILDREN: ['Children’s books', 'የሕፃናት መጻሕፍት'],
  REFERENCE: ['Reference (dictionaries…)', 'ማጣቀሻ (መዝገበ ቃላት…)'],
  GENERAL: ['General', 'አጠቃላይ'],
};

export const BOOK_LANGUAGES: Record<BookLanguage, Label> = {
  AM: ['Amharic', 'አማርኛ'],
  GEEZ: ['Ge’ez', 'ግእዝ'],
  EN: ['English', 'እንግሊዝኛ'],
  OM: ['Afaan Oromo', 'ኦሮምኛ'],
  TI: ['Tigrinya', 'ትግርኛ'],
  OTHER: ['Other', 'ሌላ'],
};

export const BOOK_AUDIENCES: Record<BookAudience, Label> = {
  ALL: ['Everyone', 'ለሁሉም'],
  CHILDREN: ['Children', 'ሕፃናት'],
  YOUTH: ['Youth', 'ወጣቶች'],
  ADULT: ['Adults', 'አዋቂዎች'],
};

export const COPY_STATUS: Record<CopyStatus, { label: Label; badge: string }> = {
  AVAILABLE: { label: ['On the shelf', 'መደርደሪያ ላይ'], badge: 'badge badge-success' },
  ON_LOAN: { label: ['Taken home', 'ቤት ተወስዷል'], badge: 'badge badge-info' },
  IN_LIBRARY: { label: ['Being read here', 'እዚሁ እየተነበበ'], badge: 'badge bg-violet-100 text-violet-700' },
  LOST: { label: ['Lost', 'ጠፍቷል'], badge: 'badge badge-danger' },
  DAMAGED: { label: ['Damaged', 'ተበላሽቷል'], badge: 'badge badge-warning' },
  WITHDRAWN: { label: ['Withdrawn', 'ከአገልግሎት ወጥቷል'], badge: 'badge bg-slate-100 text-slate-500' },
};

export const COPY_CONDITIONS: Record<CopyCondition, Label> = {
  NEW: ['New', 'አዲስ'],
  GOOD: ['Good', 'ጥሩ'],
  FAIR: ['Fair', 'መካከለኛ'],
  POOR: ['Poor', 'ደካማ'],
};

export const COPY_SOURCES: Record<CopySource, Label> = {
  PURCHASE: ['Bought', 'የተገዛ'],
  DONATION: ['Donated', 'በስጦታ'],
  OTHER: ['Other', 'ሌላ'],
};

export const BORROWER_KINDS: Record<BorrowerKind, Label> = {
  STUDENT: ['Student', 'ተማሪ'],
  TEACHER: ['Teacher', 'መምህር'],
  MEMBER: ['Member', 'አባል'],
  OTHER: ['Other', 'ሌላ'],
};

export const LOAN_KINDS: Record<LoanKind, Label> = {
  HOME: ['Take home', 'ወደ ቤት'],
  READING: ['Read in the library', 'እዚሁ ማንበብ'],
};

export interface LibrarySettings {
  /** Days a book may be kept at home */
  loan_days: number;
  /** Books one person may have at home at once */
  max_home_loans: number;
}

export const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = { loan_days: 14, max_home_loans: 3 };
export const LIBRARY_SETTINGS_KEY = 'library_settings';

export interface LibraryBook {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  category: string;
  language: BookLanguage;
  audience: BookAudience;
  isbn: string;
  publisher: string;
  published_year: number | null;
  shelf: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface LibraryCopy {
  id: string;
  book_id: string;
  copy_no: string;
  status: CopyStatus;
  condition: CopyCondition;
  source: CopySource;
  donor: string;
  acquired_on: string | null;
  notes: string;
}

export interface LibraryLoan {
  id: string;
  copy_id: string;
  copy_no: string;
  book_id: string;
  person_id: string;
  person: string;
  person_am: string;
  phone: string;
  borrower_kind: BorrowerKind;
  kind: LoanKind;
  issued_at: string;
  due_date: string | null;
  returned_at: string | null;
  status: LoanStatus;
  renewals: number;
  condition_in: string | null;
  issued_by: string;
  notes: string;
}

export type RequestStatus = 'WAITING' | 'READY' | 'DONE' | 'CANCELLED';

export const REQUEST_STATUS: Record<RequestStatus, { label: Label; badge: string }> = {
  WAITING: { label: ['Waiting', 'በመጠባበቅ ላይ'], badge: 'badge badge-warning' },
  READY: { label: ['Ready to collect', 'ለመውሰድ ዝግጁ'], badge: 'badge badge-info' },
  DONE: { label: ['Given', 'ተሰጥቷል'], badge: 'badge badge-success' },
  CANCELLED: { label: ['Cancelled', 'ተሰርዟል'], badge: 'badge bg-slate-100 text-slate-500' },
};

/** Someone asked for a book (from the Telegram bot) */
export interface LibraryRequest {
  id: string;
  book_id: string;
  person_id: string;
  person: string;
  person_am: string;
  phone: string;
  status: RequestStatus;
  via: 'TELEGRAM' | 'DESK';
  note: string;
  requested_at: string;
  handled_at: string | null;
}

export interface LibraryData {
  books: LibraryBook[];
  copies: LibraryCopy[];
  /** Open loans and every loan of the last 18 months, newest first */
  loans: LibraryLoan[];
  /** Open requests and those of the last 60 days, newest first */
  requests: LibraryRequest[];
  settings: LibrarySettings;
}

export const EMPTY_LIBRARY: LibraryData = { books: [], copies: [], loans: [], requests: [], settings: DEFAULT_LIBRARY_SETTINGS };

/** Someone who can borrow: found by name, phone or registration number */
export interface BorrowerOption {
  id: string;
  name: string;
  name_am: string;
  phone: string;
  reg_no: string;
  kind: BorrowerKind;
  /** Books they have at home now, and how many of those are late */
  open: number;
  overdue: number;
}

// ── Numbers ──────────────────────────────────────────────────────────────────

/** Days a home loan is late on `today` (0 when not late or not a home loan) */
export function daysLate(loan: Pick<LibraryLoan, 'kind' | 'status' | 'due_date'>, today: string): number {
  if (loan.kind !== 'HOME' || loan.status !== 'OUT' || !loan.due_date || loan.due_date >= today) return 0;
  return Math.round((Date.parse(today) - Date.parse(loan.due_date)) / 86_400_000);
}

export interface LibraryStats {
  loans: number;
  home: number;
  reading: number;
  /** Different people who borrowed or read, by what they are */
  readers: Record<BorrowerKind, number>;
  readersTotal: number;
  topBooks: { book_id: string; count: number; home: number; reading: number }[];
  topReaders: { person_id: string; person: string; person_am: string; kind: BorrowerKind; count: number }[];
  byCategory: { category: string; count: number }[];
  /** Per month (YYYY-MM), oldest first */
  months: { month: string; home: number; reading: number }[];
}

/** The numbers for loans given on or after `since` (YYYY-MM-DD). */
export function libraryStats(data: LibraryData, since: string): LibraryStats {
  const loans = data.loans.filter((l) => l.issued_at.slice(0, 10) >= since);
  const bookById = new Map(data.books.map((b) => [b.id, b]));
  const readerKind = new Map<string, BorrowerKind>();
  const perBook = new Map<string, { count: number; home: number; reading: number }>();
  const perReader = new Map<string, { person: string; person_am: string; kind: BorrowerKind; count: number }>();
  const perCategory = new Map<string, number>();
  const perMonth = new Map<string, { home: number; reading: number }>();
  for (const l of loans) {
    readerKind.set(l.person_id, l.borrower_kind);
    const b = perBook.get(l.book_id) ?? { count: 0, home: 0, reading: 0 };
    b.count++;
    if (l.kind === 'HOME') b.home++;
    else b.reading++;
    perBook.set(l.book_id, b);
    const r = perReader.get(l.person_id) ?? { person: l.person, person_am: l.person_am, kind: l.borrower_kind, count: 0 };
    r.count++;
    perReader.set(l.person_id, r);
    const cat = bookById.get(l.book_id)?.category ?? 'GENERAL';
    perCategory.set(cat, (perCategory.get(cat) ?? 0) + 1);
    const m = l.issued_at.slice(0, 7);
    const mm = perMonth.get(m) ?? { home: 0, reading: 0 };
    if (l.kind === 'HOME') mm.home++;
    else mm.reading++;
    perMonth.set(m, mm);
  }
  const readers: Record<BorrowerKind, number> = { STUDENT: 0, TEACHER: 0, MEMBER: 0, OTHER: 0 };
  for (const k of readerKind.values()) readers[k]++;
  return {
    loans: loans.length,
    home: loans.filter((l) => l.kind === 'HOME').length,
    reading: loans.filter((l) => l.kind === 'READING').length,
    readers,
    readersTotal: readerKind.size,
    topBooks: [...perBook.entries()].map(([book_id, v]) => ({ book_id, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
    topReaders: [...perReader.entries()].map(([person_id, v]) => ({ person_id, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
    byCategory: [...perCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    months: [...perMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
  };
}

export const label = (l: Label | undefined, locale: string, fallback = '') => (l ? (locale === 'am' ? l[1] : l[0]) : fallback);
export const categoryName = (category: string, locale: string) => label(BOOK_CATEGORIES[category], locale, category);
