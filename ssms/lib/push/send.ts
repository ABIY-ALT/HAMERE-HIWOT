// ─────────────────────────────────────────────────────────────────────────────
// Push notifications — server only. Sends to every device a user has
// registered. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// (run `npm run setup-push`); without them nothing is sent.
// Each person's notification settings (lib/notifications/prefs, migration 047)
// decide which kinds reach their devices and their Telegram; the inbox always
// keeps a copy.
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { tenantClient } from '@/lib/tenant/db';
import { currentTenantId, runInTenant } from '@/lib/tenant/scope';
import { env } from '@/lib/env';
import { chatsOf, escapeHtml, personsOfUsers, siteUrl, telegramConfigured, telegramToChats, telegramToPersons } from '@/lib/telegram/bot';
import { kindOf, wants, type NoticeChannel, type NoticeKind, type NotificationPrefs } from '@/lib/notifications/prefs';

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
  /** Which kind of notice it is for people's settings (default: by the page it opens) */
  kind?: NoticeKind;
}

export function pushConfigured(): boolean {
  return Boolean(env.vapidPublicKey() && env.vapidPrivateKey());
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    env.vapidSubject() || 'https://hamere-hiwot.onrender.com',
    env.vapidPublicKey()!,
    env.vapidPrivateKey()!
  );
  configured = true;
}

/** Active system users holding any of the permissions. */
export async function usersWithPermission(db: SupabaseClient, ...codes: PermissionCode[]): Promise<string[]> {
  const { data: perms } = await db.from('permissions').select('id').in('code', codes).eq('is_active', true);
  if (!perms?.length) return [];
  const { data: grants } = await db.from('role_permissions').select('role_id').in('permission_id', perms.map((p) => p.id));
  if (!grants?.length) return [];
  const { data: rows } = await db
    .from('user_unit_assignments')
    .select('system_user_id, expires_at')
    .eq('is_active', true)
    .in('role_id', [...new Set(grants.map((g) => g.role_id))]);
  const now = Date.now();
  return [
    ...new Set(
      ((rows ?? []) as { system_user_id: string; expires_at: string | null }[])
        .filter((r) => !r.expires_at || Date.parse(r.expires_at) > now)
        .map((r) => r.system_user_id)
    ),
  ];
}

/** Active system users assigned to any of the units who also hold the permission. */
export async function usersInUnits(db: SupabaseClient, unitIds: string[], holding: PermissionCode): Promise<string[]> {
  if (unitIds.length === 0) return [];
  const allowed = new Set(await usersWithPermission(db, holding));
  const { data: rows } = await db
    .from('user_unit_assignments')
    .select('system_user_id, expires_at')
    .eq('is_active', true)
    .in('organization_unit_id', unitIds);
  const now = Date.now();
  return [
    ...new Set(
      ((rows ?? []) as { system_user_id: string; expires_at: string | null }[])
        .filter((r) => (!r.expires_at || Date.parse(r.expires_at) > now) && allowed.has(r.system_user_id))
        .map((r) => r.system_user_id)
    ),
  ];
}

/** Only accounts that are switched on (a disabled account keeps its role assignments). */
async function activeOnly(db: SupabaseClient, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data } = await db.from('system_users').select('id').in('id', [...new Set(userIds)]).eq('is_active', true);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/**
 * Keeps the notice in each user's inbox (the bell; migration 045), so it can be
 * found again later and is there even without push or Telegram. Before the
 * migration there is no inbox: nothing is kept.
 */
export async function saveToInbox(db: SupabaseClient, userIds: string[], message: PushMessage): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const { error } = await db.from('notifications').insert(
    ids.map((system_user_id) => ({
      system_user_id,
      title: message.title.slice(0, 300),
      body: message.body.slice(0, 1000),
      url: message.url.startsWith('/') ? message.url : '/dashboard',
      tag: message.tag ?? null,
    }))
  );
  if (error && !/notifications/.test(error.message)) console.error('inbox not saved', error.message);
}

/** The users' notification settings (none before migration 047: everything on). */
async function prefsOf(db: SupabaseClient, userIds: string[]): Promise<Map<string, NotificationPrefs>> {
  const out = new Map<string, NotificationPrefs>();
  if (userIds.length === 0) return out;
  const { data, error } = await db.from('system_users').select('id, notification_prefs').in('id', [...new Set(userIds)]);
  if (error) return out;
  for (const u of (data ?? []) as { id: string; notification_prefs: NotificationPrefs | null }[]) out.set(u.id, u.notification_prefs ?? {});
  return out;
}

