// ─────────────────────────────────────────────────────────────────────────────
// "✅ I'm here" in the Telegram bot — server only (migration 036). The person
// checks in at the program / choir rehearsal that is on now, with the code on
// the leader's screen and (optionally) the phone's location. Rules:
// lib/checkin/core. Steps, kept in telegram_sessions:
//   CHECK_WHO    (a chat linked to several people) who is here
//   CHECK_EVENT  (several events on now) which one
//   CHECK_CODE   the 4-digit code on the screen
//   CHECK_LOC    share location, or skip (only when the leader set the place)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { checkIn, codeOk, noteWrong, openEventsNow, tooManyTries, type CheckinResult, type EventRow } from '@/lib/checkin/core';

const e = escapeHtml;
const SKIP = '⏭ ያለ ቦታ ቀጥል · Skip';
const SHARE = '📍 ቦታዬን አጋራ · Share my location';

export interface CheckinData {
  people?: { id: string; name: string }[];
  person_id?: string;
  events?: { id: string; title: string }[];
  event_id?: string;
  code_ok_at?: number;
}
export interface CheckinMessage {
  text: string;
  location?: { lat: number; lng: number } | null;
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, step: string, data: CheckinData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/** The chat's own people: members, and students linked as themselves (not children). */
async function selfPeople(db: SupabaseClient, scope: ChatScope) {
  const ids = new Set(scope.memberPersonIds);
  if (scope.selfStudentIds.length) {
    const { data } = await db.from('students').select('person_id').in('id', scope.selfStudentIds);
    for (const s of (data ?? []) as { person_id: string }[]) ids.add(s.person_id);
  }
  if (!ids.size) return [];
  const { data } = await db.from('persons').select('id, full_name_en, full_name_am').in('id', [...ids]);
  return ((data ?? []) as { id: string; full_name_en: string; full_name_am: string | null }[]).map((p) => ({ id: p.id, name: p.full_name_am || p.full_name_en }));
}

async function askCode(db: SupabaseClient, chatId: number, data: CheckinData, title: string) {
  await save(db, chatId, 'CHECK_CODE', data);
  return sendTelegram(
    chatId,
    `✅ <b>${e(title)}</b>\n` + e('በመሪው ስክሪን ላይ ያለውን ባለ 4 አሃዝ ኮድ ይጻፉ (በየ30 ሰከንዱ ይቀየራል)።\nType the 4-digit code on the leader’s screen (it changes every 30 seconds).'),
    keyboard([[CANCEL]])
  );
}

/** "✅ I'm here" — start checking in. */
export async function startCheckin(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>) {
  const people = await selfPeople(db, scope);
  if (!people.length) {
    return sendTelegram(chatId, e('ይህ ቻት እንደ ወላጅ ብቻ ነው የተያያዘው፤ ተማሪው በራሱ ስልክ ይመዘገባል ወይም መሪው ይመዘግበዋል። · This chat is linked only as a parent — the student checks in on their own phone, or the leader marks them.'), menu);
  }
  const events = await openEventsNow(db);
  if (!events.length) return sendTelegram(chatId, e('አሁን መገኘት የሚመዘገብበት መርሐ ግብር የለም። · No event is open for check-in right now.'), menu);
  const base: CheckinData = { events: events.map((x) => ({ id: x.id, title: x.title })) };
  if (people.length > 1) {
    await save(db, chatId, 'CHECK_WHO', { ...base, people });
    return sendTelegram(chatId, e('ማን ተገኝቷል? · Who is here?'), keyboard([...people.map((p) => [p.name]), [CANCEL]]));
  }
  return chooseEvent(db, chatId, { ...base, person_id: people[0].id });
}

async function chooseEvent(db: SupabaseClient, chatId: number, data: CheckinData) {
  const events = data.events ?? [];
  if (events.length > 1) {
    await save(db, chatId, 'CHECK_EVENT', data);
    return sendTelegram(chatId, e('የትኛው መርሐ ግብር ላይ? · Which event?'), keyboard([...events.map((x) => [x.title]), [CANCEL]]));
  }
  return askCode(db, chatId, { ...data, event_id: events[0].id }, events[0].title);
}

function answer(res: CheckinResult, title: string): string {
  if (!res.ok) {
    return e(
      {
        NOT_OPEN: 'የዚህ መርሐ ግብር መመዝገቢያ ተዘግቷል። · Check-in for this event is closed.',
        WRONG_CODE: 'ኮዱ ትክክል አይደለም። · That code is not right.',
        TOO_MANY: 'ብዙ የተሳሳቱ ኮዶች — መሪውን እንዲመዘግብዎ ይጠይቁ። · Too many wrong codes — ask the leader to mark you.',
        REMOVED: 'መሪው ከዚህ መርሐ ግብር አስወጥቶዎታል — እሳቸውን ያነጋግሩ። · The leader removed your check-in — please ask them.',
      }[res.error]
    );
  }
  if (res.status === 'PRESENT') return `✅ <b>${e(title)}</b>\n` + e(res.already ? 'ቀድሞ ተመዝግበዋል። · You were already checked in.' : 'ተገኝተዋል ተብሎ ተመዝግቧል። እንኳን ደህና መጡ! · You are checked in. Welcome!');
  return (
    `⚠️ <b>${e(title)}</b>\n` +
    e(
      res.flag === 'FAR'
        ? `ተመዝግቧል፤ ግን ከቦታው ${res.distance} ሜትር ይርቃሉ — መሪው ያረጋግጣሉ። · Recorded, but you seem ${res.distance} m away — the leader will confirm it.`
        : 'ተመዝግቧል፤ ቦታ ስላላጋሩ መሪው ያረጋግጣሉ። · Recorded — as no location was shared, the leader will confirm it.'
    )
  );
}

export async function continueCheckin(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: CheckinData },
  message: CheckinMessage,
  menu: Record<string, unknown>
) {
  const { step, data } = session;
  const text = message.text.trim();
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }
  if (step === 'CHECK_WHO') {
    const who = data.people?.find((p) => p.name === text);
    if (!who) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
    return chooseEvent(db, chatId, { events: data.events, person_id: who.id });
  }
  if (step === 'CHECK_EVENT') {
    const ev = data.events?.find((x) => x.title === text);
    if (!ev) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
    return askCode(db, chatId, { ...data, event_id: ev.id }, ev.title);
  }

  const { data: row } = await db.from('checkin_events').select('*').eq('id', data.event_id!).maybeSingle();
  const event = row as EventRow | null;
  if (!event) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ይህ መርሐ ግብር አልተገኘም። · This event was not found.'), menu);
  }

  if (step === 'CHECK_CODE') {
    const key = `${event.id}:${data.person_id}`;
    if (tooManyTries(key)) {
      await clearSession(db, chatId);
      return sendTelegram(chatId, answer({ ok: false, error: 'TOO_MANY' }, event.title), menu);
    }
    if (!codeOk(event.secret, text)) {
      noteWrong(key);
      return sendTelegram(chatId, e('ኮዱ ትክክል አይደለም — አሁን በስክሪኑ ላይ ያለውን ይጻፉ። · That code is not right — type the one on the screen now.'));
    }
    if (event.lat === null || event.lng === null) {
      // No place set: the code is enough
      await clearSession(db, chatId);
      const res = await checkIn(db, event, { personId: data.person_id!, codeVerified: true, chatId });
      return sendTelegram(chatId, answer(res, event.title), menu);
    }
    await save(db, chatId, 'CHECK_LOC', { ...data, code_ok_at: Date.now() });
    return sendTelegram(
      chatId,
      e('✅ ኮዱ ትክክል ነው። አሁን ቦታዎን ያጋሩ — ቦታ ካላጋሩ መሪው ያረጋግጣሉ።\nThe code is right. Now share your location — without it, the leader confirms your check-in.'),
      { reply_markup: { keyboard: [[{ text: SHARE, request_location: true }], [{ text: SKIP }], [{ text: CANCEL }]], resize_keyboard: true, one_time_keyboard: true } }
    );
  }

  // CHECK_LOC: the code was right a moment ago
  if (!message.location && text !== SKIP) return sendTelegram(chatId, e('«ቦታዬን አጋራ» ወይም «ያለ ቦታ ቀጥል» ይጫኑ። · Tap “Share my location” or “Skip”.'));
  await clearSession(db, chatId);
  const fresh = Date.now() - (data.code_ok_at ?? 0) < 3 * 60_000;
  if (!fresh) return sendTelegram(chatId, e('ጊዜው አልፏል — እንደገና «✅ ተገኝቻለሁ» ይጫኑ። · That took too long — tap “✅ I’m here” again.'), menu);
  const res = await checkIn(db, event, { personId: data.person_id!, codeVerified: true, location: message.location ?? null, chatId });
  return sendTelegram(chatId, answer(res, event.title), menu);
}
