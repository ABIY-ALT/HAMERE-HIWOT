'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Administration server actions — users, roles, permissions, settings.
// Every action re-checks the caller's permission, then uses the service-role
// client. Loaders return { mode: 'demo' } when Supabase is not configured so
// the pages can fall back to mock data.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { provisionSystemUser } from '@/lib/admin/provision';
import { chatsForLogin, loginPowers, logReset, newTemporary, pinOnly, sendTemporary, setTemporaryPassword } from '@/lib/auth/temp-password';
import { chatsOf, telegramConfigured } from '@/lib/telegram/bot';
import { notifyLater } from '@/lib/push/send';
import { studentOnlyIds } from '@/lib/members/membership';
import { existingLoginForPhone, setLoginBanned } from '@/lib/tenant/accounts';
import { assertCanEditRole, assertCanGrantRole, assertCanManageUser } from '@/lib/auth/grant';
import { refreshPublicSite } from '@/lib/site/cache';
import { PERMISSION_MODULE } from '@/lib/billing/modules';
import { SELF_LOGIN_KEY, selfLoginAllowed } from '@/lib/auth/self-login';
import type { PermissionCode } from '@/types';
import {
  DEFAULT_PARISH_SETTINGS,
  PARISH_SETTINGS_KEY as SETTINGS_KEY,
  type ActionResult,
  type AdminPermissionRow,
  type AdminRoleRow,
  type AdminUnitRow,
  type AdminUserRow,
  type Loaded,
  type ParishSettings,
} from '@/lib/admin/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const message = errorMessage;

/** Active, unexpired role assignments with the account's name and the unit. */
async function liveAssignments(db: SupabaseClient) {
  const rows = (await db.from('user_unit_assignments')
    .select('id, system_user_id, role_id, organization_unit_id, expires_at')
    .eq('is_active', true)
    .then(check)) as { id: string; system_user_id: string; role_id: string; organization_unit_id: string; expires_at: string | null }[];
  const now = Date.now();
  return rows.filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now);
}

