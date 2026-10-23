// ─────────────────────────────────────────────────────────────────────────────
// Library messages to borrowers on Telegram (server only): a book given, taken
// back, given more time, a requested book ready, and reminders before and
// after the return day. A student's parents get them too.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { chatsOf, escapeHtml, studentAndGuardians, telegramLater, telegramToChats } from '@/lib/telegram/bot';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

const e = escapeHtml;
const day = (iso: string) => formatEthiopianDate(iso, 'am');

/** The person's own chats, and their parents' when the person is a student. */
export async function borrowerChats(db: SupabaseClient, personId: string): Promise<Set<number>> {
  const chats = await chatsOf(db, [personId], 'SELF');
  const { data: student } = await db.from('students').select('id').eq('person_id', personId).eq('status', 'ACTIVE').maybeSingle();
  if (student) {
    const people = (await studentAndGuardians(db, [(student as { id: string }).id])).get((student as { id: string }).id) ?? [];
    const guardians = people.filter((p) => p !== personId);
    if (guardians.length) for (const c of await chatsOf(db, guardians)) chats.add(c);
  }
  return chats;
}

export type LibraryMessage =
  | { kind: 'LENT'; title: string; copyNo: string; due: string | null }
  | { kind: 'RETURNED'; title: string; damaged: boolean }
  | { kind: 'RENEWED'; title: string; due: string }
  | { kind: 'READY'; title: string }
  | { kind: 'REQUEST_CANCELLED'; title: string; note: string }
  | { kind: 'DUE_TOMORROW'; title: string; due: string }
  | { kind: 'LATE'; title: string; due: string; days: number };

export function libraryText(m: LibraryMessage, name: string): string {
  const who = e(name);
  const book = `<b>${e(m.title)}</b>`;
  switch (m.kind) {
    case 'LENT':
      return m.due
        ? `📚 ${who} — ${book}\n${e(`ወደ ቤት ተወስዷል። እስከ ${day(m.due)} ይመልሱ። · Taken home — please bring it back by ${formatEthiopianDate(m.due, 'en')}.`)}\n<code>${e(m.copyNo)}</code>`
        : `📖 ${who} — ${book}\n${e('እዚሁ ቤተ መጻሕፍቱ ውስጥ እንዲነበብ ተሰጥቷል። · Given to read in the library.')}`;
    case 'RETURNED':
      return `✅ ${who} — ${book}\n${e(m.damaged ? 'ተመልሷል፤ መጽሐፉ ተበላሽቶ ተመዝግቧል። · Received back; the book was noted as damaged.' : 'ተመልሷል። እናመሰግናለን! · Received back. Thank you!')}`;
    case 'RENEWED':
      return `🔁 ${who} — ${book}\n${e(`ጊዜው ተራዝሟል፤ አዲሱ የመመለሻ ቀን ${day(m.due)} ነው። · More time given: bring it back by ${formatEthiopianDate(m.due, 'en')}.`)}`;
    case 'READY':
      return `📦 ${who} — ${book}\n${e('የጠየቁት መጽሐፍ ተዘጋጅቷል፤ ከቤተ መጻሕፍቱ ይውሰዱ። · The book you asked for is ready — collect it at the library.')}`;
    case 'REQUEST_CANCELLED':
      return `ℹ️ ${who} — ${book}\n${e(`ጥያቄዎ ተዘግቷል፦ ${m.note} · Your request was closed: ${m.note}`)}`;
    case 'DUE_TOMORROW':
      return `⏰ ${who} — ${book}\n${e(`ነገ (${day(m.due)}) የሚመለስበት ቀን ነው። · Tomorrow (${formatEthiopianDate(m.due, 'en')}) is the day to bring it back.`)}`;
    case 'LATE':
      return `⚠️ ${who} — ${book}\n${e(`የሚመለስበት ቀን (${day(m.due)}) ካለፈ ${m.days} ቀን ሆኗል። እባክዎ ይመልሱ፤ ተጨማሪ ጊዜ ካስፈለገ ቤተ መጻሕፍቱን ይጠይቁ። · It was due ${m.days} day(s) ago (${formatEthiopianDate(m.due, 'en')}). Please bring it back, or ask the library for more time.`)}`;
  }
}

/** Sends after the response, in the Sunday school of this request. */
export function tellBorrower(personId: string, name: string, m: LibraryMessage): void {
  telegramLater(async (db) => telegramToChats(db, await borrowerChats(db, personId), libraryText(m, name)));
}
