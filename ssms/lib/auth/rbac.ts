// ─────────────────────────────────────────────────────────────────────────────
// RBAC lookups against Supabase (server only)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';

/** Active permission codes granted by any of the given roles. */
export async function permissionCodesForRoles(
  db: SupabaseClient,
  roleIds: string[]
): Promise<PermissionCode[]> {
  if (roleIds.length === 0) return [];

  const { data: links, error: linkError } = await db
    .from('role_permissions')
    .select('permission_id')
    .in('role_id', roleIds);
  if (linkError) throw new Error(linkError.message);

  const permissionIds = [...new Set((links ?? []).map((l) => l.permission_id as string))];
  if (permissionIds.length === 0) return [];

  const { data: perms, error: permError } = await db
    .from('permissions')
    .select('code')
    .in('id', permissionIds)
    .eq('is_active', true);
  if (permError) throw new Error(permError.message);

  return (perms ?? []).map((p) => p.code as PermissionCode);
}
