// ─────────────────────────────────────────────────────────────────────────────
// "📚 Library" in the Telegram bot — server only (migration 043). For the
// chat's own people (members, students, teachers…):
//   • the books they have now (at home, until when; anything late) and their
//     open requests;
//   • find a book by its title or author and see at once whether a copy is on
//     the shelf, or when the first one comes back;
//   • ask for it: the request appears on the library pages straight away and
//     the librarians are told (push / Telegram); the librarian answers from
//     the website (ready to collect, given, or closed with a reason).
// Steps, kept in telegram_sessions:
//   LIB_MENU  what they have; any words → search
//   LIB_LIST  books found (one button each); words → a new search
//   LIB_BOOK  one book: availability and "📥 I want this book"
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { notifyLater } from '@/lib/push/send';
import { BOOK_CATEGORIES, daysLate } from '@/lib/library/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const e = escapeHtml;
const FIND = '🔍 መጽሐፍ ፈልግ · Find a book';
const WANT = '📥 ይህን መጽሐፍ እፈልጋለሁ · I want this book';
const BACK = '⬅️ ወደ ውጤቶቹ · Back to the results';
const MAX_LIST = 10;

export interface LibraryChatData {
  list?: { id: string; button: string }[];
  book_id?: string;
}

type Step = 'LIB_MENU' | 'LIB_LIST' | 'LIB_BOOK';
const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, step: Step, data: LibraryChatData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/** The people this chat may borrow for: those it is linked to as themselves. */
export function borrowersOf(scope: ChatScope): string[] {
  return scope.ownPersonIds;
}

/** "📚 Library": what they have now, and how to find a book. */
export async function startLibrary(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>, enabled: boolean) {
  if (!enabled) return sendTelegram(chatId, e('ቤተ መጻሕፍቱ አሁን አይገኝም። · The library is not available now.'), menu);
  const people = borrowersOf(scope);
  const today = todayIso();
  const lines = [`📚 <b>${e('ቤተ መጻሕፍት · Library')}</b>`, ''];
  if (people.length) {
    const [{ data: loans, error }, { data: requests }] = await Promise.all([
      db.from('library_loans').select('kind, due_date, status, book:library_books!library_loans_book_fkey(title), copy:library_copies!library_loans_copy_fkey(copy_no)').in('borrower_person_id', people).eq('status', 'OUT').order('due_date'),
      db.from('library_requests').select('status, book:library_books!library_requests_book_fkey(title)').in('person_id', people).in('status', ['WAITING', 'READY']),
    ]);
    if (error) return sendTelegram(chatId, e('ቤተ መጻሕፍቱ ገና አልተዘጋጀም። · The library is not set up yet.'), menu);
    const open = (loans ?? []) as unknown as { kind: 'HOME' | 'READING'; due_date: string | null; status: 'OUT'; book: { title: string } | null; copy: { copy_no: string } | null }[];
    if (open.length) {
      lines.push(e('አሁን ያለዎት · You have now:'));
      for (const l of open) {
        const late = daysLate(l, today);
        lines.push(
          `📗 <b>${e(l.book?.title ?? '')}</b> <code>${e(l.copy?.copy_no ?? '')}</code>\n    ` +
            e(
              l.kind === 'READING'
                ? 'እዚሁ እያነበቡ · reading in the library'
                : late
                  ? `⚠️ ${late} ቀን አልፏል (${formatEthiopianDate(l.due_date!, 'am')}) · ${late} day(s) late`
                  : `እስከ ${formatEthiopianDate(l.due_date!, 'am')} ይመልሱ · back by ${formatEthiopianDate(l.due_date!, 'en')}`
            )
        );
      }
    } else lines.push(e('አሁን የተዋሱት መጽሐፍ የለም። · You have no library book now.'));
    const reqs = (requests ?? []) as unknown as { status: 'WAITING' | 'READY'; book: { title: string } | null }[];
    if (reqs.length) {
      lines.push('', e('ጥያቄዎችዎ · Your requests:'));
      for (const r of reqs) lines.push(`📥 ${e(r.book?.title ?? '')} — ${e(r.status === 'READY' ? '📦 ዝግጁ ነው፤ ይውሰዱ · ready to collect' : '⏳ በመጠባበቅ ላይ · waiting')}`);
    }
    lines.push('');
  }
  lines.push(e('መጽሐፍ ለመፈለግ ከርዕሱ ወይም ከደራሲው ስም ይጻፉ (ለምሳሌ «ትምህርተ ሃይማኖት»)። · To find a book, type words from its title or author.'));
  await save(db, chatId, 'LIB_MENU', {});
  return sendTelegram(chatId, lines.join('\n'), keyboard([[CANCEL]]));
}

