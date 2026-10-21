// ─────────────────────────────────────────────────────────────────────────────
// Push notifications — server only. Sends to every device a user has
// registered. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// (run `npm run setup-push`); without them nothing is sent.
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { tenantClient } from '@/lib/tenant/db';
import { currentTenantId, runInTenant } from '@/lib/tenant/scope';
import { env } from '@/lib/env';
import { escapeHtml, personsOfUsers, siteUrl, telegramConfigured, telegramToPersons } from '@/lib/telegram/bot';

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
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

/** Sends to all devices of the given users; forgets devices the push service has dropped. */
export async function pushToUsers(db: SupabaseClient, userIds: string[], message: PushMessage): Promise<void> {
  if (!pushConfigured() || userIds.length === 0) return;
  configure();
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('system_user_id', [...new Set(userIds)]);
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
        if (!pushConfigured() && !bot) return;
        const db = tenantClient(tenantId);
        const ids = new Set((to.users ?? []).filter((id): id is string => Boolean(id)));
        if (to.permissions?.length) for (const id of await usersWithPermission(db, ...to.permissions)) ids.add(id);
        if (to.units) for (const id of await usersInUnits(db, to.units.ids, to.units.holding)) ids.add(id);
        if (to.except) ids.delete(to.except);
        const recipients = await activeOnly(db, [...ids]);
        await pushToUsers(db, recipients, message);
        if (bot) {
          const text = `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}\n${siteUrl()}${message.url}`;
          await telegramToPersons(db, await personsOfUsers(db, recipients), text);
        }
      });
    } catch (e) {
      console.error('notify failed', e);
    }
  });
}
