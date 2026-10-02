'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Administration server actions — users, roles, permissions, settings.
// Every action re-checks the caller's permission, then uses the service-role
// client. Loaders return { mode: 'demo' } when Supabase is not configured so
// the pages can fall back to mock data.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionCode } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { provisionSystemUser } from '@/lib/admin/provision';
import {
  DEFAULT_PARISH_SETTINGS,
  type ActionResult,
  type AdminPermissionRow,
  type AdminRoleRow,
  type AdminUnitRow,
  type AdminUserRow,
  type Loaded,
  type ParishSettings,
} from '@/lib/admin/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function authorize(
  permission: PermissionCode
): Promise<{ me: SessionUser; db: SupabaseClient }> {
  if (!isSupabaseEnabled()) throw new Error('The database is not connected');
  const me = await getCurrentUser();
  if (!me) throw new Error('Your session has expired. Please sign in again.');
  if (!me.permissions.includes(permission)) {
    throw new Error('You do not have permission to do this');
  }
  return { me, db: createAdminClient() };
}

function message(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? 'Invalid input';
  return e instanceof Error ? e.message : 'Unexpected error';
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function fetchRolesAndPermissions(db: SupabaseClient) {
  const [roles, links, perms] = await Promise.all([
    db.from('roles').select('*').order('name_en').then(check),
    db.from('role_permissions').select('role_id, permission_id').then(check),
    db.from('permissions').select('id, code, name_en, name_am, category, is_active').order('code').then(check),
  ]);

  const permissions = (perms ?? []) as AdminPermissionRow[];
  const codeById = new Map(permissions.map((p) => [p.id, p.code]));
  const codesByRole = new Map<string, string[]>();
  for (const link of (links ?? []) as { role_id: string; permission_id: string }[]) {
    const code = codeById.get(link.permission_id);
    if (!code) continue;
    codesByRole.set(link.role_id, [...(codesByRole.get(link.role_id) ?? []), code]);
  }

  const roleRows: AdminRoleRow[] = ((roles ?? []) as Omit<AdminRoleRow, 'permissions'>[]).map((r) => ({
    id: r.id,
    code: r.code,
    name_en: r.name_en,
    name_am: r.name_am,
    description_en: r.description_en,
    description_am: r.description_am,
    is_system_role: r.is_system_role,
    is_active: r.is_active,
    permissions: codesByRole.get(r.id) ?? [],
  }));

  return { roles: roleRows, permissions };
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function loadUsers(): Promise<
  Loaded<{ users: AdminUserRow[]; roles: AdminRoleRow[]; units: AdminUnitRow[] }>
> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('USER_MANAGE');
    const [users, assignments, { roles }, units] = await Promise.all([
      db.from('system_users')
        .select('id, person_id, username, is_active, last_login_at, created_at')
        .order('created_at', { ascending: false })
        .then(check),
      db.from('user_unit_assignments')
        .select('system_user_id, role_id, organization_unit_id, expires_at')
        .eq('is_active', true)
        .then(check),
      fetchRolesAndPermissions(db),
      db.from('organization_units')
        .select('id, name_en, name_am')
        .eq('is_active', true)
        .order('sort_order')
        .then(check),
    ]);

    const userList = (users ?? []) as {
      id: string; person_id: string; username: string; is_active: boolean; last_login_at: string | null;
    }[];
    const personIds = userList.map((u) => u.person_id);
    const persons = personIds.length
      ? ((await db.from('persons').select('id, full_name_en, full_name_am').in('id', personIds).then(check)) as {
          id: string; full_name_en: string; full_name_am: string | null;
        }[])
      : [];

    const personById = new Map(persons.map((p) => [p.id, p]));
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const unitList = (units ?? []) as AdminUnitRow[];
    const unitById = new Map(unitList.map((u) => [u.id, u]));
    const now = Date.now();
    const activeAssignments = ((assignments ?? []) as {
      system_user_id: string; role_id: string; organization_unit_id: string; expires_at: string | null;
    }[]).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now);

    const rows: AdminUserRow[] = userList.map((u) => {
      const person = personById.get(u.person_id);
      const mine = activeAssignments.filter((a) => a.system_user_id === u.id);
      const primary = mine[0];
      const role = primary ? roleById.get(primary.role_id) : undefined;
      const unit = primary ? unitById.get(primary.organization_unit_id) : undefined;
      const permissions = [...new Set(mine.flatMap((a) => roleById.get(a.role_id)?.permissions ?? []))];
      return {
        id: u.id,
        username: u.username,
        name: person?.full_name_en ?? u.username,
        name_am: person?.full_name_am || person?.full_name_en || u.username,
        role_id: role?.id ?? null,
        role: role?.name_en ?? '—',
        role_am: role?.name_am ?? '—',
        org_id: unit?.id ?? null,
        org: unit?.name_en ?? '—',
        org_am: unit?.name_am ?? '—',
        last_login: u.last_login_at,
        is_active: u.is_active,
        permissions,
      };
    });

    return { mode: 'live', data: { users: rows, roles, units: unitList } };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

const CreateUserSchema = z.object({
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number, e.g. 0912345678'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  nameEn: z.string().trim().min(2, 'Enter the full name in English'),
  nameAm: z.string().trim(),
  gender: z.enum(['MALE', 'FEMALE']),
  roleId: z.string().min(1, 'Choose a role'),
  unitId: z.string().min(1, 'Choose a unit'),
});

export async function createUser(input: z.input<typeof CreateUserSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    const data = CreateUserSchema.parse(input);
    await provisionSystemUser(db, {
      ...data,
      email: phoneToAuthEmail(data.phone),
      assignedBy: me.systemUser.id,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

async function authUserIdFor(db: SupabaseClient, systemUserId: string): Promise<string> {
  const row = (await db.from('system_users').select('auth_user_id').eq('id', systemUserId).single().then(check)) as {
    auth_user_id: string;
  };
  return row.auth_user_id;
}

export async function setUserActive(systemUserId: string, active: boolean): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    if (me.systemUser.id === systemUserId) throw new Error('You cannot disable your own account');

    const authUserId = await authUserIdFor(db, systemUserId);
    await db.from('system_users').update({ is_active: active }).eq('id', systemUserId).then(check);
    // Ban the login too, so an existing session cannot be refreshed.
    const { error } = await db.auth.admin.updateUserById(authUserId, {
      ban_duration: active ? 'none' : '876000h',
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function resetUserPassword(systemUserId: string, password: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('USER_MANAGE');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const authUserId = await authUserIdFor(db, systemUserId);
    const { error } = await db.auth.admin.updateUserById(authUserId, { password });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function changeUserRole(
  systemUserId: string,
  roleId: string,
  unitId: string
): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    if (me.systemUser.id === systemUserId) throw new Error('You cannot change your own role');
    if (!roleId || !unitId) throw new Error('Choose a role and a unit');

    await db.from('user_unit_assignments')
      .update({ is_active: false })
      .eq('system_user_id', systemUserId)
      .eq('is_active', true)
      .then(check);
    await db.from('user_unit_assignments')
      .insert({
        system_user_id: systemUserId,
        organization_unit_id: unitId,
        role_id: roleId,
        is_active: true,
        assigned_by: me.systemUser.id,
      })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── Roles & permissions ──────────────────────────────────────────────────────

export async function loadRoles(): Promise<
  Loaded<{ roles: AdminRoleRow[]; permissions: AdminPermissionRow[] }>
> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('ROLE_MANAGE');
    return { mode: 'live', data: await fetchRolesAndPermissions(db) };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

export async function loadPermissions(): Promise<Loaded<AdminPermissionRow[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('ROLE_MANAGE');
    const { permissions } = await fetchRolesAndPermissions(db);
    return { mode: 'live', data: permissions };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

const CreateRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((c) => c.toUpperCase().replace(/[\s-]+/g, '_'))
    .refine((c) => /^[A-Z][A-Z0-9_]{2,40}$/.test(c), 'Code must be 3–40 letters, digits or underscores'),
  nameEn: z.string().trim().min(2, 'Enter the role name in English'),
  nameAm: z.string().trim(),
  descEn: z.string().trim(),
  descAm: z.string().trim(),
});

export async function createRole(input: z.input<typeof CreateRoleSchema>): Promise<ActionResult> {
  try {
    const { db } = await authorize('ROLE_MANAGE');
    const data = CreateRoleSchema.parse(input);
    const { error } = await db.from('roles').insert({
      code: data.code,
      name_en: data.nameEn,
      name_am: data.nameAm || data.nameEn,
      description_en: data.descEn || null,
      description_am: data.descAm || null,
      is_system_role: false,
      is_active: true,
    });
    if (error) {
      throw new Error(error.code === '23505' ? `A role with code ${data.code} already exists` : error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function setRolePermissions(roleId: string, codes: string[]): Promise<ActionResult> {
  try {
    const { db } = await authorize('ROLE_MANAGE');
    const role = (await db.from('roles').select('id, is_system_role').eq('id', roleId).single().then(check)) as {
      id: string; is_system_role: boolean;
    };
    if (role.is_system_role) throw new Error('System roles are locked and cannot be edited');

    const perms = codes.length
      ? ((await db.from('permissions').select('id, code').in('code', codes).then(check)) as { id: string }[])
      : [];

    await db.from('role_permissions').delete().eq('role_id', roleId).then(check);
    if (perms.length) {
      await db.from('role_permissions')
        .insert(perms.map((p) => ({ role_id: roleId, permission_id: p.id })))
        .then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'parish_profile';

export async function loadSettings(): Promise<Loaded<ParishSettings>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('SYSTEM_CONFIGURE');
    const row = (await db.from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle().then(check)) as {
      value: Partial<ParishSettings>;
    } | null;
    return { mode: 'live', data: { ...DEFAULT_PARISH_SETTINGS, ...(row?.value ?? {}) } };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

const SettingsSchema = z.object({
  parish_name_en: z.string().trim().min(1, 'Enter the parish name (English)'),
  parish_name_am: z.string().trim().min(1, 'Enter the parish name (Amharic)'),
  diocese: z.string().trim(),
  foundation_year: z.string().trim(),
  motto: z.string().trim(),
});

export async function saveSettings(input: ParishSettings): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('SYSTEM_CONFIGURE');
    const value = SettingsSchema.parse(input);
    await db.from('system_settings')
      .upsert({ key: SETTINGS_KEY, value, updated_by: me.systemUser.id })
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
