// ─────────────────────────────────────────────────────────────────────────────
// Temporary PINs and passwords — server only. There is no SMS or e-mail yet,
// so a forgotten PIN reaches people on Telegram (or on a printed slip).
// A PIN or password someone else made — the office (a slip, a reset) or the
// bot (🔑 Forgot my PIN, lib/telegram/pin-flow) — is temporary: it is marked
// on the login (app_metadata.temp_password, no migration needed) and the
// person must choose their own at the next sign-in (/set-password) before
// anything else works (lib/auth/authorize).
// Sent on Telegram it is protected from forwarding and deleted from the chat
// after 30 minutes. It is never stored. Every reset is in the audit trail.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { platformClient } from '@/lib/tenant/db';
import { currentTenantId, runInTenant } from '@/lib/tenant/scope';
import { chatsOf, escapeHtml, siteUrl, studentAndGuardians, telegramApi, telegramConfigured } from '@/lib/telegram/bot';
import { isStudentLogin, newPin } from '@/lib/auth/student-login';

/** Marked on the auth user (shared by every Sunday school the login belongs to) */
export const TEMP_FLAG = 'temp_password';

export const isTemporary = (user: { app_metadata?: Record<string, unknown> } | null | undefined) => user?.app_metadata?.[TEMP_FLAG] === true;

/** Accounts with these may not be reset by the bot alone: an administrator sends them a new password. */
export const PRIVILEGED: PermissionCode[] = ['USER_MANAGE', 'ROLE_MANAGE', 'SYSTEM_CONFIGURE', 'AUDIT_VIEW_ALL'];

/** How long the message with the PIN stays in the chat */
const DELETE_AFTER_MS = 30 * 60 * 1000;

/** Bot resets per login per day */
export const RESETS_PER_DAY = 3;

/** Students and parents sign in with a 6-digit PIN; staff with a password of at least 8 characters. */
export function pinOnly(username: string, permissions: string[]): boolean {
  return isStudentLogin(username) || (permissions.length > 0 && permissions.every((p) => p === 'STUDENT_PORTAL' || p === 'PARENT_PORTAL'));
}

/** A 6-digit PIN, or 8 digits for staff (they choose a real password at sign-in). */
export function newTemporary(pin: boolean): string {
  return pin ? newPin() : `${newPin().slice(0, 4)}${newPin().slice(0, 4)}`;
}

/** Sets the password and marks it temporary. */
export async function setTemporaryPassword(authUserId: string, password: string): Promise<void> {
  const { error } = await platformClient().auth.admin.updateUserById(authUserId, { password, app_metadata: { [TEMP_FLAG]: true } });
  if (error) throw new Error(error.message);
}

/** The person's own choice: no longer temporary. */
export async function setOwnPassword(authUserId: string, password: string): Promise<void> {
  const { error } = await platformClient().auth.admin.updateUserById(authUserId, { password, app_metadata: { [TEMP_FLAG]: false } });
  if (error) throw new Error(error.message);
}

/** Permission codes of a login in every Sunday school it belongs to, and whether it is a platform admin. */
export async function loginPowers(authUserId: string): Promise<{ codes: Set<string>; platformAdmin: boolean }> {
  const db = platformClient();
  const [{ data: accounts }, { data: admin }] = await Promise.all([
    db.from('system_users')
      .select('is_active, assignments:user_unit_assignments!user_unit_assignments_system_user_id_fkey(is_active, role:roles(role_permissions(permission:permissions(code))))')
      .eq('auth_user_id', authUserId),
    db.from('platform_admins').select('auth_user_id').eq('auth_user_id', authUserId).maybeSingle(),
  ]);
  type A = { is_active: boolean; assignments: { is_active: boolean; role: { role_permissions: { permission: { code: string } | null }[] } | null }[] | null };
  const codes = new Set<string>();
  for (const a of (accounts ?? []) as unknown as A[]) {
    for (const u of a.assignments ?? []) if (u.is_active) for (const rp of u.role?.role_permissions ?? []) if (rp.permission) codes.add(rp.permission.code);
  }
  return { codes, platformAdmin: Boolean(admin) };
}

export const isPrivileged = (powers: { codes: Set<string>; platformAdmin: boolean }) => powers.platformAdmin || PRIVILEGED.some((p) => powers.codes.has(p));

/**
 * Who gets a login's new PIN on Telegram: a student's own chats and their
 * parents' chats; anyone else only their own (linked as themselves).
 */