/** Who holds each role now: name and unit. */
async function roleHolders(db: SupabaseClient): Promise<Map<string, NonNullable<AdminRoleRow['holders']>>> {
  const [assignments, users, units] = await Promise.all([
    liveAssignments(db),
    db.from('system_users').select('id, is_active, person:persons!system_users_person_id_fkey(full_name_en, full_name_am)').then(check) as Promise<
      { id: string; is_active: boolean; person: { full_name_en: string; full_name_am: string | null } | null }[]
    >,
    db.from('organization_units').select('id, name_en, name_am').then(check) as Promise<{ id: string; name_en: string; name_am: string | null }[]>,
  ]);
  const userById = new Map(users.filter((u) => u.is_active).map((u) => [u.id, u]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const out = new Map<string, NonNullable<AdminRoleRow['holders']>>();
  for (const a of assignments) {
    const u = userById.get(a.system_user_id);
    if (!u) continue;
    const unit = unitById.get(a.organization_unit_id);
    const list = out.get(a.role_id) ?? [];
    list.push({
      user_id: u.id,
      name: u.person?.full_name_en ?? '—',
      name_am: u.person?.full_name_am || u.person?.full_name_en || '—',
      unit: unit?.name_en ?? '—',
      unit_am: unit?.name_am || unit?.name_en || '—',
    });
    out.set(a.role_id, list);
  }
  return out;
}

async function fetchRolesAndPermissions(db: SupabaseClient, modules?: string[]) {
  const [roles, links, perms] = await Promise.all([
    db.from('roles').select('*').order('name_en').then(check),
    db.from('role_permissions').select('role_id, permission_id').then(check),
    db.from('permissions').select('id, code, name_en, name_am, category, is_active').order('code').then(check),
  ]);

  // Not in the plan: the permission is kept on roles but does nothing until the module is added
  const permissions = ((perms ?? []) as AdminPermissionRow[]).map((p) => {
    const needs = PERMISSION_MODULE[p.code as PermissionCode];
    return modules && needs && !modules.includes(needs) ? { ...p, unavailable: true } : p;
  });
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
  Loaded<{ users: AdminUserRow[]; roles: AdminRoleRow[]; units: AdminUnitRow[]; permissions: AdminPermissionRow[] }>
> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('USER_MANAGE');
    const [users, assignments, { roles, permissions }, units] = await Promise.all([
      db.from('system_users')
        .select('id, person_id, username, is_active, last_login_at, created_at')
        .order('created_at', { ascending: false })
        .then(check),
      liveAssignments(db),
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
    const activeAssignments = assignments;

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
        assignments: mine.map((a) => {
          const r = roleById.get(a.role_id);
          const un = unitById.get(a.organization_unit_id);
          return {
            id: a.id,
            role_id: a.role_id,
            role: r?.name_en ?? '—',
            role_am: r?.name_am ?? r?.name_en ?? '—',
            unit_id: a.organization_unit_id,
            unit: un?.name_en ?? '—',
            unit_am: un?.name_am || un?.name_en || '—',
            expires_at: a.expires_at,
          };
        }),
      };
    });

    return { mode: 'live', data: { users: rows, roles, units: unitList, permissions } };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

const CreateUserSchema = z.object({
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number, e.g. 0912345678'),
  nameEn: z.string().trim().min(2, 'Enter the full name in English'),
  nameAm: z.string().trim(),
  gender: z.enum(['MALE', 'FEMALE']),
  roleId: z.string().min(1, 'Choose a role'),
  unitId: z.string().min(1, 'Choose a unit'),
});

/**
 * How a new or reset password reached the person. Nobody types a password for
 * someone else: it is made here, temporary, and changed at the next sign-in.
 *   telegram  sent to the person's own Telegram chat(s) — nobody else sees it
 *   shown     not on Telegram: shown once to the office, to give on paper
 *   existing  the phone already signs in (another Sunday school): their own password stays
 */
export type PasswordOutcome =
  | { ok: true; via: 'telegram'; delivered: number; login: string; reused?: boolean }
  | { ok: true; via: 'shown'; secret: string; login: string; pin: boolean; reused?: boolean }
  | { ok: true; via: 'existing'; login: string; reused?: boolean }
  | { ok: false; error: string };

/** A person already in the records with this phone and no login (not a parent-only or student-only record). */
async function recordForPhone(db: SupabaseClient, phone: string): Promise<string | null> {
  const tail = `%${phone.slice(1).split('').join('%')}`;
  const { data } = await db.from('persons').select('id, phone_primary, is_guardian_only').eq('status', 'ACTIVE').ilike('phone_primary', tail).limit(10);
  const same = ((data ?? []) as { id: string; phone_primary: string | null; is_guardian_only?: boolean | null }[])
    .filter((p) => normalizePhone(p.phone_primary ?? '') === phone && !p.is_guardian_only)
    .map((p) => p.id);
  if (same.length === 0) return null;
  const [{ data: accounts }, studentOnly] = await Promise.all([
    db.from('system_users').select('person_id').in('person_id', same),
    studentOnlyIds(db, same),
  ]);
  const taken = new Set(((accounts ?? []) as { person_id: string }[]).map((a) => a.person_id));
  return same.find((id) => !taken.has(id) && !studentOnly.has(id)) ?? null;
}

/** The temporary password to the person's own chats, or back to the office when they are not on Telegram. */
async function deliver(
  db: SupabaseClient,
  who: { systemUserId: string; personId: string; name: string; login: string; secret: string; pin: boolean },
  actorId: string,
  chats: Set<number>
): Promise<PasswordOutcome> {
  if (chats.size) {
    const delivered = await sendTemporary(chats, { name: who.name, login: who.login, secret: who.secret, pin: who.pin });
    if (delivered > 0) {
      await logReset(db, { systemUserId: who.systemUserId, actorId, via: 'office_telegram', delivered });
      return { ok: true, via: 'telegram', delivered, login: who.login };
    }
  }
  await logReset(db, { systemUserId: who.systemUserId, actorId, via: 'office' });
  return { ok: true, via: 'shown', secret: who.secret, login: who.login, pin: who.pin };
}

const ownChats = async (db: SupabaseClient, personId: string) => ((await telegramConfigured()) ? chatsOf(db, [personId], 'SELF') : new Set<number>());

/**
 * A new account. If the person is already in the records (same phone), the
 * login is given to that record — no second copy of them. The password is
 * made here and sent to their Telegram (or shown once to the office).
 */
export async function createUser(input: z.input<typeof CreateUserSchema>): Promise<PasswordOutcome> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    const data = CreateUserSchema.parse(input);
    await assertCanGrantRole(db, me.systemUser.id, data.roleId);
    const personId = await recordForPhone(db, data.phone);
    const secret = newTemporary(false);
    const made = await provisionSystemUser(db, {
      ...data,
      password: secret,
      personId: personId ?? undefined,
      email: phoneToAuthEmail(data.phone),
      assignedBy: me.systemUser.id,
      temporary: true,
      // The person may already sign in for another Sunday school: same login, their own password
      existingLogin: existingLoginForPhone,
    });
    const reused = Boolean(personId);
    if (made.linked) return { ok: true, via: 'existing', login: data.phone, reused };
    const { data: su } = await db.from('system_users').select('person_id').eq('id', made.id).single();
    const pid = (su as { person_id: string }).person_id;
    const out = await deliver(db, { systemUserId: made.id, personId: pid, name: data.nameAm || data.nameEn, login: data.phone, secret, pin: false }, me.systemUser.id, await ownChats(db, pid));
    return out.ok ? { ...out, reused } : out;
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
    await assertCanManageUser(db, me.systemUser.id, systemUserId);

    const authUserId = await authUserIdFor(db, systemUserId);
    await db.from('system_users').update({ is_active: active }).eq('id', systemUserId).then(check);
    // Ban the login too, so an existing session cannot be refreshed (unless another Sunday school uses it)
    await setLoginBanned(db, authUserId, !active);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * A new temporary password (or PIN for students and parents) for someone who
 * forgot theirs: to their own Telegram when connected (a student's parents
 * too), else shown once to the office. Only for accounts with no more rights
 * than the one doing it.
 */
export async function issueTemporaryPassword(systemUserId: string): Promise<PasswordOutcome> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    if (me.systemUser.id === systemUserId) throw new Error('Change your own password under My profile');
    await assertCanManageUser(db, me.systemUser.id, systemUserId);
    const user = (await db.from('system_users')
      .select('id, auth_user_id, person_id, username, person:persons!system_users_person_id_fkey(full_name_en, full_name_am)')
      .eq('id', systemUserId)
      .single()
      .then(check)) as unknown as { id: string; auth_user_id: string; person_id: string; username: string; person: { full_name_en: string; full_name_am: string | null } | null };
    const pin = pinOnly(user.username, [...(await loginPowers(user.auth_user_id)).codes]);
    const secret = newTemporary(pin);
    await setTemporaryPassword(user.auth_user_id, secret);
    const chats = (await telegramConfigured()) ? await chatsForLogin(db, user) : new Set<number>();
    return await deliver(
      db,
      { systemUserId: user.id, personId: user.person_id, name: user.person?.full_name_am || user.person?.full_name_en || user.username, login: user.username, secret, pin },
      me.systemUser.id,
      chats
    );
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
    await assertCanManageUser(db, me.systemUser.id, systemUserId);
    await assertCanGrantRole(db, me.systemUser.id, roleId);

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
    await tellNewRole(db, systemUserId, roleId, unitId, '');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Tells a person the role they were just given (their devices and Telegram); new menus show after a reload. */
async function tellNewRole(db: SupabaseClient, systemUserId: string, roleId: string, unitId: string, until: string) {
  const [{ data: role }, { data: unit }] = await Promise.all([
    db.from('roles').select('name_en, name_am').eq('id', roleId).maybeSingle(),
    db.from('organization_units').select('name_en, name_am').eq('id', unitId).maybeSingle(),
  ]);
  const r = role as { name_en: string; name_am: string | null } | null;
  const u = unit as { name_en: string; name_am: string | null } | null;
  notifyLater(
    { users: [systemUserId] },
    {
      title: '🔑 አዲስ ሚና · New role',
      body: `${r?.name_am || r?.name_en || ''} · ${r?.name_en ?? ''} — ${u?.name_am || u?.name_en || ''}${until ? ` (≤ ${until})` : ''}`,
      url: '/dashboard',
      tag: `role-${systemUserId}`,
    }
  );
}

const AssignSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1, 'Choose a role'),
  unitId: z.string().min(1, 'Choose a unit'),
  /** YYYY-MM-DD (the role ends at the end of that day) or '' for no end */
  until: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
});

