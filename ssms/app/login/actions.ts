'use server';

import { cookies } from 'next/headers';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { DEMO_COOKIE, findDemoAccount } from '@/lib/auth/demo';
import { getCurrentUser } from '@/lib/auth/session';
import { logAuthEvent } from '@/lib/audit/log';

export type SignInResult =
  | { ok: true }
  | { ok: false; error: 'INVALID' | 'INACTIVE' | 'SERVER' };

export async function signIn(login: string, password: string): Promise<SignInResult> {
  if (!login.trim() || !password) return { ok: false, error: 'INVALID' };

  // Demo mode — hardcoded accounts, session kept in an httpOnly cookie.
  if (!isSupabaseEnabled()) {
    const account = findDemoAccount(login, password);
    if (!account) return { ok: false, error: 'INVALID' };
    (await cookies()).set(DEMO_COOKIE, account.username, {
      path: '/',
      maxAge: 60 * 60 * 24,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return { ok: true };
  }

  const phone = normalizePhone(login);
  if (!isValidPhone(phone)) return { ok: false, error: 'INVALID' };

  try {
    const db = createAdminClient();
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToAuthEmail(phone),
      password,
    });
    if (error || !data.user) {
      // Failed attempts are recorded so repeated guessing is visible in the audit trail.
      const { data: known } = await db.from('system_users').select('id').eq('username', phone).maybeSingle();
      await logAuthEvent(db, { action: 'LOGIN', systemUserId: known?.id ?? null, login: phone, result: 'FAILED' });
      return { ok: false, error: 'INVALID' };
    }

    const { data: systemUser } = await db
      .from('system_users')
      .select('id, is_active')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (!systemUser?.is_active) {
      await supabase.auth.signOut();
      await logAuthEvent(db, { action: 'LOGIN', systemUserId: systemUser?.id ?? null, login: phone, result: 'DISABLED' });
      return { ok: false, error: 'INACTIVE' };
    }

    await db
      .from('system_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', systemUser.id);
    await logAuthEvent(db, { action: 'LOGIN', systemUserId: systemUser.id, login: phone, result: 'SUCCESS' });
    return { ok: true };
  } catch (e) {
    console.error('signIn failed', e);
    return { ok: false, error: 'SERVER' };
  }
}

export async function signOut(): Promise<void> {
  if (isSupabaseEnabled()) {
    const me = await getCurrentUser();
    if (me) {
      await logAuthEvent(createAdminClient(), {
        action: 'LOGOUT',
        systemUserId: me.systemUser.id,
        login: me.systemUser.username,
        result: 'SUCCESS',
      });
    }
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  }
  (await cookies()).delete(DEMO_COOKIE);
}
