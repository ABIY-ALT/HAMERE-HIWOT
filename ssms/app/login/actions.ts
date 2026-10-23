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
import { runInTenant } from '@/lib/tenant/scope';
import { loadTenantAccess } from '@/lib/tenant/context';
import { chatsOf, escapeHtml, telegramConfigured, telegramToChats } from '@/lib/telegram/bot';
import { createOwnLogin } from '@/lib/auth/self-login';
import { logReset, sendTemporary } from '@/lib/auth/temp-password';

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

/**
 * "First time, or forgot?" on the sign-in page. The answer is the same
 * whatever is found, so nobody learns whose phone is in the records.
 * In each Sunday school where this phone is on a person's own record and that
 * person is connected to the Telegram bot:
 *   • no login yet → one is made (lib/auth/self-login) and a temporary
 *     password goes to their own chat;
 *   • a login already → their chat is told how to get a new PIN there
 *     (nothing is changed from the website, so a stranger typing the number
 *     cannot lock anyone out).
 */
export async function loginHelpByTelegram(phoneInput: string): Promise<{ ok: true } | { ok: false; error: 'INVALID' | 'RATE_LIMITED' | 'SERVER' }> {
  if (!isSupabaseEnabled()) return { ok: true };
  const phone = normalizePhone(phoneInput);
  if (!isValidPhone(phone)) return { ok: false, error: 'INVALID' };
  if (!(await rateLimit(`login-help-ip:${await requestIp()}`, 10, 3600)) || !(await rateLimit(`login-help:${phone}`, 3, 24 * 3600))) {
    return { ok: false, error: 'RATE_LIMITED' };
  }
  try {
    const tail = `%${phone.slice(1).split('').join('%')}`;
    const { data } = await platformClient().from('persons').select('id, tenant_id, phone_primary').ilike('phone_primary', tail).eq('status', 'ACTIVE').limit(20);
    const people = ((data ?? []) as { id: string; tenant_id: string; phone_primary: string | null }[]).filter((p) => normalizePhone(p.phone_primary ?? '') === phone);
    for (const p of people) {
      await runInTenant(p.tenant_id, async () => {
        const access = await loadTenantAccess(p.tenant_id);
        if (access.mode === 'blocked' || !access.modules.includes('telegram') || !(await telegramConfigured())) return;
        const db = tenantClient(p.tenant_id);
        const chats = await chatsOf(db, [p.id], 'SELF');
        if (chats.size === 0) return;
        const { data: account } = await db.from('system_users').select('id').eq('person_id', p.id).limit(1).maybeSingle();
        if (!account) {
          if (access.mode !== 'full') return;
          const made = await createOwnLogin(db, p.id);
          if (made.status === 'created') {
            const delivered = await sendTemporary(chats, { name: made.name, login: made.username, secret: made.secret, pin: false });
            await logReset(db, { systemUserId: made.systemUserId, actorId: null, via: 'bot', delivered });
          } else if (made.status === 'linked') {
            await telegramToChats(db, chats, escapeHtml(`✅ ${made.name}: በዚህ ስልክ የሚገቡበት መግቢያ ከዚህ ሰንበት ትምህርት ቤት ጋርም ተገናኝቷል። በነበረው የይለፍ ቃልዎ ይግቡ።\nThe login you use with this phone now opens this Sunday school too. Sign in with your existing password.`));
          }
          return;
        }
        await telegramToChats(
          db,
          chats,
          escapeHtml(
            '🔑 ከድረ-ገጹ በዚህ ስልክ ለመግባት እርዳታ ተጠይቋል። እርስዎ ከሆኑ /pin ይላኩ ወይም «🔑 ሚስጥር ቁጥሬን ረሳሁ» ይጫኑ — አዲስ ጊዜያዊ እዚህ ይደርስዎታል። እርስዎ ካልሆኑ ይህን ይተዉት።\n' +
              '🔑 Someone asked the website for help to sign in with this phone. If it was you, send /pin or tap “🔑 Forgot my PIN” — a new temporary one comes here. If not, ignore this.'
          )
        );
      });
    }
    return { ok: true };
  } catch (e) {
    console.error('login help failed', e);
    return { ok: false, error: 'SERVER' };
  }
}
