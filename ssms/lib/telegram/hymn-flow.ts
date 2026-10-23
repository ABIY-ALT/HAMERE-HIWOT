// ─────────────────────────────────────────────────────────────────────────────
// "🎶 Hymns" in the Telegram bot — server only. The hymn library (Sacred Arts →
// Hymn Library) for everyone linked: pick a type (ቅዳሴ, መዝሙር…), type words to
// search titles and lyrics, or — for choir members — see the hymns of the next
// rehearsal or service. Tapping a hymn sends its lyrics. Steps, kept in
// telegram_sessions:
//   HYMN_MENU   types, next rehearsal; or any words → search
//   HYMN_LIST   a list of hymns (one button each); words → a new search
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, sendTelegram } from '@/lib/telegram/bot';
import { CANCEL, clearSession } from '@/lib/telegram/dues-flow';
import type { ChatScope } from '@/lib/telegram/menu';
import { HYMN_CATEGORIES, type HymnCategory } from '@/lib/choir/types';
import { formatEthiopianDate, todayIso } from '@/lib/utils/ethiopian-calendar';

const e = escapeHtml;
const BACK = '⬅️ ወደ ማውጫው · Back to the list';
const NEXT = '🎼 የሚቀጥለው ጥናት · Next rehearsal';
const MAX_LIST = 30;
const MAX_TEXT = 3800;

export interface HymnData {
  list?: { id: string; button: string }[];
}

type Hymn = { id: string; title_am: string; title_en: string | null; category: HymnCategory; feast: string | null; lyrics: string | null };

const keyboard = (rows: string[][]) => ({ reply_markup: { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true } });
const typeButton = (c: HymnCategory, n: number) => `${HYMN_CATEGORIES[c][1]} · ${HYMN_CATEGORIES[c][0].split(' (')[0]} (${n})`;
const hymnButton = (h: Pick<Hymn, 'title_am'>, i: number) => `🎵 ${i + 1}. ${h.title_am}`.slice(0, 60);
const pairs = (items: string[]) => items.reduce<string[][]>((rows, x, i) => (i % 2 ? rows[rows.length - 1].push(x) : rows.push([x]), rows), []);

