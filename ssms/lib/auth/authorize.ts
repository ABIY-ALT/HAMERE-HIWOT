// ─────────────────────────────────────────────────────────────────────────────
// Permission gate for server actions (server only — never export from a
// 'use server' file, or it becomes a public endpoint).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';

/**
 * Returns the signed-in user and a service-role client, or throws a readable
 * error if the database is off, the session expired, or the user lacks ANY of
 * the given permissions.
 */
export async function authorize(
  ...permissions: PermissionCode[]
): Promise<{ me: SessionUser; db: SupabaseClient }> {
  if (!isSupabaseEnabled()) throw new Error('The database is not connected');
  const me = await getCurrentUser();
  if (!me) throw new Error('Your session has expired. Please sign in again.');
  if (permissions.length && !permissions.some((p) => me.permissions.includes(p))) {
    throw new Error('You do not have permission to do this');
  }
  return { me, db: createAdminClient() };
}

export function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? 'Invalid input';
  return e instanceof Error ? e.message : 'Unexpected error';
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
