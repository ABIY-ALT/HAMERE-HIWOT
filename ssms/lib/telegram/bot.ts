// ─────────────────────────────────────────────────────────────────────────────
// Telegram bot — server only. Sends messages to people who linked their
// Telegram chat (migration 024). Each Sunday school has its own bot: its
// token is saved under Administration → Telegram bot (tenant_secrets, 040);
// the default Sunday school may instead use TELEGRAM_BOT_TOKEN. Without a
// token nothing is sent and everything else keeps working.
// The bot used is the one of the tenant in scope (lib/tenant/scope.ts): the
// signed-in user's, or the one the webhook / daily job is working for.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { DEFAULT_TENANT_ID, tenantClient } from '@/lib/tenant/db';
import { currentTenantId, runInTenant } from '@/lib/tenant/scope';
import { getTenantSecret } from '@/lib/tenant/secrets';
import { loadTenant, publicPath } from '@/lib/tenant/context';

/** Telegram allows about 30 messages a second; stay well below. */
const SEND_GAP_MS = 50;

/** The bot token of a tenant (the default tenant falls back to TELEGRAM_BOT_TOKEN). */
export async function botTokenOf(tenantId: string): Promise<string | null> {
  const saved = await getTenantSecret(tenantId, 'telegram_bot_token').catch(() => null);
  if (saved) return saved;
  return tenantId === DEFAULT_TENANT_ID ? (env.telegramBotToken() ?? null) : null;
}

async function currentToken(): Promise<string | null> {
  const tenantId = await currentTenantId();
  return tenantId ? botTokenOf(tenantId) : null;
}

export async function telegramConfigured(): Promise<boolean> {
  return Boolean(await currentToken());
}

/** The site's address for links in messages. */
export function siteUrl(): string {
  return (env.siteUrl() ?? 'https://hamere-hiwot.onrender.com').replace(/\/+$/, '');
}

/** Address of a public page of the tenant in scope (the default one at /, others under /s/<slug>). */
export async function publicUrl(path = '/'): Promise<string> {
  const tenantId = await currentTenantId();
  const tenant = tenantId ? await loadTenant(tenantId) : null;
  return siteUrl() + (tenant ? publicPath(tenant, path) : path);
}

/** Sent by Telegram with every webhook call; made from the token, so there is nothing else to set up. */
export function webhookSecretFor(token: string): string {
  return createHash('sha256').update(`${token}:ssms-webhook`).digest('hex').slice(0, 48);
}

export async function webhookSecret(): Promise<string> {
  return webhookSecretFor((await currentToken()) ?? '');
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type ApiResult<T> = { ok: true; result: T } | { ok: false; error_code?: number; description?: string };

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const token = await currentToken();
  if (!token) return { ok: false, description: 'The Telegram bot is not set up' };
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

/** A file someone sent the bot (e.g. a receipt photo), fetched here so the token never reaches the browser. */
export async function telegramFile(fileId: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const token = await currentToken();
  if (!token) return null;
  const info = await telegramApi<{ file_path?: string }>('getFile', { file_id: fileId });
  if (!info.ok || !info.result.file_path) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const ext = info.result.file_path.split('.').pop()?.toLowerCase() ?? '';
    const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[ext] ?? res.headers.get('content-type') ?? 'application/octet-stream';
    return { bytes: await res.arrayBuffer(), type };
  } catch {
    return null;
  }
}

const usernameCache = new Map<string, string>();
/** The bot's @username, for t.me links. */
export async function botUsername(): Promise<string | null> {
  const token = await currentToken();
  if (!token) return null;
  const known = usernameCache.get(token);
  if (known) return known;
  const res = await telegramApi<{ username: string }>('getMe');
  if (!res.ok) return null;
  usernameCache.set(token, res.result.username);
  return res.result.username;
}

/** One message to one chat (`extra`: e.g. a reply_markup keyboard). 'blocked' = the person stopped or blocked the bot. */
export async function sendTelegram(chatId: number, html: string, extra: Record<string, unknown> = {}): Promise<'ok' | 'blocked' | 'failed'> {
  const res = await telegramApi('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  if (res.ok) return 'ok';
  if (res.error_code === 403) return 'blocked';
  console.error('telegram send failed', res.error_code, res.description);
  return 'failed';
}

/** A picture made here (e.g. a QR code) to one chat, with an HTML caption. */
export async function sendTelegramPhoto(chatId: number, png: Uint8Array, captionHtml: string, extra: Record<string, unknown> = {}): Promise<'ok' | 'blocked' | 'failed'> {
  const token = await currentToken();
  if (!token) return 'failed';
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'qr.png');
  form.append('caption', captionHtml.slice(0, 1000));
  form.append('parse_mode', 'HTML');
  for (const [key, value] of Object.entries(extra)) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  try {
    const res = (await (await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form, cache: 'no-store' })).json()) as ApiResult<unknown>;
    if (res.ok) return 'ok';
    if (res.error_code === 403) return 'blocked';
    console.error('telegram photo failed', res.error_code, res.description);
    return 'failed';
  } catch (e) {
    console.error('telegram photo failed', e);
    return 'failed';
  }
}

/**
 * The chats linked to these people. `relation` narrows it: SELF = the person's
 * own chats, GUARDIAN = parents who linked to a student by their phone (027).
 */
export async function chatsOf(db: SupabaseClient, personIds: string[], relation?: 'SELF' | 'GUARDIAN'): Promise<Set<number>> {
  const chats = new Set<number>();
  const ids = [...new Set(personIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const res = relation
      ? await db.from('telegram_links').select('chat_id').in('person_id', part).eq('relation', relation)
      : await db.from('telegram_links').select('chat_id').in('person_id', part);
    // Before migration 027 there is no relation: every link is the person's own
    const data = res.error && relation === 'SELF' ? (await db.from('telegram_links').select('chat_id').in('person_id', part)).data : res.data;
    for (const r of (data ?? []) as { chat_id: number }[]) chats.add(Number(r.chat_id));
  }
  return chats;
}

/** The same message to every linked chat of these people (each chat once). Forgets chats that blocked the bot. */
export async function telegramToPersons(
  db: SupabaseClient,
  personIds: string[],
  html: string,
  relation?: 'SELF' | 'GUARDIAN'
): Promise<{ recipients: number; delivered: number }> {
  if (!(await telegramConfigured()) || personIds.length === 0) return { recipients: 0, delivered: 0 };
  return telegramToChats(db, await chatsOf(db, personIds, relation), html);
}

/** The same message to each of these chats. */
export async function telegramToChats(db: SupabaseClient, chats: Set<number>, html: string): Promise<{ recipients: number; delivered: number }> {
  if (!(await telegramConfigured()) || chats.size === 0) return { recipients: 0, delivered: 0 };
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

/**
 * Send after the response, so saving never waits on (or fails because of) Telegram.
 * The work runs for the tenant in scope now, with a client held to that tenant.
 */
export function telegramLater(work: (db: SupabaseClient) => Promise<unknown>): void {
  const tenant = currentTenantId();
  after(async () => {
    try {
      const tenantId = await tenant;
      if (!tenantId) return;
      await runInTenant(tenantId, async () => {
        if (!(await telegramConfigured())) return;
        await work(tenantClient(tenantId));
      });
    } catch (e) {
      console.error('telegram failed', e);
    }
  });
}

/** A one-time code for t.me/<bot>?start=<code> (Telegram allows A–Z a–z 0–9 _ -). */
export function newLinkCode(): string {
  return randomBytes(18).toString('base64url');
}
