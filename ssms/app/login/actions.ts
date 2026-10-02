'use server';

import { cookies } from 'next/headers';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { DEMO_COOKIE, findDemoAccount } from '@/lib/auth/demo';

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
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToAuthEmail(phone),
      password,
    });
    if (error || !data.user) return { ok: false, error: 'INVALID' };

    const db = createAdminClient();
    const { data: systemUser } = await db
      .from('system_users')
      .select('id, is_active')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (!systemUser?.is_active) {
      await supabase.auth.signOut();
      return { ok: false, error: 'INACTIVE' };
    }

    await db
      .from('system_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', systemUser.id);
    return { ok: true };
  } catch (e) {
    console.error('signIn failed', e);
    return { ok: false, error: 'SERVER' };
  }
}

export async function signOut(): Promise<void> {
  if (isSupabaseEnabled()) {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  }
  (await cookies()).delete(DEMO_COOKIE);
}
