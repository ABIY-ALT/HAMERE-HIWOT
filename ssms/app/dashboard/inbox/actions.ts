'use server';

// ─────────────────────────────────────────────────────────────────────────────
// The signed-in user's notification inbox (migration 045): every notice sent
// to them by push / Telegram is also kept here. Anyone signed in sees only
// their own.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { cleanPrefs, type NotificationPrefs } from '@/lib/notifications/prefs';

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  created_at: string;
}

const PAGE = 40;
const MIGRATION = 'Run database migration 045 (spiritual life, certificates, inbox) first';
const missing = (m: string) => (/notifications/.test(m) && /schema cache|does not exist|Could not find/.test(m) ? MIGRATION : m);

export async function loadInbox(page = 0, unreadOnly = false): Promise<Loaded<{ items: InboxItem[]; more: boolean; unread: number }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    const from = Math.max(0, Math.floor(page)) * PAGE;
    let q = db.from('notifications').select('id, title, body, url, read_at, created_at').eq('system_user_id', me.systemUser.id);
    if (unreadOnly) q = q.is('read_at', null);
    const [rows, unread] = await Promise.all([
      q.order('created_at', { ascending: false }).range(from, from + PAGE).then(check) as Promise<
        { id: string; title: string; body: string; url: string; read_at: string | null; created_at: string }[]
      >,
      db.from('notifications').select('id', { count: 'exact', head: true }).eq('system_user_id', me.systemUser.id).is('read_at', null).then((r) => r.count ?? 0),
    ]);
    return {
      mode: 'live',
      data: {
        items: rows.slice(0, PAGE).map((r) => ({ id: r.id, title: r.title, body: r.body, url: r.url, read: Boolean(r.read_at), created_at: r.created_at })),
        more: rows.length > PAGE,
        unread,
      },
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

/** Marks some (or 'all') of the user's notices as read. */
export async function markInboxRead(ids: string[] | 'all'): Promise<ActionResult> {
  if (!isSupabaseEnabled()) return { ok: true };
  try {
    const { me, db } = await authorize();
    let q = db.from('notifications').update({ read_at: new Date().toISOString() }).eq('system_user_id', me.systemUser.id).is('read_at', null);
    if (ids !== 'all') {
      const list = z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).max(200).parse(ids);
      if (list.length === 0) return { ok: true };
      q = q.in('id', list);
    }
    await q.then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}

// ── Notification settings (migration 047) ────────────────────────────────────

const PREFS_MIGRATION = 'Run database migration 047 (notification settings) first';

/** What the signed-in user chose, and whether push / Telegram are set up for them at all. */
export async function loadMyNotificationPrefs(): Promise<Loaded<{ prefs: NotificationPrefs; devices: number; telegram: boolean }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    const { data, error } = await db.from('system_users').select('notification_prefs, person_id').eq('id', me.systemUser.id).single();
    if (error) throw new Error(/notification_prefs/.test(error.message) ? PREFS_MIGRATION : error.message);
    const row = data as { notification_prefs: NotificationPrefs | null; person_id: string | null };
    const [{ count: devices }, { count: chats }] = await Promise.all([
      db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('system_user_id', me.systemUser.id),
      row.person_id
        ? db.from('telegram_links').select('chat_id', { count: 'exact', head: true }).eq('person_id', row.person_id)
        : Promise.resolve({ count: 0 }),
    ]);
    return { mode: 'live', data: { prefs: cleanPrefs(row.notification_prefs), devices: devices ?? 0, telegram: (chats ?? 0) > 0 } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

export async function saveMyNotificationPrefs(prefs: NotificationPrefs): Promise<ActionResult> {
  try {
    const { me, db } = await authorize();
    const res = await db.from('system_users').update({ notification_prefs: cleanPrefs(prefs) }).eq('id', me.systemUser.id);
    if (res.error) throw new Error(/notification_prefs/.test(res.error.message) ? PREFS_MIGRATION : res.error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
