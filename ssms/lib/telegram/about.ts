// ─────────────────────────────────────────────────────────────────────────────
// "ℹ️ About us" in the Telegram bot — server only. Topics about the Sunday
// school (history, class times, how to become a member, contact…) written by
// the office under Administration → Telegram bot, kept in system_settings
// ("bot_about"). Anyone who finds the bot can read them, connected or not.
// Each topic is a button ("📖 <title>"), so no conversation state is needed.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, siteUrl } from '@/lib/telegram/bot';
import { ABOUT_KEY, MAX_TOPICS, type AboutTopic } from '@/lib/telegram/about-topics';

export { ABOUT_KEY, MAX_TOPICS, SUGGESTED_TOPICS, type AboutTopic } from '@/lib/telegram/about-topics';

export const ABOUT_BUTTON = 'ℹ️ ስለ እኛ · About us';
export const BACK_BUTTON = '⬅️ ተመለስ · Back';

export async function loadAbout(db: SupabaseClient): Promise<AboutTopic[]> {
  const { data } = await db.from('system_settings').select('value').eq('key', ABOUT_KEY).maybeSingle();
  const topics = ((data as { value?: { topics?: AboutTopic[] } } | null)?.value?.topics ?? []) as AboutTopic[];
  // Only topics with something to read
  return topics.filter((t) => (t.title_am || t.title_en) && (t.body_am || t.body_en)).slice(0, MAX_TOPICS);
}

/** The button for a topic */
export const topicButton = (t: AboutTopic) => `📖 ${[t.title_am, t.title_en].filter(Boolean).join(' · ')}`.slice(0, 60);

/** Is this message one of the "About" buttons? (cheap check before loading the topics) */
export const isAboutMessage = (text: string) =>
  text === ABOUT_BUTTON || text === BACK_BUTTON || text.startsWith('📖 ') || /^\/about(@\w+)?$/i.test(text);

/** The list of topics, as buttons. */
export function aboutMenu(topics: AboutTopic[], [nameEn, nameAm]: [string, string]): { text: string; keyboard: Record<string, unknown> } {
  const rows = topics.map((t) => [{ text: topicButton(t) }]);
  rows.push([{ text: BACK_BUTTON }]);
  const text = topics.length
    ? `ℹ️ <b>${escapeHtml(`${nameAm} · ${nameEn}`)}</b>\n${escapeHtml('ስለምን ማወቅ ይፈልጋሉ? · What would you like to know?')}`
    : escapeHtml(`ጽ/ቤቱ ገና መረጃ አላስገባም። · The office has not added this information yet.\n${siteUrl()}`);
  return { text, keyboard: { reply_markup: { keyboard: rows, resize_keyboard: true } } };
}

/** One topic: both languages. */
export function topicText(t: AboutTopic): string {
  const parts = [`📖 <b>${escapeHtml([t.title_am, t.title_en].filter(Boolean).join(' · '))}</b>`];
  if (t.body_am) parts.push(escapeHtml(t.body_am));
  if (t.body_en) parts.push(escapeHtml(t.body_en));
  return parts.join('\n\n').slice(0, 4000);
}
