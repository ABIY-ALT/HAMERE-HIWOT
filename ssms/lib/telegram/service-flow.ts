// ─────────────────────────────────────────────────────────────────────────────
// "🎵 My service" in the Telegram bot — server only (migration 037). A choir
// member sees the published rosters (on it or not), their rehearsal
// attendance and the vestments they hold, and answers an assignment. Steps,
// kept in telegram_sessions:
//   SERVE_PICK  ✅ I'll serve / ❌ I can't (one pair per service on the roster)
//   SERVE_NOTE  why they can't come (the choir leaders are told at once)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { answerAssignment, myService, myServiceText } from '@/lib/choir/service-core';
import { formatEthiopianDate } from '@/lib/utils/ethiopian-calendar';

const e = escapeHtml;
const YES = '✅ እመጣለሁ · I’ll serve';
const NO = '❌ አልችልም · I can’t come';

export interface ServiceData {
  items?: { id: string; yes: string; no: string; title: string }[];
  assignment_id?: string;
  title?: string;
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, step: 'SERVE_PICK' | 'SERVE_NOTE', data: ServiceData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/** "🎵 My service": the member's rosters, rehearsals and vestments, with answer buttons. */
export async function startService(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>) {
  if (scope.memberPersonIds.length === 0) return sendTelegram(chatId, e('ይህ ቻት ከአባል ጋር አልተያያዘም። · This chat is not linked to a member.'), menu);
  let views;
  try {
    views = await Promise.all(scope.memberPersonIds.map((id) => myService(db, id)));
  } catch {
    return sendTelegram(chatId, e('የአገልግሎት ምደባ ገና አልተዘጋጀም። · The service roster is not set up yet.'), menu);
  }
  const shown = views.filter((v) => v.in_choir || v.holding.length);
  if (shown.length === 0) return sendTelegram(chatId, e('በመዘምራን ዝርዝር ውስጥ አልተገኙም። · You are not on the choir list.'), menu);
  const text = shown.map(myServiceText).join('\n\n— — —\n\n');

  const assigned = shown.flatMap((v) => v.upcoming.filter((u) => u.assignment_id));
  if (assigned.length === 0) return sendTelegram(chatId, text, menu);
  const single = assigned.length === 1;
  const items = assigned.map((u) => {
    const day = formatEthiopianDate(u.date, 'am');
    return { id: u.assignment_id!, title: u.title, yes: single ? YES : `✅ ${day} — እመጣለሁ`, no: single ? NO : `❌ ${day} — አልችልም` };
  });
  await save(db, chatId, 'SERVE_PICK', { items });
  return sendTelegram(
    chatId,
    `${text}\n\n${e('ይመጣሉ? ከታች ይምረጡ። · Will you serve? Choose below.')}`,
    keyboard([...items.map((i) => [i.yes, i.no]), [CANCEL]])
  );
}

export async function continueService(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: ServiceData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>
) {
  const { step, data } = session;
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }

  if (step === 'SERVE_PICK') {
    const yes = data.items?.find((i) => i.yes === text);
    const no = data.items?.find((i) => i.no === text);
    if (!yes && !no) return sendTelegram(chatId, e('ከአዝራሮቹ ይምረጡ። · Choose one of the buttons.'));
    if (no) {
      await save(db, chatId, 'SERVE_NOTE', { assignment_id: no.id, title: no.title });
      return sendTelegram(chatId, e('ለምን እንደማይችሉ በአጭሩ ይጻፉ (ለመዘምራን ክፍሉ ይደርሳል)። · Why can’t you come? Write a short reason (it goes to the choir leaders).'), keyboard([[CANCEL]]));
    }
    await clearSession(db, chatId);
    const res = await answerAssignment(db, yes!.id, scope.memberPersonIds, 'CONFIRMED', '');
    if (!res.ok) return sendTelegram(chatId, e(res.error), menu);
    return sendTelegram(chatId, e(`👍 ተመዝግቧል — እንገናኝ! · Thank you — see you there!\n${res.title} · ${formatEthiopianDate(res.date, 'am', { weekday: true })}`), menu);
  }

  // SERVE_NOTE
  const reason = text.trim();
  if (reason.length < 2) return sendTelegram(chatId, e('እባክዎ ምክንያቱን ይጻፉ። · Please write the reason.'));
  await clearSession(db, chatId);
  const res = await answerAssignment(db, data.assignment_id!, scope.memberPersonIds, 'DECLINED', reason);
  if (!res.ok) return sendTelegram(chatId, e(res.error), menu);
  return sendTelegram(chatId, e('ተመዝግቧል፤ የመዘምራን ክፍሉ ተነግሯቸዋል። · Noted — the choir leaders were told.'), menu);
}
