// ─────────────────────────────────────────────────────────────────────────────
// Event sign-up (migration 046) — server only. One way in for the public
// website, the Telegram bot and the office: createRegistration(). The
// database guard (event_registration_guard) decides whether registration is
// open and whether there are seats, with the program row locked, so this
// file only words its answer.
// ─────────────────────────────────────────────────────────────────────────────

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/auth/authorize';
import { normalizePhone } from '@/lib/auth/phone';
import { escapeHtml, telegramToChats } from '@/lib/telegram/bot';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';
import type { RegFailure, RegSource, RegistrationSettings } from './types';

/** No 0/O, 1/I, 5/S, 8/B: read aloud or typed at the door without mistakes */
const TICKET_LETTERS = 'ACDEFGHJKLMNPQRTUVWXY234679';
const TICKET_LENGTH = 6;

export function newTicketCode(): string {
  let code = '';
  for (let i = 0; i < TICKET_LENGTH; i++) code += TICKET_LETTERS[randomInt(TICKET_LETTERS.length)];
  return code;
}

export const isMissingTable = (m: string) => /event_registrations|registration_open/.test(m) && /does not exist|schema cache|Could not find/i.test(m);

/** The one active member whose own phone this is, or null (none, or several sharing it). */
export async function memberByPhone(db: SupabaseClient, phone: string): Promise<string | null> {
  const tail = `%${phone.slice(1).split('').join('%')}`;
  const { data } = await db.from('persons').select('id, phone_primary, status').ilike('phone_primary', tail).limit(10);
  const own = ((data ?? []) as { id: string; phone_primary: string | null; status: string }[]).filter(
    (p) => p.status === 'ACTIVE' && normalizePhone(p.phone_primary ?? '') === phone
  );
  return own.length === 1 ? own[0].id : null;
}

export interface NewRegistration {
  programId: string;
  name: string;
  /** Normalized (09… / 07…); may be empty only for OFFICE */
  phone: string;
  seats: number;
  note?: string;
  source: RegSource;
  personId?: string | null;
  chatId?: number | null;
  createdBy?: string | null;
}

export type RegistrationResult =
  | { ok: true; id: string; ticket: string; personId: string | null }
  | { ok: false; reason: RegFailure; left?: number; message?: string };