/** Gives an account one more role in a unit (e.g. a teacher who also heads a department), optionally until a date. */
export async function addAssignment(input: z.input<typeof AssignSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    const a = AssignSchema.parse(input);
    if (me.systemUser.id === a.userId) throw new Error('You cannot change your own roles');
    if (a.until && a.until < new Date().toISOString().slice(0, 10)) throw new Error('The end date is in the past');
    await assertCanManageUser(db, me.systemUser.id, a.userId);
    await assertCanGrantRole(db, me.systemUser.id, a.roleId);
    // The same role in the same unit is kept once: an old (switched-off) one comes back
    await db.from('user_unit_assignments')
      .upsert(
        {
          system_user_id: a.userId,
          organization_unit_id: a.unitId,
          role_id: a.roleId,
          is_active: true,
          expires_at: a.until ? `${a.until}T23:59:59.999Z` : null,
          assigned_by: me.systemUser.id,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'system_user_id,organization_unit_id,role_id' }
      )
      .then(check);
    await tellNewRole(db, a.userId, a.roleId, a.unitId, a.until);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Takes one role away. The last one cannot be removed — switch the account off instead. */
export async function removeAssignment(assignmentId: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('USER_MANAGE');
    const row = (await db.from('user_unit_assignments').select('id, system_user_id, role_id').eq('id', assignmentId).maybeSingle().then(check)) as {
      id: string; system_user_id: string; role_id: string;
    } | null;
    if (!row) throw new Error('This role assignment was not found');
    if (row.system_user_id === me.systemUser.id) throw new Error('You cannot change your own roles');
    await assertCanManageUser(db, me.systemUser.id, row.system_user_id);
    await assertCanGrantRole(db, me.systemUser.id, row.role_id);
    const others = (await liveAssignments(db)).filter((a) => a.system_user_id === row.system_user_id && a.id !== row.id);
    if (others.length === 0) throw new Error('This is the account’s only role — give it another role first, or switch the account off');
    await db.from('user_unit_assignments').update({ is_active: false }).eq('id', row.id).then(check);
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
    const { me, db } = await authorize('ROLE_MANAGE');
    const [data, holders] = await Promise.all([fetchRolesAndPermissions(db, me.tenant.access.modules), roleHolders(db)]);
    return { mode: 'live', data: { ...data, roles: data.roles.map((r) => ({ ...r, holders: holders.get(r.id) ?? [] })) } };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

/** The permission catalogue and every role, for the roles × permissions overview. */
export async function loadPermissions(): Promise<Loaded<{ roles: AdminRoleRow[]; permissions: AdminPermissionRow[] }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('ROLE_MANAGE');
    const [data, holders] = await Promise.all([fetchRolesAndPermissions(db, me.tenant.access.modules), roleHolders(db)]);
    return { mode: 'live', data: { ...data, roles: data.roles.map((r) => ({ ...r, holders: holders.get(r.id) ?? [] })) } };
  } catch (e) {
    return { mode: 'error', error: message(e) };
  }
}

