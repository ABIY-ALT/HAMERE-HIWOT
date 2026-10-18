// ─────────────────────────────────────────────────────────────────────────────
// Phone links — server only. A chat that shared its own number is linked by
// that number (kept in telegram_chats, migration 030):
//   • as themselves to the people whose own phone it is (members, students)
//   • as a parent to the current students whose guardian phone it is
// syncChat makes the links match the records again: it adds new ones (a
// second child registered with the same parent phone) and removes the ones
// that no longer match (a corrected guardian phone, a student who left).
// Only links that came from the phone are ever removed — "Connect Telegram"
// on the website is never undone. It runs when the number is shared, when the
// chat writes to the bot (every few hours at most, or at once on /start and
// Help), and right after the office changes a phone on a record.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';
import { sendTelegram } from '@/lib/telegram/bot';
import { chatScope, connectedText, menuFor } from '@/lib/telegram/menu';

/** How old the last check may be before a message from the chat checks again */
const REFRESH_MS = 6 * 60 * 60 * 1000;

type P = { id: string; full_name_en: string; full_name_am: string | null; phone_primary?: string | null; emergency_contact_phone?: string | null; status?: string };
const nameOf = (p: P) => p.full_name_am || p.full_name_en;

/** Whose number this is (own phone, active records) and which current students it is the guardian phone of. */
async function matchPhone(db: SupabaseClient, phone: string): Promise<{ self: P[]; children: P[] }> {
  // Stored numbers vary (09…, +2519…, "0911 22 33 44"): find candidates by the last 9 digits in order, then compare exactly
  const tail = `%${phone.slice(1).split('').join('%')}`;
  const [{ data: own }, { data: guardianOf }] = await Promise.all([
    db.from('persons').select('id, full_name_en, full_name_am, phone_primary, status').ilike('phone_primary', tail),
    db.from('persons').select('id, full_name_en, full_name_am, emergency_contact_phone').ilike('emergency_contact_phone', tail),
  ]);
  const self = ((own ?? []) as P[]).filter((p) => p.status === 'ACTIVE' && normalizePhone(p.phone_primary ?? '') === phone);
  const childPeople = ((guardianOf ?? []) as P[]).filter((p) => normalizePhone(p.emergency_contact_phone ?? '') === phone);
  // Only children who are current students
  const { data: activeStudents } = childPeople.length
    ? await db.from('students').select('person_id').eq('status', 'ACTIVE').in('person_id', childPeople.map((c) => c.id))
    : { data: [] };
  const activeChild = new Set(((activeStudents ?? []) as { person_id: string }[]).map((s) => s.person_id));
  const selfIds = new Set(self.map((p) => p.id));
  return { self, children: childPeople.filter((c) => activeChild.has(c.id) && !selfIds.has(c.id)) };
}

export interface SyncResult {
  /** Names linked as themselves, and as children */
  self: string[];
  children: string[];
  added: number;
  removed: number;
}

type Link = { id: string; person_id: string; relation?: string | null; via_phone?: boolean; telegram_name?: string | null };

/** Link the chat by this (its own, verified) number so the links match the records, and keep the number. */
export async function syncChat(db: SupabaseClient, chatId: number, sharedPhone: string, telegramName?: string | null): Promise<SyncResult> {
  const phone = normalizePhone(sharedPhone);
  if (!isValidPhone(phone)) return { self: [], children: [], added: 0, removed: 0 };
  const { self, children } = await matchPhone(db, phone);
  const want = [
    ...self.map((p) => ({ person_id: p.id, relation: 'SELF' })),
    ...children.map((c) => ({ person_id: c.id, relation: 'GUARDIAN' })),
  ];

  // `via_phone` exists from migration 030; before it nothing is ever removed
  let res = await db.from('telegram_links').select('id, person_id, relation, via_phone, telegram_name').eq('chat_id', chatId);
  const tracked = !res.error;
  if (res.error) res = (await db.from('telegram_links').select('id, person_id, relation, telegram_name').eq('chat_id', chatId)) as typeof res;
  const have = (res.data ?? []) as Link[];
  const key = (x: { person_id: string; relation?: string | null }) => `${x.person_id}:${x.relation ?? 'SELF'}`;
  const name = telegramName || have.find((h) => h.telegram_name)?.telegram_name || null;

  const haveKeys = new Set(have.map(key));
  const toAdd = want.filter((w) => !haveKeys.has(key(w)));
  if (toAdd.length) {
    const rows = toAdd.map((w) => ({ ...w, chat_id: chatId, telegram_name: name }));
    let { error } = await db.from('telegram_links').upsert(rows.map((r) => ({ ...r, via_phone: true })), { onConflict: 'person_id,chat_id' });
    if (error && /via_phone/.test(error.message)) ({ error } = await db.from('telegram_links').upsert(rows, { onConflict: 'person_id,chat_id' }));
    if (error) throw new Error(error.message);
  }

  const wantKeys = new Set(want.map(key));
  const stale = tracked ? have.filter((h) => h.via_phone && !wantKeys.has(key(h))) : [];
  if (stale.length) await db.from('telegram_links').delete().in('id', stale.map((s) => s.id));

  // Keep the number (also when it matched nobody yet: the chat connects once the office adds it)
  await db.from('telegram_chats').upsert({ chat_id: chatId, phone, telegram_name: name, synced_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  return { self: self.map(nameOf), children: children.map(nameOf), added: toAdd.length, removed: stale.length };
}

/** The number a chat shared, if any (migration 030). */
export async function savedChat(db: SupabaseClient, chatId: number) {
  const { data } = await db.from('telegram_chats').select('phone, telegram_name, synced_at').eq('chat_id', chatId).maybeSingle();
  return data as { phone: string; telegram_name: string | null; synced_at: string } | null;
}

/** Check the chat's links again by its saved number — when the last check is old, or at once with `force`. */
export async function refreshChat(db: SupabaseClient, chatId: number, force = false): Promise<SyncResult | null> {
  const saved = await savedChat(db, chatId);
  if (!saved) return null;
  if (!force && Date.now() - Date.parse(saved.synced_at) < REFRESH_MS) return null;
  return syncChat(db, chatId, saved.phone, saved.telegram_name);
}

/** "🔄 Updated" + who the chat is now linked to, with the new buttons. */
export async function tellUpdated(db: SupabaseClient, chatId: number) {
  const scope = await chatScope(db, chatId);
  if (!scope.linked) return;
  await sendTelegram(chatId, `🔄 <b>ተዘምኗል · Updated</b>\n${await connectedText(db, scope)}`, menuFor(scope));
}

/**
 * After the office changes phones on records (a student registered or edited,
 * a member registered or edited): re-link the chats that shared any of these
 * numbers, and tell them when something new is linked. Never throws.
 */
export async function syncChatsForPhones(db: SupabaseClient, phones: (string | null | undefined)[]): Promise<void> {
  try {
    const list = [...new Set(phones.filter((p): p is string => Boolean(p)).map(normalizePhone).filter(isValidPhone))];
    if (list.length === 0) return;
    const { data } = await db.from('telegram_chats').select('chat_id, phone, telegram_name').in('phone', list);
    for (const c of (data ?? []) as { chat_id: number; phone: string; telegram_name: string | null }[]) {
      const result = await syncChat(db, Number(c.chat_id), c.phone, c.telegram_name);
      if (result.added) await tellUpdated(db, Number(c.chat_id));
    }
  } catch (e) {
    console.error('telegram: re-linking chats failed', e);
  }
}