async function save(db: SupabaseClient, chatId: number, step: 'HYMN_MENU' | 'HYMN_LIST', data: HymnData) {
  const { error } = await db.from('telegram_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (error) throw new Error(error.message);
}

/** The next planned choir session (with hymns) of a choir member in this chat. */
async function nextSession(db: SupabaseClient, scope: ChatScope): Promise<{ title: string; date: string; ids: string[] } | null> {
  if (!scope.inChoir) return null;
  const { data } = await db.from('choir_sessions')
    .select('id, title, kind, session_date, hymns:choir_session_hymns(hymn_id, position)')
    .eq('status', 'PLANNED')
    .gte('session_date', todayIso())
    .order('session_date')
    .limit(5);
  const s = ((data ?? []) as { id: string; title: string | null; session_date: string; hymns: { hymn_id: string; position: number }[] }[]).find((x) => x.hymns?.length);
  if (!s) return null;
  return { title: s.title ?? '', date: s.session_date, ids: [...s.hymns].sort((a, b) => a.position - b.position).map((h) => h.hymn_id) };
}

async function categoryCounts(db: SupabaseClient): Promise<Map<HymnCategory, number>> {
  const { data } = await db.from('hymns').select('category').eq('is_active', true);
  const out = new Map<HymnCategory, number>();
  for (const r of (data ?? []) as { category: HymnCategory }[]) out.set(r.category, (out.get(r.category) ?? 0) + 1);
  return out;
}

async function menuRows(db: SupabaseClient, scope: ChatScope): Promise<{ rows: string[][]; total: number }> {
  const counts = await categoryCounts(db);
  const types = (Object.keys(HYMN_CATEGORIES) as HymnCategory[]).filter((c) => counts.get(c)).map((c) => typeButton(c, counts.get(c)!));
  const rows = pairs(types);
  if (await nextSession(db, scope)) rows.unshift([NEXT]);
  rows.push([CANCEL]);
  return { rows, total: [...counts.values()].reduce((a, b) => a + b, 0) };
}

/** "🎶 Hymns": the types, and how to search. */
export async function startHymns(db: SupabaseClient, chatId: number, scope: ChatScope, menu: Record<string, unknown>, enabled: boolean) {
  if (!enabled) return sendTelegram(chatId, e('የመዝሙራት ማውጫው አሁን አይገኝም። · The hymn library is not available now.'), menu);
  const { rows, total } = await menuRows(db, scope);
  if (total === 0) return sendTelegram(chatId, e('የመዝሙራት ማውጫው ገና ባዶ ነው። · The hymn library is still empty.'), menu);
  await save(db, chatId, 'HYMN_MENU', {});
  return sendTelegram(
    chatId,
    `🎶 <b>${e('የመዝሙራት ማውጫ · Hymn library')}</b> (${total})\n\n` +
      e('ዓይነቱን ይምረጡ፣ ወይም ከርዕሱ ወይም ከግጥሙ ቃል ይጻፉ (ለምሳሌ «ማርያም»)። · Choose a type, or type words from the title or lyrics (e.g. “Maryam”).'),
    keyboard(rows)
  );
}

async function sendList(db: SupabaseClient, chatId: number, heading: string, hymns: Hymn[]) {
  if (hymns.length === 0) {
    await save(db, chatId, 'HYMN_LIST', { list: [] });
    return sendTelegram(chatId, e('ምንም አልተገኘም። ሌላ ቃል ይሞክሩ። · Nothing found. Try other words.'), keyboard([[BACK], [CANCEL]]));
  }
  const shown = hymns.slice(0, MAX_LIST);
  const list = shown.map((h, i) => ({ id: h.id, button: hymnButton(h, i) }));
  await save(db, chatId, 'HYMN_LIST', { list });
  const more = hymns.length > MAX_LIST ? `\n${e(`(${hymns.length} ውስጥ የመጀመሪያዎቹ ${MAX_LIST} · first ${MAX_LIST} of ${hymns.length})`)}` : '';
  return sendTelegram(chatId, `${heading}${more}\n\n${e('መዝሙሩን ይጫኑ — ግጥሙ ይመጣል። · Tap a hymn to get its lyrics.')}`, keyboard([...list.map((l) => [l.button]), [BACK, CANCEL]]));
}

async function sendLyrics(db: SupabaseClient, chatId: number, id: string, data: HymnData) {
  const { data: row } = await db.from('hymns').select('id, title_am, title_en, category, feast, lyrics').eq('id', id).eq('is_active', true).maybeSingle();
  const h = row as Hymn | null;
  const rows = [...(data.list ?? []).map((l) => [l.button]), [BACK, CANCEL]];
  if (!h) return sendTelegram(chatId, e('ይህ መዝሙር አልተገኘም። · This hymn was not found.'), keyboard(rows));
  const head =
    `🎵 <b>${e(h.title_am)}</b>${h.title_en ? `\n<i>${e(h.title_en)}</i>` : ''}\n` +
    e(`${HYMN_CATEGORIES[h.category][1]}${h.feast ? ` · ${h.feast}` : ''}`);
  const lyrics = (h.lyrics ?? '').trim();
  if (!lyrics) return sendTelegram(chatId, `${head}\n\n${e('ግጥሙ ገና አልገባም። · The lyrics are not in yet.')}`, keyboard(rows));
  // Long lyrics go in several messages
  const parts: string[] = [];
  let rest = lyrics;
  while (rest.length > MAX_TEXT) {
    const cut = rest.lastIndexOf('\n', MAX_TEXT) > MAX_TEXT / 2 ? rest.lastIndexOf('\n', MAX_TEXT) : MAX_TEXT;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  parts.push(rest);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await sendTelegram(chatId, `${i === 0 ? `${head}\n\n` : ''}${e(parts[i])}`, last ? keyboard(rows) : undefined);
  }
}

/** Words to search: titles (Amharic, English), feast and lyrics */
async function search(db: SupabaseClient, words: string): Promise<Hymn[]> {
  const q = words.replace(/[,()*%\\]/g, ' ').trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const { data } = await db.from('hymns')
    .select('id, title_am, title_en, category, feast, lyrics')
    .eq('is_active', true)
    .or(`title_am.ilike.${like},title_en.ilike.${like},feast.ilike.${like},lyrics.ilike.${like}`)
    .order('title_am')
    .limit(MAX_LIST + 10);
  return (data ?? []) as Hymn[];
}

export async function continueHymns(
  db: SupabaseClient,
  chatId: number,
  session: { step: string; data: HymnData },
  text: string,
  scope: ChatScope,
  menu: Record<string, unknown>
) {
  if (text === CANCEL || /^\/cancel/i.test(text)) {
    await clearSession(db, chatId);
    return sendTelegram(chatId, e('ተዘግቷል። · Closed.'), menu);
  }
  if (text === BACK) return startHymns(db, chatId, scope, menu, true);

  const picked = session.data.list?.find((l) => l.button === text);
  if (picked) return sendLyrics(db, chatId, picked.id, session.data);

  if (text === NEXT) {
    const next = await nextSession(db, scope);
    if (!next) return sendTelegram(chatId, e('የሚቀጥል ጥናት የለም። · No coming rehearsal has hymns yet.'), keyboard([[BACK], [CANCEL]]));
    const { data } = await db.from('hymns').select('id, title_am, title_en, category, feast, lyrics').in('id', next.ids);
    const byId = new Map(((data ?? []) as Hymn[]).map((h) => [h.id, h]));
    const hymns = next.ids.map((id) => byId.get(id)).filter((h): h is Hymn => Boolean(h));
    return sendList(db, chatId, `🎼 <b>${e(next.title || 'የሚቀጥለው ጥናት · Next rehearsal')}</b> — ${e(formatEthiopianDate(next.date, 'am'))}`, hymns);
  }

  const type = (Object.keys(HYMN_CATEGORIES) as HymnCategory[]).find((c) => text.startsWith(`${HYMN_CATEGORIES[c][1]} · `));
  if (type) {
    const { data } = await db.from('hymns').select('id, title_am, title_en, category, feast, lyrics').eq('is_active', true).eq('category', type).order('title_am').limit(200);
    return sendList(db, chatId, `🎶 <b>${e(HYMN_CATEGORIES[type][1])}</b>`, (data ?? []) as Hymn[]);
  }

  return sendList(db, chatId, `🔍 <b>${e(text.slice(0, 60))}</b>`, await search(db, text));
}