export async function chatsForLogin(db: SupabaseClient, account: { person_id: string; username: string }, studentId?: string | null): Promise<Set<number>> {
  if (isStudentLogin(account.username)) {
    let sid = studentId;
    if (!sid) {
      const { data } = await db.from('students').select('id').eq('person_id', account.person_id).maybeSingle();
      sid = (data as { id: string } | null)?.id;
    }
    const people = sid ? ((await studentAndGuardians(db, [sid])).get(sid) ?? [account.person_id]) : [account.person_id];
    return chatsOf(db, people);
  }
  return chatsOf(db, [account.person_id], 'SELF');
}

/**
 * The new PIN to each chat: protected from forwarding, deleted after 30
 * minutes (best effort — if the server restarts first it stays, but it is
 * useless once the person has chosen their own). Returns how many got it.
 */
export async function sendTemporary(
  chats: Set<number>,
  who: { name: string; login: string; secret: string; pin: boolean }
): Promise<number> {
  const label = who.pin ? 'ጊዜያዊ ሚስጥር ቁጥር · Temporary PIN' : 'ጊዜያዊ የይለፍ ቃል · Temporary password';
  const html =
    `🔑 <b>${label}</b>\n\n` +
    `👤 ${escapeHtml(who.name)}\n` +
    `${escapeHtml('መግቢያ · Login')}: <code>${escapeHtml(who.login)}</code>\n` +
    `${who.pin ? escapeHtml('ሚስጥር ቁጥር · PIN') : escapeHtml('የይለፍ ቃል · Password')}: <code>${escapeHtml(who.secret)}</code>\n\n` +
    escapeHtml(
      `${siteUrl()}/login\n\n` +
        'በዚህ ይግቡ፤ ወዲያው የራስዎን እንዲመርጡ ይጠየቃሉ። ይህ መልእክት ከ30 ደቂቃ በኋላ ይጠፋል። ለማንም አያጋሩት።\n' +
        'ይህን ያልጠየቁ ከሆነ ለጽ/ቤቱ ያሳውቁ።\n\n' +
        'Sign in with it — you will be asked to choose your own right away. This message disappears in 30 minutes. Do not share it.\n' +
        'If you did not ask for this, tell the office.'
    );
  const tenantId = await currentTenantId();
  let delivered = 0;
  for (const chat of chats) {
    const res = await telegramApi<{ message_id: number }>('sendMessage', {
      chat_id: chat,
      text: html,
      parse_mode: 'HTML',
      protect_content: true,
      link_preview_options: { is_disabled: true },
    });
    if (!res.ok) continue;
    delivered += 1;
    const messageId = res.result.message_id;
    const timer = setTimeout(() => {
      const remove = () => telegramApi('deleteMessage', { chat_id: chat, message_id: messageId }).catch(() => {});
      void (tenantId ? runInTenant(tenantId, remove) : remove());
    }, DELETE_AFTER_MS);
    timer.unref?.();
  }
  return delivered;
}

/** "Password reset" in the audit trail — never the password itself. */
export async function logReset(
  db: SupabaseClient,
  entry: { systemUserId: string; actorId: string | null; via: 'office' | 'office_telegram' | 'bot'; delivered?: number }
): Promise<void> {
  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
  } catch {
    // outside a request
  }
  try {
    await db.from('system_audit_logs').insert({
      user_id: entry.actorId,
      action: 'UPDATE',
      table_name: 'system_users',
      record_id: entry.systemUserId,
      new_values: { change: 'temporary_password', via: entry.via, ...(entry.delivered !== undefined ? { telegram_chats: entry.delivered } : {}) },
      user_agent: userAgent,
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}

const NOT_CONNECTED = 'Not connected to the Telegram bot — give them a new PIN on paper instead, or ask them to share their phone number with the bot first';

/** For "Send by Telegram" in the office: the chats, checked before anything is changed. */
export async function officeTargets(db: SupabaseClient, account: { person_id: string; username: string }, studentId?: string | null): Promise<Set<number>> {
  if (!(await telegramConfigured())) throw new Error('The Telegram bot is not set up (Administration → Telegram bot)');
  const chats = await chatsForLogin(db, account, studentId);
  if (chats.size === 0) throw new Error(NOT_CONNECTED);
  return chats;
}

export const NOT_DELIVERED = 'Telegram did not accept the message. The old PIN no longer works — make a new one on paper instead';
