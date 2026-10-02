// ─────────────────────────────────────────────────────────────────────────────
// Sign-in / sign-out audit entries (server only). Data changes are logged by
// the database trigger (migration 011); logins happen outside the database
// tables, so they are written here.
// ─────────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/** First public client address from the proxy headers, if it is a valid IP. */
function clientIp(h: Headers): string | null {
  const raw = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || '';
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return ipv4.test(raw) || (raw.includes(':') && ipv6.test(raw)) ? raw : null;
}

/**
 * Record a LOGIN / LOGOUT event. Never throws — a logging problem must not
 * stop someone from signing in or out.
 */
export async function logAuthEvent(
  db: SupabaseClient,
  event: {
    action: 'LOGIN' | 'LOGOUT';
    systemUserId: string | null;
    login: string; // phone number used
    result: 'SUCCESS' | 'FAILED' | 'DISABLED';
  }
): Promise<void> {
  try {
    const h = await headers();
    await db.from('system_audit_logs').insert({
      user_id: event.systemUserId,
      action: event.action,
      table_name: 'system_users',
      record_id: event.systemUserId ?? event.login,
      new_values: { result: event.result, login: event.login },
      ip_address: clientIp(h),
      user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}
