'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Library (migration 043): the catalogue, its copies, and lending.
//   see the catalogue, loans and numbers    LIBRARY_VIEW (or LIBRARY_MANAGE)
//   books, copies, lending, returns, rules  LIBRARY_MANAGE
// A borrower is any person (student, teacher, member…); what they are is
// worked out when the book is given and kept on the loan, so the readers'
// numbers stay right when someone later stops being a student.
// The copy's status follows its loans (trigger library_sync_copy).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorizeIn, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  BOOK_CATEGORIES,
  DEFAULT_LIBRARY_SETTINGS,
  LIBRARY_SETTINGS_KEY,
  type BookAudience,
  type BookLanguage,
  type BorrowerKind,
  type BorrowerOption,
  type CopyCondition,
  type CopySource,
  type CopyStatus,
  type LibraryBook,
  type LibraryCopy,
  type LibraryData,
  type LibraryLoan,
  type LibraryRequest,
  type LibrarySettings,
  type LoanKind,
  type LoanStatus,
  type RequestStatus,
} from '@/lib/library/types';
import { tellBorrower } from '@/lib/library/notify';

type Row = Record<string, unknown> & { id: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'Unknown record');
const HISTORY_MONTHS = 18;
const friendly = (e: unknown) => {
  const msg = errorMessage(e);
  return /library_(books|copies|loans)/.test(msg) && /does not exist|schema cache|relation/.test(msg)
    ? 'Run database migration 043 (library) first'
    : msg === 'MODULE:library'
      ? 'The library is not in your plan'
      : msg;
};

const str = (v: unknown) => (v == null ? '' : String(v));

function toBook(r: Row): LibraryBook {
  return {
    id: r.id,
    title: str(r.title),
    subtitle: str(r.subtitle),
    author: str(r.author),
    category: str(r.category) || 'GENERAL',
    language: (r.language as BookLanguage) ?? 'AM',
    audience: (r.audience as BookAudience) ?? 'ALL',
    isbn: str(r.isbn),
    publisher: str(r.publisher),
    published_year: r.published_year == null ? null : Number(r.published_year),
    shelf: str(r.shelf),
    description: str(r.description),
    is_active: r.is_active !== false,
    created_at: str(r.created_at),
  };
}

function toCopy(r: Row): LibraryCopy {
  return {
    id: r.id,
    book_id: str(r.book_id),
    copy_no: str(r.copy_no),
    status: r.status as CopyStatus,
    condition: r.condition as CopyCondition,
    source: r.source as CopySource,
    donor: str(r.donor),
    acquired_on: (r.acquired_on as string) ?? null,
    notes: str(r.notes),
  };
}

const LOAN_COLUMNS =
  '*, borrower:persons!library_loans_borrower_fkey(full_name_en, full_name_am, phone_primary), copy:library_copies!library_loans_copy_fkey(copy_no), issuer:system_users!library_loans_issued_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))';

function toLoan(r: Row): LibraryLoan {
  const p = (r.borrower ?? {}) as { full_name_en?: string; full_name_am?: string | null; phone_primary?: string | null };
  return {
    id: r.id,
    copy_id: str(r.copy_id),
    copy_no: str((r.copy as { copy_no?: string } | null)?.copy_no),
    book_id: str(r.book_id),
    person_id: str(r.borrower_person_id),
    person: p.full_name_en ?? '—',
    person_am: p.full_name_am || p.full_name_en || '—',
    phone: p.phone_primary ?? '',
    borrower_kind: r.borrower_kind as BorrowerKind,
    kind: r.kind as LoanKind,
    issued_at: str(r.issued_at),
    due_date: (r.due_date as string) ?? null,
    returned_at: (r.returned_at as string) ?? null,
    status: r.status as LoanStatus,
    renewals: Number(r.renewals ?? 0),
    condition_in: (r.condition_in as string) ?? null,
    issued_by: str((r.issuer as { person?: { full_name_en?: string } } | null)?.person?.full_name_en),
    notes: str(r.notes),
  };
}

