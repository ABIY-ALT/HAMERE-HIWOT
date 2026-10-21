// ─────────────────────────────────────────────────────────────────────────────
// Current user (server only)
//
// Supabase mode: reads the Supabase session cookie, finds the user's accounts
// (one per Sunday school they belong to), picks the Sunday school they chose
// (ssms_tenant cookie — only honoured when they really have an account there),
// then loads that account, its person, role assignments and permissions.
// Permissions of modules missing from the plan are removed; while the
// subscription is read-only only viewing permissions remain; a blocked
// Sunday school keeps none.
// Demo mode: reads the demo login cookie and resolves a mock user.
// Returns null when nobody is signed in (or every account is disabled).
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Person, PermissionCode, SystemUser, UserUnitAssignment } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createSessionClient } from '@/lib/supabase/server';
import { permissionCodesForRoles } from '@/lib/auth/rbac';
import { DEMO_ACCOUNTS, DEMO_COOKIE } from '@/lib/auth/demo';
import { DEFAULT_TENANT_ID, platformClient, tenantClient } from '@/lib/tenant/db';
import { TENANT_COLUMNS, loadTenantContext, type TenantContext, type TenantInfo } from '@/lib/tenant/context';
import { MODULE_CODES, permissionsForModules } from '@/lib/billing/modules';
import { readOnlyPermissions } from '@/lib/billing/access';
import {
  MOCK_PERSONS,
  MOCK_SYSTEM_USERS,
  MOCK_USER_ASSIGNMENTS,
  resolveMockUserPermissions,
} from '@/lib/mock/data';

/** Chosen Sunday school of someone who belongs to several. */
export const TENANT_COOKIE = 'ssms_tenant';

export interface Membership {
  tenantId: string;
  slug: string;
  name_en: string;
  name_am: string | null;
}

/** AuthUser with permissions as an array so it can cross the server→client boundary. */
export interface SessionUser {
  systemUser: SystemUser;
  person: Person;
  assignments: UserUnitAssignment[];
  permissions: PermissionCode[];
  organizationIds: string[];
  /** The Sunday school this session works in */
  tenant: TenantContext;
  /** Every Sunday school this login has an active account in */
  memberships: Membership[];
  /** Signed in with a temporary PIN / password: must choose their own first (lib/auth/temp-password, /set-password) */
  mustChangePassword: boolean;
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return isSupabaseEnabled() ? loadSupabaseUser() : loadDemoUser();
});

const DEMO_TENANT: TenantContext = {
  id: DEFAULT_TENANT_ID,
  slug: 'demo',
  name_en: 'Demo Sunday School',
  name_am: 'ማሳያ ሰንበት ትምህርት ቤት',
  status: 'ACTIVE',
  is_default: true,
  reg_prefix: 'REG',
  access: {
    mode: 'full',
    reason: null,
    status: 'ACTIVE',
    planCode: 'ENTERPRISE',
    planNameEn: 'Enterprise',
    planNameAm: 'ኢንተርፕራይዝ',
    isFree: false,
    modules: [...MODULE_CODES],
    limits: {},
    trialEndsAt: null,
    periodEnd: null,
    graceEndsAt: null,
    notice: null,
  },
};

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
    tenant: DEMO_TENANT,
    memberships: [{ tenantId: DEMO_TENANT.id, slug: DEMO_TENANT.slug, name_en: DEMO_TENANT.name_en, name_am: DEMO_TENANT.name_am }],
    mustChangePassword: false,
  };
}

/** Permissions as the tenant's plan and subscription state allow them. */
function entitled(codes: PermissionCode[], tenant: TenantContext): PermissionCode[] {
  if (tenant.access.mode === 'blocked') return [];
  const inPlan = permissionsForModules(codes, new Set(tenant.access.modules));
  return tenant.access.mode === 'read_only' ? readOnlyPermissions(inPlan) : inPlan;
}

type AccountRow = { id: string; tenant_id: string; is_active: boolean; tenant: TenantInfo | null };

/** The login's usable accounts, the default Sunday school first, then by name. */
export async function accountsOfLogin(authUserId: string): Promise<AccountRow[]> {
  const { data, error } = await platformClient()
    .from('system_users')
    .select(`id, tenant_id, is_active, tenant:tenants!system_users_tenant_fkey(${TENANT_COLUMNS})`)
    .eq('auth_user_id', authUserId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as AccountRow[])
    .filter((a) => a.is_active && a.tenant && a.tenant.status !== 'TEMPLATE' && a.tenant.status !== 'DEACTIVATED')
    .sort((a, b) => Number(b.tenant!.is_default) - Number(a.tenant!.is_default) || a.tenant!.name_en.localeCompare(b.tenant!.name_en));
}

async function loadSupabaseUser(): Promise<SessionUser | null> {
  const supabase = await createSessionClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const accounts = await accountsOfLogin(authUser.id);
  if (accounts.length === 0) return null;
  // app_metadata.temp_password (lib/auth/temp-password) — only the server can set it
  const mustChangePassword = authUser.app_metadata?.temp_password === true;
  const chosenTenant = (await cookies()).get(TENANT_COOKIE)?.value;
  const account = accounts.find((a) => a.tenant_id === chosenTenant) ?? accounts[0];
  const tenant = await loadTenantContext(account.tenant_id);
  if (!tenant) return null;
  const memberships: Membership[] = accounts.map((a) => ({
    tenantId: a.tenant_id,
    slug: a.tenant!.slug,
    name_en: a.tenant!.name_en,
    name_am: a.tenant!.name_am,
  }));

  const db = tenantClient(tenant.id);
  // The account, its person, its unit assignments and their permissions in ONE
  // round trip — this runs on every page load and every save (5 queries one
  // after another took ~0.9 s; this ~0.16 s). The step-by-step way below
  // stays as a fallback.
  const { data: all, error: allError } = await db
    .from('system_users')
    .select(
      '*, person:persons!system_users_person_id_fkey(*), assignments:user_unit_assignments!user_unit_assignments_system_user_id_fkey(*, role:roles(role_permissions(permission:permissions(code, is_active))))'
    )
    .eq('id', account.id)
    .maybeSingle();
  if (!allError) {
    if (!all || !all.is_active || !all.person) return null;
    const { person, assignments: rows, ...systemUser } = all as Record<string, unknown> & {
      person: Person;
      assignments: (UserUnitAssignment & { role?: { role_permissions?: { permission?: { code: string; is_active: boolean } | null }[] } | null })[];
    };
    const now = Date.now();
    const live = (rows ?? []).filter((a) => a.is_active && (!a.expires_at || new Date(a.expires_at).getTime() > now));
    const codes = new Set<PermissionCode>();
    for (const a of live) for (const rp of a.role?.role_permissions ?? []) if (rp.permission?.is_active) codes.add(rp.permission.code as PermissionCode);
    const assignments = live.map(({ role: _role, ...a }) => (void _role, a as UserUnitAssignment));
    return {
      systemUser: systemUser as unknown as SystemUser,
      person,
      assignments,
      permissions: entitled([...codes], tenant),
      organizationIds: [...new Set(assignments.map((a) => a.organization_unit_id))],
      tenant,
      memberships,
      mustChangePassword,
    };
  }

  const { data: systemUser } = await db
    .from('system_users')
    .select('*')
    .eq('id', account.id)
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
    permissions: entitled(permissions, tenant),
    organizationIds: [...new Set(assignments.map((a) => a.organization_unit_id))],
    tenant,
    memberships,
    mustChangePassword,
  };
}