type Found = { id: string; title: string; author: string | null; category: string; shelf: string | null };

async function availability(db: SupabaseClient, bookIds: string[]) {
  const [{ data: copies }, { data: loans }] = await Promise.all([
    db.from('library_copies').select('book_id, status').in('book_id', bookIds),
    db.from('library_loans').select('book_id, due_date').in('book_id', bookIds).eq('status', 'OUT').eq('kind', 'HOME'),
  ]);
  const out = new Map<string, { free: number; total: number; back: string | null }>();
  for (const id of bookIds) out.set(id, { free: 0, total: 0, back: null });
  for (const c of (copies ?? []) as { book_id: string; status: string }[]) {
    const a = out.get(c.book_id)!;
    if (c.status !== 'WITHDRAWN' && c.status !== 'LOST') a.total++;
    if (c.status === 'AVAILABLE') a.free++;
  }
  for (const l of (loans ?? []) as { book_id: string; due_date: string | null }[]) {
    const a = out.get(l.book_id)!;
    if (l.due_date && (!a.back || l.due_date < a.back)) a.back = l.due_date;
  }
  return out;
}

const availText = (a: { free: number; total: number; back: string | null } | undefined) =>
  !a || a.total === 0
    ? '— ቅጂ የለም · no copy'
    : a.free
      ? `✅ ${a.free} መደርደሪያ ላይ · on the shelf`
      : `⏳ ሁሉም ወጥተዋል${a.back ? ` — ${formatEthiopianDate(a.back, 'am')} ይመለሳል` : ''} · all out${a.back ? `, back by ${formatEthiopianDate(a.back, 'en')}` : ''}`;

async function searchBooks(db: SupabaseClient, chatId: number, words: string) {
  const q = words.replace(/[,()*%\\]/g, ' ').trim();
  if (q.length < 2) return sendTelegram(chatId, e('ቢያንስ 2 ፊደል ይጻፉ። · Type at least 2 letters.'), keyboard([[CANCEL]]));
  const like = `%${q}%`;
  const { data } = await db.from('library_books')
    .select('id, title, author, category, shelf')
    .eq('is_active', true)
    .or(`title.ilike.${like},author.ilike.${like},subtitle.ilike.${like}`)
    .order('title')
    .limit(MAX_LIST);
  const books = (data ?? []) as Found[];
  if (books.length === 0) {
    await save(db, chatId, 'LIB_LIST', { list: [] });
    return sendTelegram(chatId, e(`«${q}» የሚል መጽሐፍ አልተገኘም። ሌላ ቃል ይሞክሩ። · No book matches “${q}”. Try other words.`), keyboard([[CANCEL]]));
  }
  const avail = await availability(db, books.map((b) => b.id));
  const list = books.map((b, i) => ({ id: b.id, button: `📗 ${i + 1}. ${b.title}`.slice(0, 60) }));
  await save(db, chatId, 'LIB_LIST', { list });
  const lines = [`🔍 <b>${e(q)}</b>`, ''];
  books.forEach((b, i) => lines.push(`${i + 1}. <b>${e(b.title)}</b>${b.author ? ` — ${e(b.author)}` : ''}\n    ${e(availText(avail.get(b.id)))}`));
  lines.push('', e('ዝርዝሩን ለማየትና ለመጠየቅ መጽሐፉን ይጫኑ። · Tap a book to see it and ask for it.'));
  return sendTelegram(chatId, lines.join('\n'), keyboard([...list.map((l) => [l.button]), [CANCEL]]));
}

