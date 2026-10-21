// ─────────────────────────────────────────────────────────────────────────────
// Logins shared between Sunday schools (server only).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { platformClient } from './db';

/** The login (auth user id) already using this phone — in any Sunday school, or as a platform admin. */
export async function existingLoginForPhone(phone: string): Promise<string | null> {
  const db = platformClient();
  const [{ data: account }, { data: admin }] = await Promise.all([
    db.from('system_users').select('auth_user_id').eq('username', phone).limit(1).maybeSingle(),
    db.from('platform_admins').select('auth_user_id').eq('phone', phone).maybeSingle(),
  ]);
  return (account?.auth_user_id as string | undefined) ?? (admin?.auth_user_id as string | undefined) ?? null;
}

/**
 * Bans or unbans a login so open sessions cannot be refreshed — only when no
 * other Sunday school uses it. A shared login stays usable elsewhere; the
 * account here is still off (system_users.is_active), which already keeps the
 * person out of this Sunday school on their next request.
 */
export async function setLoginBanned(db: SupabaseClient, authUserId: string, banned: boolean): Promise<void> {
  try {
    const { error } = await db.auth.admin.updateUserById(authUserId, { ban_duration: banned ? '876000h' : 'none' });
    if (error) throw new Error(error.message);
  } catch (e) {
    if (e instanceof Error && e.message === 'SHARED_LOGIN') return;
    throw e;
  }
}
