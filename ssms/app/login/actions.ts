'use server';

import { cookies } from 'next/headers';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createSessionClient } from '@/lib/supabase/server';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { normalizeRegNo, regNoToAuthEmail } from '@/lib/auth/student-login';
import { DEMO_COOKIE, findDemoAccount } from '@/lib/auth/demo';
import { TENANT_COOKIE, accountsOfLogin, getCurrentUser } from '@/lib/auth/session';
import { logAuthEvent } from '@/lib/audit/log';
import { platformClient, tenantClient } from '@/lib/tenant/db';
import { rateLimit, requestIp } from '@/lib/security/rate-limit';
import { isPlatformAdmin } from '@/lib/platform/auth';

export type SignInResult =
  | { ok: true; to: string }
  | { ok: false; error: 'INVALID' | 'INACTIVE' | 'SERVER' | 'RATE_LIMITED' };

/** Wrong passwords allowed per login and per address in 15 minutes */
const LOGIN_TRIES = 10;
const IP_TRIES = 40;

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
    return { ok: true, to: '/dashboard' };
  }

  // Staff sign in with their phone number, students with their registration number
  const regNo = normalizeRegNo(login);
  const phone = normalizePhone(login);
  if (!regNo && !isValidPhone(phone)) return { ok: false, error: 'INVALID' };
  const username = regNo ?? phone;

  try {
    const ip = await requestIp();
    const [loginOk, ipOk] = await Promise.all([
      rateLimit(`login:${username}`, LOGIN_TRIES, 900),
      rateLimit(`login-ip:${ip}`, IP_TRIES, 900),
    ]);
    if (!loginOk || !ipOk) return { ok: false, error: 'RATE_LIMITED' };

    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: regNo ? regNoToAuthEmail(regNo) : phoneToAuthEmail(phone),
      password,
    });
    if (error || !data.user) {
      // Failed attempts are recorded (in each Sunday school using this login) so repeated guessing is visible
      const { data: known } = await platformClient().from('system_users').select('id, tenant_id').eq('username', username).limit(5);
      for (const k of known ?? []) {
        await logAuthEvent(tenantClient(k.tenant_id as string), { action: 'LOGIN', systemUserId: k.id as string, login: username, result: 'FAILED' });
      }
      return { ok: false, error: 'INVALID' };
    }

    const accounts = await accountsOfLogin(data.user.id);
    if (accounts.length === 0) {
      if (await isPlatformAdmin(data.user.id)) return { ok: true, to: '/platform' };
      await supabase.auth.signOut();
      const { data: disabled } = await platformClient().from('system_users').select('id, tenant_id').eq('auth_user_id', data.user.id).limit(5);
      for (const d of disabled ?? []) {
        await logAuthEvent(tenantClient(d.tenant_id as string), { action: 'LOGIN', systemUserId: d.id as string, login: username, result: 'DISABLED' });
      }
      return { ok: false, error: 'INACTIVE' };
    }

    // Keep the Sunday school chosen last time, if this login still belongs to it
    const jar = await cookies();
    const account = accounts.find((a) => a.tenant_id === jar.get(TENANT_COOKIE)?.value) ?? accounts[0];
    jar.set(TENANT_COOKIE, account.tenant_id, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    const db = tenantClient(account.tenant_id, { actorId: account.id });
    await db.from('system_users').update({ last_login_at: new Date().toISOString() }).eq('id', account.id);
    await logAuthEvent(db, { action: 'LOGIN', systemUserId: account.id, login: username, result: 'SUCCESS' });
    // A temporary PIN / password (lib/auth/temp-password): choose their own first
    return { ok: true, to: data.user.app_metadata?.temp_password === true ? '/set-password' : '/dashboard' };
  } catch (e) {
    console.error('signIn failed', e);
    return { ok: false, error: 'SERVER' };
  }
}

export async function signOut(): Promise<void> {
  if (isSupabaseEnabled()) {
    const me = await getCurrentUser();
    if (me) {
      await logAuthEvent(tenantClient(me.tenant.id, { actorId: me.systemUser.id }), {
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

/** Work in another Sunday school this login belongs to (checked here, not trusted from the browser). */
export async function switchTenant(tenantId: string): Promise<{ ok: boolean }> {
  if (!isSupabaseEnabled()) return { ok: false };
  const me = await getCurrentUser();
  if (!me || !me.memberships.some((m) => m.tenantId === tenantId)) return { ok: false };
  (await cookies()).set(TENANT_COOKIE, tenantId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return { ok: true };
}