async function showBook(db: SupabaseClient, chatId: number, scope: ChatScope, bookId: string, data: LibraryChatData) {
  const { data: row } = await db.from('library_books').select('id, title, author, category, shelf, description').eq('id', bookId).eq('is_active', true).maybeSingle();
  const b = row as (Found & { description: string | null }) | null;
  if (!b) return sendTelegram(chatId, e('ይህ መጽሐፍ አልተገኘም። · This book was not found.'), keyboard([[CANCEL]]));
  const a = (await availability(db, [b.id])).get(b.id);
  const people = borrowersOf(scope);
  const { data: mine } = people.length
    ? await db.from('library_requests').select('id').in('person_id', people).eq('book_id', b.id).in('status', ['WAITING', 'READY']).limit(1)
    : { data: [] };
  const asked = ((mine ?? []) as unknown[]).length > 0;
  await save(db, chatId, 'LIB_BOOK', { ...data, book_id: b.id });
  const lines = [
    `📗 <b>${e(b.title)}</b>`,
    e([b.author, BOOK_CATEGORIES[b.category]?.[1], b.shelf && `መደርደሪያ · shelf ${b.shelf}`].filter(Boolean).join(' · ')),
    b.description ? `\n${e(b.description.slice(0, 600))}` : '',
    '',
    e(availText(a)),
    asked ? `\n${e('📥 ይህን መጽሐፍ ቀድመው ጠይቀዋል። · You have already asked for this book.')}` : '',
  ].filter((x) => x !== '');
  const rows: string[][] = [];
  if (!asked && people.length && a && a.total > 0) rows.push([WANT]);
  if (data.list?.length) rows.push([BACK]);
  rows.push([CANCEL]);
  return sendTelegram(chatId, lines.join('\n'), keyboard(rows));
}

async function requestBook(db: SupabaseClient, chatId: number, scope: ChatScope, bookId: string, menu: Record<string, unknown>, readOnly: boolean) {
  await clearSession(db, chatId);
  if (readOnly) return sendTelegram(chatId, e('አሁን ጥያቄ መቀበል አይቻልም። · Requests cannot be taken now.'), menu);
  const people = borrowersOf(scope);
  // A member's record first (a member who also studies is one person anyway)
  const person = scope.memberPersonIds.find((p) => people.includes(p)) ?? people[0];
  if (!person) return sendTelegram(chatId, e('ይህ ቻት ከመዝገብ ጋር አልተያያዘም። · This chat is not linked to a record.'), menu);
  const { data: book } = await db.from('library_books').select('title').eq('id', bookId).eq('is_active', true).maybeSingle();
  if (!book) return sendTelegram(chatId, e('ይህ መጽሐፍ አልተገኘም። · This book was not found.'), menu);
  const { error } = await db.from('library_requests').insert({ book_id: bookId, person_id: person, via: 'TELEGRAM' });
  if (error) {
    return sendTelegram(
      chatId,
      e(error.code === '23505' ? '📥 ይህን መጽሐፍ ቀድመው ጠይቀዋል። · You have already asked for this book.' : 'ይቅርታ፣ ጥያቄው አልተላከም። · Sorry, the request was not sent.'),
      menu
    );
  }
  const title = (book as { title: string }).title;
  const { data: p } = await db.from('persons').select('full_name_en, full_name_am').eq('id', person).maybeSingle();
  const name = (p as { full_name_en: string; full_name_am: string | null } | null)?.full_name_am || (p as { full_name_en: string } | null)?.full_name_en || '';
  notifyLater(
    { permissions: ['LIBRARY_MANAGE'] },
    { title: '📥 የመጽሐፍ ጥያቄ · Book request', body: `${name} — ${title}`, url: '/dashboard/library/loans', tag: 'library-request' }
  );
  return sendTelegram(
    chatId,
    `📥 <b>${e(title)}</b>\n${e('ጥያቄዎ ለቤተ መጻሕፍቱ ደርሷል። ሲዘጋጅ እዚህ ይነገርዎታል። · Your request reached the library. You will be told here when it is ready.')}`,
    menu
  );
}

export async function continueLibrary(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: LibraryChatData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>,
  readOnly: boolean
) {
  const { step, data } = session;
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተዘግቷል። · Closed.'), menu);
  }
  if (step === 'LIB_BOOK' && text === WANT && data.book_id) return requestBook(db, chatId, scope, data.book_id, menu, readOnly);
  if (text === BACK && data.list?.length) {
    await save(db, chatId, 'LIB_LIST', { list: data.list });
    return sendTelegram(chatId, e('መጽሐፉን ይምረጡ። · Choose a book.'), keyboard([...data.list.map((l) => [l.button]), [CANCEL]]));
  }
  const picked = data.list?.find((l) => l.button === text);
  if (picked) return showBook(db, chatId, scope, picked.id, data);
  if (text === FIND) return sendTelegram(chatId, e('ከርዕሱ ወይም ከደራሲው ስም ይጻፉ። · Type words from the title or author.'), keyboard([[CANCEL]]));
  return searchBooks(db, chatId, text);
}
