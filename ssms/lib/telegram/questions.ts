// ─────────────────────────────────────────────────────────────────────────────
// "✉️ Ask a department" in the Telegram bot — server only (migration 033).
// A connected chat picks a department and writes its question; the
// department's heads answer it on the website (Members' questions) and the
// answer comes back here. Steps, kept in telegram_sessions:
//   ASK_UNIT  which department (buttons)
//   ASK_TEXT  the question
// At most a few open questions a day per chat, so the inbox is not flooded.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyLater } from '@/lib/push/send';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';

const e = escapeHtml;
export const MAX_PER_DAY = 5;
const MAX_LENGTH = 1500;

type Unit = { id: string; name: string };
export interface AskData {
  units?: Unit[];
  unit_id?: string;
  unit_name?: string;
}

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, one_time_keyboard: true } });

async function save(db: SupabaseClient, chatId: number, step: 'ASK_UNIT' | 'ASK_TEXT', data: AskData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/** "✉️ Ask a department": choose the department. */
export async function startAsk(db: SupabaseClient, chatId: number, scope: ChatScope) {
  if (!scope.linked) return;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: recent, error } = await db.from('member_questions').select('id').eq('chat_id', chatId).gte('created_at', since);
  if (error) throw new Error(error.message);
  if ((recent ?? []).length >= MAX_PER_DAY) {
    return sendTelegram(chatId, e(`ዛሬ ${MAX_PER_DAY} ጥያቄዎች ልከዋል፤ ነገ እንደገና ይሞክሩ። · You sent ${MAX_PER_DAY} questions today — please try again tomorrow.`));
  }
  const { data: units } = await db.from('organization_units')
    .select('id, name_en, name_am')
    .eq('is_active', true)
    .in('unit_type', ['DEPARTMENT', 'COORDINATION'])
    .order('sort_order');
  const list = ((units ?? []) as { id: string; name_en: string; name_am: string | null }[]).map((u) => ({ id: u.id, name: u.name_am || u.name_en }));
  if (list.length === 0) return sendTelegram(chatId, e('ገና ክፍላት አልተመዘገቡም። · No departments are set up yet.'));
  await save(db, chatId, 'ASK_UNIT', { units: list });
  const rows: string[][] = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2).map((u) => u.name));
  rows.push([CANCEL]);
  return sendTelegram(chatId, e('ጥያቄዎ ለየትኛው ክፍል ነው? · Which department is your question for?'), keyboard(rows));
}

/** The next step: the department chosen, then the question itself. */
export async function continueAsk(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: AskData },
  text: string,
  who: { personId: string | null; name: string },
  menu: Record<string, unknown>
) {
  const { step, data } = session;
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተሰርዟል። · Cancelled.'), menu);
  }
  if (step === 'ASK_UNIT') {
    const unit = data.units?.find((u) => u.name === text);
    if (!unit) return sendTelegram(chatId, e('ከአዝራሮቹ ክፍል ይምረጡ። · Choose a department from the buttons.'));
    await save(db, chatId, 'ASK_TEXT', { unit_id: unit.id, unit_name: unit.name });
    return sendTelegram(chatId, e(`✍️ ለ«${unit.name}» ጥያቄዎን ይጻፉ። · Write your question for ${unit.name}.`), keyboard([[CANCEL]]));
  }
  // ASK_TEXT
  const question = text.trim();
  if (question.length < 5) return sendTelegram(chatId, e('ጥያቄዎን በጽሑፍ ይጻፉ። · Please type your question.'));
  const { error } = await db.from('member_questions').insert({
    unit_id: data.unit_id,
    chat_id: chatId,
    person_id: who.personId,
    asker_name: who.name || null,
    question: question.slice(0, MAX_LENGTH),
  });
  await clearSession(db, chatId);
  if (error) throw new Error(error.message);
  notifyLater(
    { units: { ids: [data.unit_id!], holding: 'TASK_REPORT' } },
    { title: 'አዲስ ጥያቄ ከአባል · A member’s question', body: `${who.name}: ${question.slice(0, 120)}`, url: '/dashboard/questions', tag: 'member-questions' }
  );
  return sendTelegram(
    chatId,
    e(`📨 ለ«${data.unit_name}» ተልኳል። መልሱ እዚህ ይደርስዎታል።\nSent to ${data.unit_name}. The answer will come here.`),
    menu
  );
}

/** Who is asking, for the department: the chat's member, else "parent of …", else its Telegram name. */
export async function askerOf(db: SupabaseClient, scope: ChatScope, telegramName: string): Promise<{ personId: string | null; name: string }> {
  const personId = scope.memberPersonIds[0] ?? null;
  if (personId) {
    const { data } = await db.from('persons').select('full_name_en, full_name_am, membership_code').eq('id', personId).maybeSingle();
    const p = data as { full_name_en: string; full_name_am: string | null; membership_code: string } | null;
    if (p) return { personId, name: `${p.full_name_am || p.full_name_en} (${p.membership_code})` };
  }
  if (scope.childStudentIds.length) {
    const { data } = await db.from('students').select('person:persons!students_person_id_fkey(full_name_en, full_name_am)').in('id', scope.childStudentIds);
    const kids = ((data ?? []) as { person: unknown }[])
      .map((s) => (Array.isArray(s.person) ? s.person[0] : s.person) as { full_name_en: string; full_name_am: string | null } | null)
      .map((p) => p?.full_name_am || p?.full_name_en)
      .filter(Boolean);
    if (kids.length) return { personId: null, name: `${telegramName || '—'} · ወላጅ / parent of ${kids.join(', ')}` };
  }
  return { personId: null, name: telegramName };
}
