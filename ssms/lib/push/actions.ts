'use server';

// Registering / forgetting this device for push notifications.

import { z } from 'zod';
import { headers } from 'next/headers';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult } from '@/lib/admin/types';

/** The public key browsers need to subscribe; null when push isn't set up. */
export async function getPushPublicKey(): Promise<string | null> {
  if (!isSupabaseEnabled()) return null;
  return process.env.VAPID_PUBLIC_KEY || null;
}

const SubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Saves this device for the signed-in user (a device moves with whoever signs in). */
export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  try {
    const { me, db } = await authorize();
    const s = SubscriptionSchema.parse(input);
    const h = await headers();
    const { error } = await db.from('push_subscriptions').upsert(
      {
        system_user_id: me.systemUser.id,
        endpoint: s.endpoint,
        p256dh: s.keys.p256dh,
        auth: s.keys.auth,
        user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw new Error(error.message.includes('push_subscriptions') ? 'Run database migration 017 (push) first' : error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Called on sign-out so the next person on this device doesn't get these notifications. */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize();
    await db.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('system_user_id', me.systemUser.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
