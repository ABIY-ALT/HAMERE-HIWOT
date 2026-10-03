// ─────────────────────────────────────────────────────────────────────────────
// Push notifications — server only. Sends to every device a user has
// registered. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// (run `npm run setup-push`); without them nothing is sent.
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { createAdminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

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
  const { data: perms } = await db.from('permissions').select('id').in('code', codes);
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
 * because of) the push services. `to` lists user ids and/or permission codes.
 */
export function notifyLater(to: { users?: (string | null | undefined)[]; permissions?: PermissionCode[]; except?: string }, message: PushMessage): void {
  if (!pushConfigured()) return;
  after(async () => {
    try {
      const db = createAdminClient();
      const ids = new Set((to.users ?? []).filter((id): id is string => Boolean(id)));
      if (to.permissions?.length) for (const id of await usersWithPermission(db, ...to.permissions)) ids.add(id);
      if (to.except) ids.delete(to.except);
      await pushToUsers(db, [...ids], message);
    } catch (e) {
      console.error('notify failed', e);
    }
  });
}
