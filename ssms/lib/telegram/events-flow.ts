// ─────────────────────────────────────────────────────────────────────────────
// "📅 Events" in the Telegram bot — server only. Shows the coming programs
// (lib/telegram/menu → eventsText), the chat's own tickets, and — for
// programs open for sign-up (migration 046), on the website or not — a
// button each to register. Steps, kept in telegram_sessions:
//   EVT_PICK   which program (one button each)
//   EVT_WHO    (a chat linked to several people) who is coming
//   EVT_SEATS  how many people, with them
// The ticket comes back as a message: its code is shown at the door.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import { eventsText, type ChatScope } from '@/lib/telegram/menu';
import { normalizePhone, isValidPhone } from '@/lib/auth/phone';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';
import { createRegistration, isMissingTable, ticketHtml, type TicketProgram } from '@/lib/events/registrations';
import { MAX_SEATS_SELF, failureText } from '@/lib/events/types';

const e = escapeHtml;
const MAX_LIST = 8;
const SEAT_BUTTONS = ['1', '2', '3', '4', '5'];

export interface EventsChatData {
  list?: { id: string; button: string }[];
  program_id?: string;
  people?: { id: string; name: string; phone: string }[];
  person?: { id: string; name: string; phone: string };
}

type Step = 'EVT_PICK' | 'EVT_WHO' | 'EVT_SEATS';
const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, step: Step, data: EventsChatData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

type OpenProgram = TicketProgram & { id: string; end_date: string | null };
const PROGRAM_COLUMNS = 'id, title_en, title_am, start_date, start_time, end_date, location';

/** Programs that take sign-ups today, soonest first ([] before migration 046). */
async function openPrograms(db: SupabaseClient): Promise<OpenProgram[]> {
  const today = todayIso();
  const { data, error } = await db.from('programs')
    .select(`${PROGRAM_COLUMNS}, registration_closes_on`)
    .eq('registration_open', true)
    .in('status', ['PLANNED', 'CONFIRMED'])
    .or(`start_date.gte.${today},end_date.gte.${today}`)
    .order('start_date')
    .limit(MAX_LIST * 2);
  if (error) return [];
  return ((data ?? []) as (OpenProgram & { registration_closes_on: string | null })[])
    .filter((p) => !p.registration_closes_on || p.registration_closes_on >= today)
    .slice(0, MAX_LIST);
}

/** The chat's own people, with a phone for the registration */
async function selfPeople(db: SupabaseClient, chatId: number, scope: ChatScope) {
  const [{ data: persons }, { data: chat }] = await Promise.all([
    scope.ownPersonIds.length ? db.from('persons').select('id, full_name_en, full_name_am, phone_primary').in('id', scope.ownPersonIds) : Promise.resolve({ data: [] }),
    db.from('telegram_chats').select('phone').eq('chat_id', chatId).maybeSingle(),
  ]);
  const chatPhone = (chat as { phone?: string } | null)?.phone ?? '';
  return ((persons ?? []) as { id: string; full_name_en: string; full_name_am: string | null; phone_primary: string | null }[]).map((p) => {
    const own = normalizePhone(p.phone_primary ?? '');
    return { id: p.id, name: p.full_name_am || p.full_name_en, phone: isValidPhone(own) ? own : chatPhone };
  });
}

/** The chat's tickets for coming programs */
async function myTickets(db: SupabaseClient, chatId: number, personIds: string[]): Promise<string[]> {
  const today = todayIso();
  const filter = personIds.length ? `chat_id.eq.${chatId},person_id.in.(${personIds.join(',')})` : `chat_id.eq.${chatId}`;
  const { data, error } = await db.from('event_registrations')
    .select('ticket_code, full_name, seats, program:programs!event_registrations_program_fkey(title_en, title_am, start_date, end_date, status)')
    .eq('status', 'REGISTERED')
    .or(filter)
    .limit(20);
  if (error) return [];
  return ((data ?? []) as unknown as { ticket_code: string; full_name: string; seats: number; program: { title_en: string; title_am: string | null; start_date: string; end_date: string | null; status: string } | null }[])
    .filter((r) => r.program && (r.program.end_date ?? r.program.start_date) >= today && r.program.status !== 'CANCELLED')
    .sort((a, b) => a.program!.start_date.localeCompare(b.program!.start_date))
    .map((r) => `🎟️ <code>${e(r.ticket_code)}</code> — ${e(`${r.program!.title_am || r.program!.title_en} (${formatEthiopianDate(r.program!.start_date, 'am')}) · ${r.full_name}${r.seats > 1 ? ` +${r.seats - 1}` : ''}`)}`);
}