/** The users who want this kind of notice on this channel. */
async function wanting(db: SupabaseClient, userIds: string[], message: PushMessage, channel: NoticeChannel): Promise<string[]> {
  const prefs = await prefsOf(db, userIds);
  const kind = kindOf(message);
  return userIds.filter((id) => wants(prefs.get(id), kind, channel));
}

/** Sends to all devices of the given users who want it (and keeps it in every one's inbox); forgets devices the push service has dropped. */
export async function pushToUsers(db: SupabaseClient, userIds: string[], message: PushMessage, inbox = true): Promise<void> {
  if (inbox) await saveToInbox(db, userIds, message);
  if (!pushConfigured() || userIds.length === 0) return;
  const devices = await wanting(db, [...new Set(userIds)], message, 'push');
  if (devices.length === 0) return;
  configure();
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('system_user_id', devices);
  const payload = JSON.stringify(message);
  const gone: string[] = [];
  await Promise.all(
    ((subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error('push failed', status ?? e);
      }
    })
  );
  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
}

/**
 * Notify after the response has been sent, so saving never waits on (or fails
 * because of) the push services. `to` lists user ids, permission codes and/or
 * units (their members holding a permission). The same message also goes to
 * the Telegram chats those people linked (migration 024).
 */
export function notifyLater(
  to: {
    users?: (string | null | undefined)[];
    permissions?: PermissionCode[];
    units?: { ids: string[]; holding: PermissionCode };
    except?: string;
  },
  message: PushMessage
): void {
  // Only the people of the Sunday school this is happening in
  const tenant = currentTenantId();
  after(async () => {
    try {
      const tenantId = await tenant;
      if (!tenantId) return;
      await runInTenant(tenantId, async () => {
        const bot = await telegramConfigured();
        const db = tenantClient(tenantId);
        const ids = new Set((to.users ?? []).filter((id): id is string => Boolean(id)));
        if (to.permissions?.length) for (const id of await usersWithPermission(db, ...to.permissions)) ids.add(id);
        if (to.units) for (const id of await usersInUnits(db, to.units.ids, to.units.holding)) ids.add(id);
        if (to.except) ids.delete(to.except);
        const recipients = await activeOnly(db, [...ids]);
        // Kept in the inbox even when there is no push and no bot
        await pushToUsers(db, recipients, message);
        if (!bot) return;
        const text = `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}\n${siteUrl()}${message.url}`;
        await telegramToPersons(db, await personsOfUsers(db, await wanting(db, recipients, message, 'telegram')), text);
      });
    } catch (e) {
      console.error('notify failed', e);
    }
  });
}

/**
 * Notify people (persons, not accounts) after the response: their linked
 * Telegram chats, and the devices of their login if they have one. For the
 * people an action is about — a donor, an appointee, a servant — most of whom
 * only use the bot. `guardians: true` also tells a student's parents.
 * `link: false` leaves the website link out of the Telegram message (for
 * people without a login).
 */
export function notifyPersonsLater(
  personIds: (string | null | undefined)[],
  message: PushMessage,
  options: { guardians?: boolean; link?: boolean } = {}
): void {
  const ids = [...new Set(personIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const tenant = currentTenantId();
  after(async () => {
    try {
      const tenantId = await tenant;
      if (!tenantId) return;
      await runInTenant(tenantId, async () => {
        const bot = await telegramConfigured();
        const db = tenantClient(tenantId);
        // Their login (if any): devices and inbox
        const { data } = await db.from('system_users').select('id, person_id').in('person_id', ids).eq('is_active', true);
        const logins = (data ?? []) as { id: string; person_id: string }[];
        await pushToUsers(db, logins.map((u) => u.id), message);
        if (bot) {
          // People whose login turned Telegram off for this kind of notice are left out
          const keep = new Set(await wanting(db, logins.map((u) => u.id), message, 'telegram'));
          const muted = new Set(logins.filter((u) => !keep.has(u.id)).map((u) => u.person_id));
          const chats = await chatsOf(db, ids.filter((id) => !muted.has(id)), 'SELF');
          if (options.guardians) {
            const { data: students } = await db.from('students').select('id').in('person_id', ids).eq('status', 'ACTIVE');
            const studentIds = ((students ?? []) as { id: string }[]).map((s) => s.id);
            if (studentIds.length) {
              const { data: guardians } = await db.from('student_guardians').select('guardian_person_id').in('student_id', studentIds);
              const parentIds = ((guardians ?? []) as { guardian_person_id: string }[]).map((g) => g.guardian_person_id);
              if (parentIds.length) for (const c of await chatsOf(db, parentIds)) chats.add(c);
            }
          }
          const link = options.link === false ? '' : `\n${siteUrl()}${message.url}`;
          await telegramToChats(db, chats, `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}${link}`);
        }
      });
    } catch (e) {
      console.error('notify failed', e);
    }
  });
}
