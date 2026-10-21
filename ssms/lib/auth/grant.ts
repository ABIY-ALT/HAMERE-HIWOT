// ─────────────────────────────────────────────────────────────────────────────
// Nobody can give more than they hold (server only). Without this, someone
// with USER_MANAGE could give an account the Super Administrator role, or
// reset the Super Administrator's password and sign in as them; someone with
// ROLE_MANAGE could add any permission to their own role.
//
// Compared on what the roles really grant (not the plan-trimmed session list),
// so a Super Administrator on a small plan is not blocked.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

async function codesOfRoles(db: SupabaseClient, roleIds: string[]): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set();
  const { data, error } = await db
    .from('role_permissions')
    .select('permission:permissions(code, is_active)')
    .in('role_id', [...new Set(roleIds)]);
  if (error) throw new Error(error.message);
  const codes = new Set<string>();
  for (const r of (data ?? []) as unknown as { permission: { code: string; is_active: boolean } | null }[]) {
    if (r.permission?.is_active) codes.add(r.permission.code);
  }
  return codes;
}

/** Permissions an account holds through its active, unexpired role assignments. */
export async function heldPermissions(db: SupabaseClient, systemUserId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('user_unit_assignments')
    .select('role_id, expires_at')
    .eq('system_user_id', systemUserId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  const now = Date.now();
  const roles = ((data ?? []) as { role_id: string; expires_at: string | null }[])
    .filter((a) => !a.expires_at || Date.parse(a.expires_at) > now)
    .map((a) => a.role_id);
  return codesOfRoles(db, roles);
}

const missing = (needed: Set<string>, held: Set<string>) => [...needed].filter((c) => !held.has(c));

/** The actor may give this role only if they hold every permission it grants. */
export async function assertCanGrantRole(db: SupabaseClient, actorId: string, roleId: string): Promise<void> {
  const [held, role] = await Promise.all([heldPermissions(db, actorId), codesOfRoles(db, [roleId])]);
  const extra = missing(role, held);
  if (extra.length) throw new Error(`You cannot give a role with permissions you do not have yourself (${extra.slice(0, 3).join(', ')}${extra.length > 3 ? '…' : ''})`);
}

/** The actor may change, switch off or reset another account only if that account holds nothing beyond the actor. */
export async function assertCanManageUser(db: SupabaseClient, actorId: string, targetId: string): Promise<void> {
  if (actorId === targetId) return;
  const [held, target] = await Promise.all([heldPermissions(db, actorId), heldPermissions(db, targetId)]);
  if (missing(target, held).length) throw new Error('This account has more rights than you — only someone with at least the same rights can change it');
}

/** The actor may edit a role only if they hold every permission it has now and every one it will have. */
export async function assertCanEditRole(db: SupabaseClient, actorId: string, roleId: string, nextCodes: string[]): Promise<void> {
  const [held, now] = await Promise.all([heldPermissions(db, actorId), codesOfRoles(db, [roleId])]);
  const extra = missing(new Set([...now, ...nextCodes]), held);
  if (extra.length) throw new Error(`You cannot edit a role with permissions you do not have yourself (${extra.slice(0, 3).join(', ')}${extra.length > 3 ? '…' : ''})`);
}
