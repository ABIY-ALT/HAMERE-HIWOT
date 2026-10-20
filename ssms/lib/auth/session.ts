// ─────────────────────────────────────────────────────────────────────────────
// Current user (server only)
//
// Supabase mode: reads the Supabase session cookie, then loads the matching
// system_users row, person, role assignments and permissions.
// Demo mode: reads the demo login cookie and resolves a mock user.
// Returns null when nobody is signed in (or the account is disabled).
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Person, PermissionCode, SystemUser, UserUnitAssignment } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
import { permissionCodesForRoles } from '@/lib/auth/rbac';
import { DEMO_ACCOUNTS, DEMO_COOKIE } from '@/lib/auth/demo';
import {
  MOCK_PERSONS,
  MOCK_SYSTEM_USERS,
  MOCK_USER_ASSIGNMENTS,
  resolveMockUserPermissions,
} from '@/lib/mock/data';

/** AuthUser with permissions as an array so it can cross the server→client boundary. */
export interface SessionUser {
  systemUser: SystemUser;
  person: Person;
  assignments: UserUnitAssignment[];
  permissions: PermissionCode[];
  organizationIds: string[];
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return isSupabaseEnabled() ? loadSupabaseUser() : loadDemoUser();
});

async function loadDemoUser(): Promise<SessionUser | null> {
  const username = (await cookies()).get(DEMO_COOKIE)?.value;
  const account = DEMO_ACCOUNTS.find((a) => a.username === username);
  if (!account) return null;

  const systemUser = MOCK_SYSTEM_USERS.find((u) => u.id === account.systemUserId);
  const person = systemUser && MOCK_PERSONS.find((p) => p.id === systemUser.person_id);
  if (!systemUser || !person) return null;

  const assignments = MOCK_USER_ASSIGNMENTS.filter(
    (a) => a.system_user_id === systemUser.id && a.is_active
  );
  return {
    systemUser,
    person,
    assignments,
    permissions: Array.from(resolveMockUserPermissions(systemUser.id)) as PermissionCode[],
    organizationIds: assignments.map((a) => a.organization_unit_id),
  };
}

async function loadSupabaseUser(): Promise<SessionUser | null> {
  const supabase = await createSessionClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const db = createAdminClient();
  // The account, its person, its unit assignments and their permissions in ONE
  // round trip — this runs on every page load and every save (5 queries one
  // after another took ~0.9 s; this ~0.16 s). The step-by-step way below
  // stays as a fallback.
  const { data: all, error: allError } = await db
    .from('system_users')
    .select(
      '*, person:persons!system_users_person_id_fkey(*), assignments:user_unit_assignments!user_unit_assignments_system_user_id_fkey(*, role:roles(role_permissions(permission:permissions(code, is_active))))'
    )
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (!allError) {
    if (!all || !all.is_active || !all.person) return null;
    const { person, assignments: rows, ...account } = all as Record<string, unknown> & {
      person: Person;
      assignments: (UserUnitAssignment & { role?: { role_permissions?: { permission?: { code: string; is_active: boolean } | null }[] } | null })[];
    };
    const now = Date.now();
    const live = (rows ?? []).filter((a) => a.is_active && (!a.expires_at || new Date(a.expires_at).getTime() > now));
    const codes = new Set<PermissionCode>();
    for (const a of live) for (const rp of a.role?.role_permissions ?? []) if (rp.permission?.is_active) codes.add(rp.permission.code as PermissionCode);
    const assignments = live.map(({ role: _role, ...a }) => (void _role, a as UserUnitAssignment));
    return {
      systemUser: account as unknown as SystemUser,
      person,
      assignments,
      permissions: [...codes],
      organizationIds: [...new Set(assignments.map((a) => a.organization_unit_id))],
    };
  }

  const { data: systemUser } = await db
    .from('system_users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (!systemUser || !systemUser.is_active) return null;

  const { data: person } = await db
    .from('persons')
    .select('*')
    .eq('id', systemUser.person_id)
    .maybeSingle();
  if (!person) return null;

  const { data: rows } = await db
    .from('user_unit_assignments')
    .select('*')
    .eq('system_user_id', systemUser.id)
    .eq('is_active', true);
  const now = Date.now();
  const assignments = ((rows ?? []) as UserUnitAssignment[]).filter(
    (a) => !a.expires_at || new Date(a.expires_at).getTime() > now
  );

  const permissions = await permissionCodesForRoles(db, [
    ...new Set(assignments.map((a) => a.role_id)),
  ]);

  return {
    systemUser: systemUser as SystemUser,
    person: person as Person,
    assignments,
    permissions,
    organizationIds: [...new Set(assignments.map((a) => a.organization_unit_id))],
  };
}
