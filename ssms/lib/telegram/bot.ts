// ─────────────────────────────────────────────────────────────────────────────
// Telegram bot — server only. Sends messages to people who linked their
// Telegram chat (migration 024). Needs TELEGRAM_BOT_TOKEN; without it nothing
// is sent and everything else keeps working.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/** Telegram allows about 30 messages a second; stay well below. */
const SEND_GAP_MS = 50;

export function telegramConfigured(): boolean {
  return Boolean(env.telegramBotToken());
}

/** The site's address for links in messages. */
export function siteUrl(): string {
  return (env.siteUrl() ?? 'https://hamere-hiwot.onrender.com').replace(/\/+$/, '');
}

/** Sent by Telegram with every webhook call; made from the token, so there is nothing else to set up. */
export function webhookSecret(): string {
  return createHash('sha256').update(`${env.telegramBotToken() ?? ''}:ssms-webhook`).digest('hex').slice(0, 48);
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type ApiResult<T> = { ok: true; result: T } | { ok: false; error_code?: number; description?: string };

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const token = env.telegramBotToken();
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : 'Could not reach Telegram' };
  }
}

let usernameCache: string | null = null;
/** The bot's @username, for t.me links. */
export async function botUsername(): Promise<string | null> {
  if (usernameCache) return usernameCache;
  const res = await telegramApi<{ username: string }>('getMe');
  usernameCache = res.ok ? res.result.username : null;
  return usernameCache;
}

/** One message to one chat. 'blocked' = the person stopped or blocked the bot. */
export async function sendTelegram(chatId: number, html: string): Promise<'ok' | 'blocked' | 'failed'> {
  const res = await telegramApi('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  if (res.ok) return 'ok';
  if (res.error_code === 403) return 'blocked';
  console.error('telegram send failed', res.error_code, res.description);
  return 'failed';
}

/** The same message to every linked chat of these people (each chat once). Forgets chats that blocked the bot. */
export async function telegramToPersons(db: SupabaseClient, personIds: string[], html: string): Promise<{ recipients: number; delivered: number }> {
  if (!telegramConfigured() || personIds.length === 0) return { recipients: 0, delivered: 0 };
  const chats = new Set<number>();
  for (let i = 0; i < personIds.length; i += 200) {
    const { data } = await db.from('telegram_links').select('chat_id').in('person_id', [...new Set(personIds)].slice(i, i + 200));
    for (const r of (data ?? []) as { chat_id: number }[]) chats.add(Number(r.chat_id));
  }
  let delivered = 0;
  const blocked: number[] = [];
  for (const chat of chats) {
    const result = await sendTelegram(chat, html);
    if (result === 'ok') delivered += 1;
    if (result === 'blocked') blocked.push(chat);
    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }
  if (blocked.length) await db.from('telegram_links').delete().in('chat_id', blocked);
  return { recipients: chats.size, delivered };
}

/** People behind system user ids (for staff notifications). */
export async function personsOfUsers(db: SupabaseClient, systemUserIds: string[]): Promise<string[]> {
  if (systemUserIds.length === 0) return [];
  const { data } = await db.from('system_users').select('person_id').in('id', systemUserIds);
  return ((data ?? []) as { person_id: string }[]).map((r) => r.person_id);
}

/** A student's own person plus their guardians — who hears about the student's absences and results. */
export async function studentAndGuardians(db: SupabaseClient, studentIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (studentIds.length === 0) return out;
  const [{ data: students }, { data: guardians }] = await Promise.all([
    db.from('students').select('id, person_id').in('id', studentIds),
    db.from('student_guardians').select('student_id, guardian_person_id').in('student_id', studentIds),
  ]);
  for (const s of (students ?? []) as { id: string; person_id: string }[]) out.set(s.id, [s.person_id]);
  for (const g of (guardians ?? []) as { student_id: string; guardian_person_id: string }[]) {
    out.set(g.student_id, [...(out.get(g.student_id) ?? []), g.guardian_person_id]);
  }
  return out;
}

/** Send after the response, so saving never waits on (or fails because of) Telegram. */
export function telegramLater(work: (db: SupabaseClient) => Promise<unknown>): void {
  if (!telegramConfigured()) return;
  after(async () => {
    try {
      await work(createAdminClient());
    } catch (e) {
      console.error('telegram failed', e);
    }
  });
}

/** A one-time code for t.me/<bot>?start=<code> (Telegram allows A–Z a–z 0–9 _ -). */
export function newLinkCode(): string {
  return randomBytes(18).toString('base64url');
}
