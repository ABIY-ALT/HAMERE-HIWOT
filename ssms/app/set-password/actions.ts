'use server';

// ─────────────────────────────────────────────────────────────────────────────
// After signing in with a temporary PIN / password (lib/auth/temp-password):
// the person chooses their own. Nothing else works until they do.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createSessionClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { errorMessage } from '@/lib/auth/authorize';
import { pinOnly, setOwnPassword } from '@/lib/auth/temp-password';
import { tenantClient } from '@/lib/tenant/db';
import type { ActionResult } from '@/lib/admin/types';

/** PINs anyone would guess first */
const EASY = /^(\d)\1{5}$|^(123456|654321|012345|543210|121212|112233)$/;

export async function chooseOwnPassword(next: string): Promise<ActionResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Demo mode — passwords cannot be changed.' };
  try {
    const me = await getCurrentUser();
    if (!me) throw new Error('Your session has expired. Please sign in again.');
    if (!me.mustChangePassword) return { ok: true };
    if (pinOnly(me.systemUser.username, me.permissions)) {
      if (!/^\d{6}$/.test(next)) throw new Error('The PIN must be exactly 6 digits');
      if (EASY.test(next)) throw new Error('That PIN is too easy to guess — choose another');
    } else if (next.length < 8) {
      throw new Error('The password must be at least 8 characters');
    }
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    await setOwnPassword(user.id, next);

    // Record that the password changed (never the password itself)
    const h = await headers();
    await tenantClient(me.tenant.id, { actorId: me.systemUser.id }).from('system_audit_logs').insert({
      user_id: me.systemUser.id,
      action: 'UPDATE',
      table_name: 'system_users',
      record_id: me.systemUser.id,
      new_values: { change: 'password', after: 'temporary' },
      user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
