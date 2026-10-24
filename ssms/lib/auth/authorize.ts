// ─────────────────────────────────────────────────────────────────────────────
// Permission gate for server actions (server only — never export from a
// 'use server' file, or it becomes a public endpoint).
//
// The client it returns is held to the user's own Sunday school
// (lib/tenant/db.ts) and is read-only while the subscription is not paid up.
// The user's permissions already reflect the plan (lib/auth/session.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { ReadOnlyError, tenantClient } from '@/lib/tenant/db';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { MODULE_LABELS, type ModuleCode } from '@/lib/billing/modules';
import { LIMIT_LABELS, type LimitMetric } from '@/lib/billing/access';

/**
 * Returns the signed-in user and a tenant-scoped client, or throws a readable
 * error if the database is off, the session expired, the Sunday school is
 * blocked, or the user lacks ANY of the given permissions.
 */
export async function authorize(
  ...permissions: PermissionCode[]
): Promise<{ me: SessionUser; db: SupabaseClient }> {
  if (!isSupabaseEnabled()) throw new Error('The database is not connected');
  const me = await getCurrentUser();
  if (!me) throw new Error('Your session has expired. Please sign in again.');
  if (me.tenant.access.mode === 'blocked') throw new Error('BLOCKED');
  // A temporary PIN / password opens nothing but /set-password
  if (me.mustChangePassword) throw new Error('Choose your own PIN or password first — reload the page');
  if (permissions.length && !permissions.some((p) => me.permissions.includes(p))) {
    throw new Error('You do not have permission to do this');
  }
  return {
    me,
    db: tenantClient(me.tenant.id, { actorId: me.systemUser.id, readOnly: me.tenant.access.mode !== 'full' }),
  };
}

/** authorize() for actions of a module whose pages share permissions with others (lib/billing/modules.ts). */
export async function authorizeIn(
  module: ModuleCode,
  ...permissions: PermissionCode[]
): Promise<{ me: SessionUser; db: SupabaseClient }> {
  const result = await authorize(...permissions);
  if (!result.me.tenant.access.modules.includes(module)) throw new Error(`MODULE:${module}`);
  return result;
}

export function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? 'Invalid input';
  if (e instanceof ReadOnlyError) return readOnlyMessage;
  const message = e instanceof Error ? e.message : 'Unexpected error';
  return friendly(message);
}

const readOnlyMessage =
  'Your subscription is not active, so the system is read-only. An administrator can renew it under Administration → Billing.';

/** Database / platform errors in words a user can act on. */
function friendly(message: string): string {
  const quota = /QUOTA_EXCEEDED:([a-z_]+):(\d+)/.exec(message);
  if (quota) {
    const label = LIMIT_LABELS[quota[1] as LimitMetric]?.[0] ?? quota[1];
    return `Your plan allows ${quota[2]} (${label}). Upgrade the plan under Administration → Billing to add more.`;
  }
  const missing = /^MODULE:([a-z_]+)$/.exec(message);
  if (missing) {
    const label = MODULE_LABELS[missing[1] as ModuleCode]?.[0] ?? missing[1];
    return `${label} is not included in your plan. Upgrade under Administration → Billing.`;
  }
  const locked = /GL_LOCKED:(\d{4}-\d{2}-\d{2})/.exec(message);
  if (locked) {
    return `The books are closed up to ${locked[1]} (Finance → Accounting → Chart of accounts → Settings). Records on or before that date cannot be added, changed or removed.`;
  }
  if (message === 'READ_ONLY') return readOnlyMessage;
  if (message === 'BLOCKED') return 'This Sunday school’s account is suspended. Please contact support.';
  if (message === 'SHARED_LOGIN') {
    return 'This login is also used in another Sunday school, so only its owner can change it (Profile → Change password).';
  }
  if (/Cross-tenant/i.test(message)) return 'Not found — reload the page';
  return message;
}

/** Unwraps a Supabase response, throwing its error message. */
export function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Reads every row of a query, 1000 at a time (PostgREST caps a single response). */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}