function toRequest(r: Row): LibraryRequest {
  const p = (r.person ?? {}) as { full_name_en?: string; full_name_am?: string | null; phone_primary?: string | null };
  return {
    id: r.id,
    book_id: str(r.book_id),
    person_id: str(r.person_id),
    person: p.full_name_en ?? '—',
    person_am: p.full_name_am || p.full_name_en || '—',
    phone: p.phone_primary ?? '',
    status: r.status as RequestStatus,
    via: r.via as LibraryRequest['via'],
    note: str(r.note),
    requested_at: str(r.requested_at),
    handled_at: (r.handled_at as string) ?? null,
  };
}

async function loadSettings(db: SupabaseClient): Promise<LibrarySettings> {
  const { data } = await db.from('system_settings').select('value').eq('key', LIBRARY_SETTINGS_KEY).maybeSingle();
  return { ...DEFAULT_LIBRARY_SETTINGS, ...((data?.value as Partial<LibrarySettings>) ?? {}) };
}

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadLibrary(): Promise<Loaded<LibraryData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_VIEW', 'LIBRARY_MANAGE');
    const since = new Date(Date.now() - HISTORY_MONTHS * 31 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const [books, copies, loans, settings, requests] = await Promise.all([
      selectAll<Row>((a, b) => db.from('library_books').select('*').order('title').order('id').range(a, b)),
      selectAll<Row>((a, b) => db.from('library_copies').select('*').order('copy_no').order('id').range(a, b)),
      selectAll<Row>((a, b) =>
        db.from('library_loans').select(LOAN_COLUMNS).or(`status.eq.OUT,issued_at.gte.${since}`).order('issued_at', { ascending: false }).order('id').range(a, b)
      ),
      loadSettings(db),
      selectAll<Row>((a, b) =>
        db.from('library_requests')
          .select('*, person:persons!library_requests_person_fkey(full_name_en, full_name_am, phone_primary)')
          .or(`status.in.(WAITING,READY),requested_at.gte.${recent}`)
          .order('requested_at', { ascending: false })
          .order('id')
          .range(a, b)
      ),
    ]);
    return {
      mode: 'live',
      data: { books: books.map(toBook), copies: copies.map(toCopy), loans: loans.map(toLoan), requests: requests.map(toRequest), settings },
    };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

/** Every loan of one person (their reading history), newest first. */
export async function loadReaderHistory(personId: string): Promise<{ ok: true; loans: LibraryLoan[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_VIEW', 'LIBRARY_MANAGE');
    const rows = await selectAll<Row>((a, b) =>
      db.from('library_loans').select(LOAN_COLUMNS).eq('borrower_person_id', uuid.parse(personId)).order('issued_at', { ascending: false }).order('id').range(a, b)
    );
    return { ok: true, loans: rows.map(toLoan) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Borrowers ────────────────────────────────────────────────────────────────

/** What each person is now: student (active), teacher, member — in that order — or other. */
async function kindsOf(db: SupabaseClient, personIds: string[]): Promise<Map<string, BorrowerKind>> {
  const out = new Map<string, BorrowerKind>();
  if (personIds.length === 0) return out;
  const [students, teaching, homeroom, members] = await Promise.all([
    db.from('students').select('person_id').eq('status', 'ACTIVE').in('person_id', personIds),
    db.from('service_assignments').select('person_id').eq('role_kind', 'TEACHER').eq('status', 'ACTIVE').in('person_id', personIds),
    db.from('classes').select('teacher_person_id').in('teacher_person_id', personIds),
    db.from('persons').select('id').not('membership_type', 'is', null).in('id', personIds),
  ]);
  const set = (rows: unknown, key: string) => new Set(((rows ?? []) as Record<string, string>[]).map((r) => r[key]));
  const student = set(students.data, 'person_id');
  const teacher = new Set([...set(teaching.data, 'person_id'), ...set(homeroom.data, 'teacher_person_id')]);
  const member = set(members.data, 'id');
  for (const id of personIds) out.set(id, student.has(id) ? 'STUDENT' : teacher.has(id) ? 'TEACHER' : member.has(id) ? 'MEMBER' : 'OTHER');
  return out;
}

/** People to lend to, by name (Amharic or English), phone or student registration number. */
export async function findBorrowers(query: string): Promise<{ ok: true; people: BorrowerOption[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    // Characters that would change the search filter itself are dropped
    const q = query.replace(/[,()*%\\]/g, ' ').trim();
    if (q.length < 2) return { ok: true, people: [] };
    const like = `%${q}%`;
    const [byPerson, byReg] = await Promise.all([
      db.from('persons')
        .select('id, full_name_en, full_name_am, phone_primary')
        .eq('status', 'ACTIVE')
        .or(`full_name_en.ilike.${like},full_name_am.ilike.${like},phone_primary.ilike.${like},membership_code.ilike.${like}`)
        .order('full_name_en')
        .limit(20),
      db.from('students').select('person_id, reg_no').ilike('reg_no', like).limit(10),
    ]);
    const regRows = (byReg.data ?? []) as { person_id: string; reg_no: string }[];
    let people = (byPerson.data ?? []) as { id: string; full_name_en: string; full_name_am: string | null; phone_primary: string | null }[];
    const missing = regRows.map((r) => r.person_id).filter((id) => !people.some((p) => p.id === id));
    if (missing.length) {
      const { data } = await db.from('persons').select('id, full_name_en, full_name_am, phone_primary').eq('status', 'ACTIVE').in('id', missing);
      people = [...people, ...((data ?? []) as typeof people)];
    }
    const ids = people.map((p) => p.id);
    if (ids.length === 0) return { ok: true, people: [] };
    const [kinds, regs, open] = await Promise.all([
      kindsOf(db, ids),
      db.from('students').select('person_id, reg_no').in('person_id', ids),
      db.from('library_loans').select('borrower_person_id, due_date').eq('status', 'OUT').eq('kind', 'HOME').in('borrower_person_id', ids),
    ]);
    const regOf = new Map(((regs.data ?? []) as { person_id: string; reg_no: string }[]).map((r) => [r.person_id, r.reg_no]));
    const today = todayIso();
    const openRows = (open.data ?? []) as { borrower_person_id: string; due_date: string | null }[];
    return {
      ok: true,
      people: people.slice(0, 25).map((p) => {
        const mine = openRows.filter((l) => l.borrower_person_id === p.id);
        return {
          id: p.id,
          name: p.full_name_en,
          name_am: p.full_name_am || p.full_name_en,
          phone: p.phone_primary ?? '',
          reg_no: regOf.get(p.id) ?? '',
          kind: kinds.get(p.id) ?? 'OTHER',
          open: mine.length,
          overdue: mine.filter((l) => l.due_date && l.due_date < today).length,
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Lending ──────────────────────────────────────────────────────────────────

const LendSchema = z.object({
  copy_id: uuid,
  person_id: uuid,
  kind: z.enum(['HOME', 'READING']),
  due_date: z.string(),
  notes: z.string().trim().max(500),
  /** Lend although the person is at their limit or has a late book */
  override: z.boolean(),
});

export type LendInput = z.input<typeof LendSchema>;

/** needs_override: the person is at the limit or has a late book — the librarian may still go ahead. */
export async function lendBook(input: LendInput): Promise<{ ok: true } | { ok: false; error: string; needs_override?: boolean }> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const l = LendSchema.parse(input);
    const today = todayIso();
    if (l.kind === 'HOME' && (!/^\d{4}-\d{2}-\d{2}$/.test(l.due_date) || l.due_date < today)) throw new Error('Choose a return date from today on');

    const copy = (await db.from('library_copies').select('id, book_id, status, copy_no').eq('id', l.copy_id).maybeSingle().then(check)) as {
      id: string; book_id: string; status: CopyStatus; copy_no: string;
    } | null;
    if (!copy) throw new Error('This copy was not found');
    if (copy.status !== 'AVAILABLE') throw new Error(`${copy.copy_no} is not on the shelf now`);
    const { data: person } = await db.from('persons').select('id').eq('id', l.person_id).eq('status', 'ACTIVE').maybeSingle();
    if (!person) throw new Error('This person was not found');

    if (l.kind === 'HOME' && !l.override) {
      const settings = await loadSettings(db);
      const open = (await db.from('library_loans').select('due_date').eq('borrower_person_id', l.person_id).eq('status', 'OUT').eq('kind', 'HOME').then(check)) as { due_date: string | null }[];
      const late = open.filter((x) => x.due_date && x.due_date < today).length;
      if (late) return { ok: false, needs_override: true, error: `This person has ${late} late book(s) at home` };
      if (open.length >= settings.max_home_loans) return { ok: false, needs_override: true, error: `This person already has ${open.length} book(s) at home (the limit is ${settings.max_home_loans})` };
    }

    const kind = (await kindsOf(db, [l.person_id])).get(l.person_id) ?? 'OTHER';
    const { data: loan, error } = await db.from('library_loans')
      .insert({
        copy_id: copy.id,
        book_id: copy.book_id,
        borrower_person_id: l.person_id,
        borrower_kind: kind,
        kind: l.kind,
        due_date: l.kind === 'HOME' ? l.due_date : null,
        notes: l.notes || null,
        issued_by: me.systemUser.id,
      })
      .select('id')
      .single();
    if (error || !loan) throw new Error(error?.code === '23505' ? `${copy.copy_no} was just given to someone else` : error?.message ?? 'Could not save');
    // Their request for this book (if any) is done
    await db.from('library_requests')
      .update({ status: 'DONE', loan_id: loan.id, handled_by: me.systemUser.id, handled_at: new Date().toISOString() })
      .eq('person_id', l.person_id)
      .eq('book_id', copy.book_id)
      .in('status', ['WAITING', 'READY']);
    const who = await bookAndPerson(db, copy.book_id, l.person_id);
    tellBorrower(l.person_id, who.name, { kind: 'LENT', title: who.title, copyNo: copy.copy_no, due: l.kind === 'HOME' ? l.due_date : null });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Takes a book back; a damaged book is marked damaged (it leaves the shelf). */
export async function returnLoan(loanId: string, condition: 'GOOD' | 'FAIR' | 'DAMAGED', note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const c = z.enum(['GOOD', 'FAIR', 'DAMAGED']).parse(condition);
    const n = z.string().trim().max(500).parse(note);
    const done = (await db.from('library_loans')
      .update({ status: 'RETURNED', returned_at: new Date().toISOString(), returned_by: me.systemUser.id, condition_in: c, ...(n ? { notes: n } : {}) })
      .eq('id', uuid.parse(loanId))
      .eq('status', 'OUT')
      .select('book_id, borrower_person_id')
      .then(check)) as { book_id: string; borrower_person_id: string }[];
    if (!done.length) throw new Error('This book was already given back');
    const who = await bookAndPerson(db, done[0].book_id, done[0].borrower_person_id);
    tellBorrower(done[0].borrower_person_id, who.name, { kind: 'RETURNED', title: who.title, damaged: c === 'DAMAGED' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function renewLoan(loanId: string, dueDate: string): Promise<ActionResult> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const due = isoDate.parse(dueDate);
    if (due <= todayIso()) throw new Error('Choose a date after today');
    const loan = (await db.from('library_loans').select('id, kind, status, renewals, book_id, borrower_person_id').eq('id', uuid.parse(loanId)).maybeSingle().then(check)) as {
      id: string; kind: LoanKind; status: LoanStatus; renewals: number; book_id: string; borrower_person_id: string;
    } | null;
    if (!loan || loan.status !== 'OUT' || loan.kind !== 'HOME') throw new Error('Only a book that is at home can get more time');
    await db.from('library_loans').update({ due_date: due, renewals: loan.renewals + 1 }).eq('id', loan.id).eq('status', 'OUT').then(check);
    const who = await bookAndPerson(db, loan.book_id, loan.borrower_person_id);
    tellBorrower(loan.borrower_person_id, who.name, { kind: 'RENEWED', title: who.title, due });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function markLoanLost(loanId: string, note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const n = z.string().trim().min(3, 'Write what happened').max(500).parse(note);
    const done = (await db.from('library_loans')
      .update({ status: 'LOST', returned_at: new Date().toISOString(), returned_by: me.systemUser.id, notes: n })
      .eq('id', uuid.parse(loanId))
      .eq('status', 'OUT')
      .select('id')
      .then(check)) as { id: string }[];
    if (!done.length) throw new Error('This loan is already closed');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** The book's title and the person's name, for the messages to borrowers */
async function bookAndPerson(db: SupabaseClient, bookId: string, personId: string): Promise<{ title: string; name: string }> {
  const [{ data: book }, { data: person }] = await Promise.all([
    db.from('library_books').select('title').eq('id', bookId).maybeSingle(),
    db.from('persons').select('full_name_en, full_name_am').eq('id', personId).maybeSingle(),
  ]);
  const p = person as { full_name_en: string; full_name_am: string | null } | null;
  return { title: (book as { title: string } | null)?.title ?? '', name: p?.full_name_am || p?.full_name_en || '' };
}

// ── Requests (from the Telegram bot) ─────────────────────────────────────────

/** Tell the person their book is ready to collect. */
export async function markRequestReady(requestId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const done = (await db.from('library_requests')
      .update({ status: 'READY', handled_by: me.systemUser.id, handled_at: new Date().toISOString() })
      .eq('id', uuid.parse(requestId))
      .eq('status', 'WAITING')
      .select('book_id, person_id')
      .then(check)) as { book_id: string; person_id: string }[];
    if (!done.length) throw new Error('This request is no longer waiting');
    const who = await bookAndPerson(db, done[0].book_id, done[0].person_id);
    tellBorrower(done[0].person_id, who.name, { kind: 'READY', title: who.title });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Closes a request without lending (the person is told why). */
export async function cancelLibraryRequest(requestId: string, note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const n = z.string().trim().min(3, 'Write a short reason for the person').max(300).parse(note);
    const done = (await db.from('library_requests')
      .update({ status: 'CANCELLED', note: n, handled_by: me.systemUser.id, handled_at: new Date().toISOString() })
      .eq('id', uuid.parse(requestId))
      .in('status', ['WAITING', 'READY'])
      .select('book_id, person_id')
      .then(check)) as { book_id: string; person_id: string }[];
    if (!done.length) throw new Error('This request is already closed');
    const who = await bookAndPerson(db, done[0].book_id, done[0].person_id);
    tellBorrower(done[0].person_id, who.name, { kind: 'REQUEST_CANCELLED', title: who.title, note: n });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Catalogue ────────────────────────────────────────────────────────────────

const BookSchema = z.object({
  title: z.string().trim().min(2, 'Enter the title').max(300),
  subtitle: z.string().trim().max(300),
  author: z.string().trim().max(200),
  category: z.string().refine((c) => c in BOOK_CATEGORIES, 'Choose a category'),
  language: z.enum(['AM', 'GEEZ', 'EN', 'OM', 'TI', 'OTHER']),
  audience: z.enum(['ALL', 'CHILDREN', 'YOUTH', 'ADULT']),
  isbn: z.string().trim().max(40),
  publisher: z.string().trim().max(200),
  published_year: z.union([z.literal(''), z.coerce.number().int().min(1000).max(2100)]),
  shelf: z.string().trim().max(60),
  description: z.string().trim().max(2000),
  is_active: z.boolean(),
});

const CopiesSchema = z.object({
  count: z.coerce.number().int().min(0).max(200, 'At most 200 copies at a time'),
  source: z.enum(['PURCHASE', 'DONATION', 'OTHER']),
  donor: z.string().trim().max(200),
  acquired_on: z.string(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']),
});

export type BookInput = z.input<typeof BookSchema>;
export type CopiesInput = z.input<typeof CopiesSchema>;

const bookFields = (b: z.output<typeof BookSchema>) => ({
  title: b.title,
  subtitle: b.subtitle || null,
  author: b.author || null,
  category: b.category,
  language: b.language,
  audience: b.audience,
  isbn: b.isbn || null,
  publisher: b.publisher || null,
  published_year: b.published_year === '' ? null : b.published_year,
  shelf: b.shelf || null,
  description: b.description || null,
  is_active: b.is_active,
});

const copyRows = (bookId: string, c: z.output<typeof CopiesSchema>) =>
  Array.from({ length: c.count }, () => ({
    book_id: bookId,
    source: c.source,
    donor: c.source === 'DONATION' ? c.donor || null : null,
    acquired_on: /^\d{4}-\d{2}-\d{2}$/.test(c.acquired_on) ? c.acquired_on : null,
    condition: c.condition,
  }));

/** A new title (with its first copies) or changes to one. */
export async function saveBook(id: string | null, input: BookInput, copies?: CopiesInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const b = BookSchema.parse(input);
    if (id) {
      await db.from('library_books').update(bookFields(b)).eq('id', uuid.parse(id)).then(check);
      return { ok: true };
    }
    const c = CopiesSchema.parse(copies ?? { count: 1, source: 'PURCHASE', donor: '', acquired_on: '', condition: 'GOOD' });
    const book = (await db.from('library_books').insert({ ...bookFields(b), created_by: me.systemUser.id }).select('id').single().then(check)) as { id: string };
    if (c.count) await db.from('library_copies').insert(copyRows(book.id, c)).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function addCopies(bookId: string, input: CopiesInput): Promise<ActionResult> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const c = CopiesSchema.parse(input);
    if (c.count < 1) throw new Error('Add at least one copy');
    await db.from('library_copies').insert(copyRows(uuid.parse(bookId), c)).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

const CopyUpdateSchema = z.object({
  status: z.enum(['AVAILABLE', 'LOST', 'DAMAGED', 'WITHDRAWN']),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']),
  notes: z.string().trim().max(500),
});

/** Shelf state of a copy that is not lent out (repaired, damaged, withdrawn, found again…). */
export async function updateCopy(copyId: string, input: z.input<typeof CopyUpdateSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const u = CopyUpdateSchema.parse(input);
    const done = (await db.from('library_copies')
      .update({ status: u.status, condition: u.condition, notes: u.notes || null })
      .eq('id', uuid.parse(copyId))
      .not('status', 'in', '(ON_LOAN,IN_LIBRARY)')
      .select('id')
      .then(check)) as { id: string }[];
    if (!done.length) throw new Error('This copy is lent out — take it back first');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Removes a title entered by mistake — only while it has never been lent. */
export async function deleteBook(bookId: string): Promise<ActionResult> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const id = uuid.parse(bookId);
    const { count } = await db.from('library_loans').select('id', { count: 'exact', head: true }).eq('book_id', id);
    if (count) throw new Error('This book has been lent before — switch it off (not in use) instead');
    await db.from('library_books').delete().eq('id', id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

const ImportSchema = z.array(BookSchema.extend({ copies: CopiesSchema })).min(1, 'Nothing to import').max(1000, 'Import at most 1,000 books at a time');

/** Books from the import template, each with its copies. */
export async function importBooks(input: z.input<typeof ImportSchema>): Promise<{ ok: true; books: number; copies: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const rows = ImportSchema.parse(input);
    let copies = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const created = (await db.from('library_books')
        .insert(chunk.map(({ copies: _c, ...b }) => (void _c, { ...bookFields(b), created_by: me.systemUser.id })))
        .select('id')
        .then(check)) as { id: string }[];
      const all = created.flatMap((b, j) => copyRows(b.id, chunk[j].copies));
      for (let k = 0; k < all.length; k += 500) await db.from('library_copies').insert(all.slice(k, k + 500)).then(check);
      copies += all.length;
    }
    return { ok: true, books: rows.length, copies };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Rules ────────────────────────────────────────────────────────────────────

const SettingsSchema = z.object({
  loan_days: z.coerce.number().int().min(1, 'At least 1 day').max(365),
  max_home_loans: z.coerce.number().int().min(1, 'At least 1 book').max(50),
});

export async function saveLibrarySettings(input: z.input<typeof SettingsSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorizeIn('library', 'LIBRARY_MANAGE');
    const s = SettingsSchema.parse(input);
    await db.from('system_settings').upsert({ key: LIBRARY_SETTINGS_KEY, value: s }, { onConflict: 'key' }).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