/** "📅 Events": the coming programs, the chat's tickets, and the ones to register for. */
export async function startEvents(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>) {
  const [text, open, tickets] = await Promise.all([eventsText(db, scope), openPrograms(db), myTickets(db, chatId, scope.ownPersonIds)]);
  const parts = [text];
  if (tickets.length) parts.push('', `<b>${e('የእርስዎ ትኬቶች · Your tickets')}</b>`, ...tickets);
  if (open.length === 0) return sendTelegram(chatId, parts.join('\n'), menu);

  const list = open.map((p) => ({ id: p.id, button: `🎟️ ${p.title_am || p.title_en} · ${formatEthiopianDate(p.start_date, 'am')}`.slice(0, 120) }));
  parts.push('', e('ለመመዝገብ ከታች ያለውን መርሐ ግብር ይጫኑ። · To register, tap a program below.'));
  await save(db, chatId, 'EVT_PICK', { list });
  return sendTelegram(chatId, parts.join('\n'), keyboard([...list.map((l) => [l.button]), [CANCEL]]));
}

async function askSeats(db: SupabaseClient, chatId: number, data: EventsChatData) {
  await save(db, chatId, 'EVT_SEATS', data);
  return sendTelegram(
    chatId,
    e(`${data.person!.name} — ስንት ሰው ይመጣል (እርስዎን ጨምሮ)? ቁጥር ይጫኑ ወይም ይጻፉ (እስከ ${MAX_SEATS_SELF})።\nHow many people are coming, including you? Tap or type a number (up to ${MAX_SEATS_SELF}).`),
    keyboard([SEAT_BUTTONS, [CANCEL]])
  );
}

export async function continueEvents(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: EventsChatData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>
) {
  const data = session.data ?? {};
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }

  if (session.step === 'EVT_PICK') {
    const picked = data.list?.find((l) => l.button === text);
    if (!picked) return sendTelegram(chatId, e('ከታች ካሉት አንዱን ይጫኑ። · Tap one of the buttons below.'), keyboard([...(data.list ?? []).map((l) => [l.button]), [CANCEL]]));
    const people = await selfPeople(db, chatId, scope);
    if (people.length === 0) {
      await clearSession(db, chatId);
      return sendTelegram(chatId, e('ይህ ቻት እንደ ወላጅ ብቻ ነው የተያያዘው፤ በድረ-ገጹ ወይም በጽ/ቤቱ ይመዝገቡ። · This chat is linked only as a parent — please register on the website or at the office.'), menu);
    }
    if (people.length > 1) {
      await save(db, chatId, 'EVT_WHO', { program_id: picked.id, people });
      return sendTelegram(chatId, e('ማን ይመዘገባል? · Who is registering?'), keyboard([...people.map((p) => [p.name]), [CANCEL]]));
    }
    return askSeats(db, chatId, { program_id: picked.id, person: people[0] });
  }

  if (session.step === 'EVT_WHO') {
    const person = data.people?.find((p) => p.name === text);
    if (!person) return sendTelegram(chatId, e('ከታች ካሉት ስሞች አንዱን ይጫኑ። · Tap one of the names below.'), keyboard([...(data.people ?? []).map((p) => [p.name]), [CANCEL]]));
    return askSeats(db, chatId, { program_id: data.program_id, person });
  }

  // EVT_SEATS
  const seats = Number(text.trim());
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS_SELF) {
    return sendTelegram(chatId, e(`ከ1 እስከ ${MAX_SEATS_SELF} ቁጥር ይጻፉ። · Type a number from 1 to ${MAX_SEATS_SELF}.`), keyboard([SEAT_BUTTONS, [CANCEL]]));
  }
  await clearSession(db, chatId);
  const person = data.person!;
  const { data: program, error } = await db.from('programs').select(PROGRAM_COLUMNS).eq('id', data.program_id!).maybeSingle();
  if (error || !program) return sendTelegram(chatId, e(failureText(isMissingTable(error?.message ?? '') ? 'MIGRATION' : 'CLOSED').am), menu);
  const p = program as OpenProgram;

  const res = await createRegistration(db, { programId: p.id, name: person.name, phone: person.phone, seats, source: 'BOT', personId: person.id, chatId });
  if (res.ok) return sendTelegram(chatId, ticketHtml(p, { ticket: res.ticket, name: person.name, seats }), menu);

  if (res.reason === 'DUPLICATE') {
    // Already registered: show the ticket again
    const { data: existing } = await db.from('event_registrations')
      .select('ticket_code, full_name, seats')
      .eq('program_id', p.id)
      .eq('status', 'REGISTERED')
      .or(person.phone ? `person_id.eq.${person.id},phone.eq.${person.phone}` : `person_id.eq.${person.id}`)
      .limit(1)
      .maybeSingle();
    const r = existing as { ticket_code: string; full_name: string; seats: number } | null;
    if (r) return sendTelegram(chatId, ticketHtml(p, { ticket: r.ticket_code, name: r.full_name, seats: r.seats }, '🎟️ ቀድሞ ተመዝግበዋል · You are already registered'), menu);
  }
  const why = failureText(res.reason, res.left);
  return sendTelegram(chatId, e(`${why.am}\n${why.en}`), menu);
}