/** Saves a registration (a fresh ticket code is tried again if it is taken). */
export async function createRegistration(db: SupabaseClient, input: NewRegistration): Promise<RegistrationResult> {
  const personId = input.personId ?? (input.phone ? await memberByPhone(db, input.phone) : null);
  for (let attempt = 0; attempt < 4; attempt++) {
    const ticket = newTicketCode();
    const { data, error } = await db
      .from('event_registrations')
      .insert({
        program_id: input.programId,
        ticket_code: ticket,
        full_name: input.name,
        phone: input.phone || null,
        person_id: personId,
        chat_id: input.chatId ?? null,
        seats: input.seats,
        note: input.note || null,
        source: input.source,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single();
    if (!error) return { ok: true, id: (data as { id: string }).id, ticket, personId };
    const m = error.message;
    if (/event_registrations_tid_ticket_key/.test(m)) continue;
    if (/EVENT_CLOSED/.test(m)) return { ok: false, reason: 'CLOSED' };
    const full = /EVENT_FULL:(\d+)/.exec(m);
    if (full) return { ok: false, reason: 'FULL', left: Number(full[1]) };
    if (/uq_event_registrations_(phone|person)/.test(m)) return { ok: false, reason: 'DUPLICATE' };
    if (isMissingTable(m)) return { ok: false, reason: 'MIGRATION' };
    console.error('registration not saved:', m);
    return { ok: false, reason: 'FAILED', message: m };
  }
  return { ok: false, reason: 'FAILED' };
}

export interface TicketProgram {
  title_en: string;
  title_am: string | null;
  start_date: string;
  start_time: string | null;
  location: string | null;
}

/** The ticket as a Telegram message. */
export function ticketHtml(p: TicketProgram, r: { ticket: string; name: string; seats: number }, heading = '🎟️ ተመዝግበዋል · You are registered'): string {
  const e = escapeHtml;
  const title = p.title_am && p.title_am !== p.title_en ? `${p.title_am} · ${p.title_en}` : p.title_en;
  return [
    `<b>${e(heading)}</b>`,
    '',
    `<b>${e(title)}</b>`,
    e(`📅 ${formatEthiopianDate(p.start_date, 'am')}${p.start_time ? ` · ${p.start_time.slice(0, 5)}` : ''}`),
    ...(p.location ? [e(`📍 ${p.location}`)] : []),
    e(`👤 ${r.name}${r.seats > 1 ? ` (+${r.seats - 1})` : ''}`),
    '',
    `${e('የመግቢያ ኮድ · Ticket code:')} <code>${e(r.ticket)}</code>`,
    e('በመግቢያው ላይ ይህን ኮድ ያሳዩ። · Show this code at the entrance.'),
  ].join('\n');
}

/** Chats that should get a registrant's messages: the bot chat it came from, and any chat that shared the same phone. */
export async function registrantChats(db: SupabaseClient, regs: { chat_id: number | null; phone: string | null }[]): Promise<Map<number, number>> {
  // chat → index of the registration it belongs to (first one wins)
  const out = new Map<number, number>();
  regs.forEach((r, i) => {
    if (r.chat_id && !out.has(Number(r.chat_id))) out.set(Number(r.chat_id), i);
  });
  const phones = [...new Set(regs.map((r) => r.phone).filter((p): p is string => Boolean(p)))];
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await db.from('telegram_chats').select('chat_id, phone').in('phone', phones.slice(i, i + 200));
    for (const c of (data ?? []) as { chat_id: number; phone: string }[]) {
      const idx = regs.findIndex((r) => r.phone === c.phone);
      if (idx >= 0 && !out.has(Number(c.chat_id))) out.set(Number(c.chat_id), idx);
    }
  }
  return out;
}

/** Sends the ticket to the registrant's Telegram, when they have one. */
export async function sendTicket(db: SupabaseClient, program: TicketProgram, reg: { ticket: string; name: string; seats: number; phone: string | null; chat_id: number | null }) {
  const chats = await registrantChats(db, [reg]);
  if (chats.size) await telegramToChats(db, new Set(chats.keys()), ticketHtml(program, reg));
}

/** Programs' sign-up settings and the seats taken, by program id (empty before migration 046). */
export async function registrationNumbers(
  db: SupabaseClient,
  programIds: string[]
): Promise<Map<string, { settings: RegistrationSettings; people: number; seats: number; arrived: number }>> {
  const out = new Map<string, { settings: RegistrationSettings; people: number; seats: number; arrived: number }>();
  if (programIds.length === 0) return out;
  const { data, error } = await db.from('programs').select('id, registration_open, registration_capacity, registration_closes_on').in('id', programIds);
  if (error) {
    if (isMissingTable(error.message)) return out;
    throw new Error(error.message);
  }
  for (const p of (data ?? []) as { id: string; registration_open: boolean; registration_capacity: number | null; registration_closes_on: string | null }[]) {
    out.set(p.id, {
      settings: { open: Boolean(p.registration_open), capacity: p.registration_capacity ?? null, closes_on: p.registration_closes_on ?? null },
      people: 0,
      seats: 0,
      arrived: 0,
    });
  }
  const regs = await selectAll<{ program_id: string; seats: number; checked_in_at: string | null }>((a, b) =>
    db.from('event_registrations').select('program_id, seats, checked_in_at').in('program_id', programIds).eq('status', 'REGISTERED').order('id').range(a, b)
  );
  for (const r of regs) {
    const n = out.get(r.program_id);
    if (!n) continue;
    n.people += 1;
    n.seats += r.seats;
    if (r.checked_in_at) n.arrived += r.seats;
  }
  return out;
}