const UpdateRoleSchema = z.object({
  nameEn: z.string().trim().min(2, 'Enter the role name in English'),
  nameAm: z.string().trim(),
  descEn: z.string().trim(),
  descAm: z.string().trim(),
  isActive: z.boolean(),
});

/** Name, description and on/off of a custom role. A role someone holds cannot be switched off. */
export async function updateRole(roleId: string, input: z.input<typeof UpdateRoleSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ROLE_MANAGE');
    const data = UpdateRoleSchema.parse(input);
    const role = (await db.from('roles').select('id, is_system_role').eq('id', roleId).single().then(check)) as { id: string; is_system_role: boolean };
    if (role.is_system_role) throw new Error('System roles are locked and cannot be edited');
    const current = (await db.from('role_permissions').select('permission:permissions(code)').eq('role_id', roleId).then(check)) as unknown as { permission: { code: string } | null }[];
    await assertCanEditRole(db, me.systemUser.id, roleId, current.map((c) => c.permission?.code).filter(Boolean) as string[]);
    if (!data.isActive && (await liveAssignments(db)).some((a) => a.role_id === roleId)) {
      throw new Error('People still hold this role — move them to another role first');
    }
    await db.from('roles')
      .update({
        name_en: data.nameEn,
        name_am: data.nameAm || data.nameEn,
        description_en: data.descEn || null,
        description_am: data.descAm || null,
        is_active: data.isActive,
      })
      .eq('id', roleId)
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** A new custom role starting with another role's permissions (system roles too) — then adjust it. */
export async function copyRole(sourceId: string, input: z.input<typeof CreateRoleSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('ROLE_MANAGE');
    const data = CreateRoleSchema.parse(input);
    const links = (await db.from('role_permissions').select('permission_id, permission:permissions(code)').eq('role_id', sourceId).then(check)) as unknown as {
      permission_id: string; permission: { code: string } | null;
    }[];
    const { data: created, error } = await db.from('roles')
      .insert({
        code: data.code,
        name_en: data.nameEn,
        name_am: data.nameAm || data.nameEn,
        description_en: data.descEn || null,
        description_am: data.descAm || null,
        is_system_role: false,
        is_active: true,
      })
      .select('id')
      .single();
    if (error || !created) throw new Error(error?.code === '23505' ? `A role with code ${data.code} already exists` : error?.message ?? 'Could not create the role');
    try {
      await assertCanEditRole(db, me.systemUser.id, created.id, links.map((l) => l.permission?.code).filter(Boolean) as string[]);
      if (links.length) {
        await db.from('role_permissions').insert(links.map((l) => ({ role_id: created.id, permission_id: l.permission_id }))).then(check);
      }
    } catch (e) {
      await db.from('roles').delete().eq('id', created.id);
      throw e;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
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
    const { me, db } = await authorize('ROLE_MANAGE');
    const role = (await db.from('roles').select('id, is_system_role').eq('id', roleId).single().then(check)) as {
      id: string; is_system_role: boolean;
    };
    if (role.is_system_role) throw new Error('System roles are locked and cannot be edited');
    await assertCanEditRole(db, me.systemUser.id, roleId, codes);

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
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── Logins people make for themselves (lib/auth/self-login) ──────────────────

export async function loadSelfLogin(): Promise<boolean | null> {
  if (!isSupabaseEnabled()) return null;
  try {
    const { db } = await authorize('USER_MANAGE');
    return await selfLoginAllowed(db);
  } catch {
    return null;
  }
}

export async function setSelfLogin(enabled: boolean): Promise<ActionResult> {
  try {
    const { db } = await authorize('USER_MANAGE');
    await db.from('system_settings').upsert({ key: SELF_LOGIN_KEY, value: { enabled: Boolean(enabled) } }, { onConflict: 'key' }).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
