'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Parent logins (migration 025): phone number + 6-digit PIN. A family is the
// students of this year who share a guardian phone (the emergency contact on
// the student's record). Creating the login links the parent to those
// children (student_guardians). A staff member who is also a parent keeps
// their account; it gets the PARENT role added.
//   STUDENT_CREATE or USER_MANAGE
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { newPin } from '@/lib/auth/student-login';
import { studentOnlyIds } from '@/lib/members/membership';

type Row = Record<string, unknown>;

export interface FamilyChild {
  student_id: string;
  name_en: string;
  name_am: string;
  class_id: string;
  linked: boolean;
}

export interface FamilyRow {
  phone: string;
  guardian_name: string;
  children: FamilyChild[];
  /** NONE: no account with this phone; PARENT: parent login; STAFF: an account without the parent role yet */
  account: 'NONE' | 'PARENT' | 'STAFF';
  /** The account has only the parent role (its PIN can be reset here) */
  parent_only: boolean;
  active: boolean;
  last_login: string | null;
}

export interface ParentSlip {
  name: string;
  phone: string;
  /** null: an existing account — they keep their password */
  pin: string | null;
  children: string[];
}

const MIGRATION_025 = 'Run database migration 025 (parent portal) first';

async function currentYear(db: SupabaseClient): Promise<string | null> {
  const y = (await db.from('academic_years').select('id').order('is_current', { ascending: false }).order('start_date', { ascending: false }).limit(1).maybeSingle().then(check)) as {
    id: string;
  } | null;
  return y?.id ?? null;
}

/** This year's students with their guardian phone, grouped by that phone. */
async function families(db: SupabaseClient) {
  const year = await currentYear(db);
  if (!year) return new Map<string, { name: string; children: Omit<FamilyChild, 'linked'>[] }>();
  const [enrollments, students] = await Promise.all([
    selectAll<Row>((a, b) => db.from('enrollments').select('student_id, class_id').eq('academic_year_id', year).eq('status', 'ACTIVE').order('student_id').range(a, b)),
    selectAll<Row>((a, b) =>
      db.from('students')
        .select('id, person:persons!students_person_id_fkey(full_name_en, full_name_am, emergency_contact_name, emergency_contact_phone)')
        .eq('status', 'ACTIVE')
        .order('id')
        .range(a, b)
    ),
  ]);
  const classOf = new Map(enrollments.map((e) => [e.student_id as string, e.class_id as string]));
  const out = new Map<string, { name: string; children: Omit<FamilyChild, 'linked'>[] }>();
  for (const s of students) {
    if (!classOf.has(s.id as string)) continue;
    const p = (s.person ?? {}) as Record<string, string | null>;
    const phone = normalizePhone(p.emergency_contact_phone ?? '');
    if (!isValidPhone(phone)) continue;
    const family = out.get(phone) ?? { name: p.emergency_contact_name ?? '', children: [] };
    if (!family.name && p.emergency_contact_name) family.name = p.emergency_contact_name;
    family.children.push({ student_id: s.id as string, name_en: p.full_name_en ?? '', name_am: p.full_name_am || p.full_name_en || '', class_id: classOf.get(s.id as string)! });
    out.set(phone, family);
  }
  return out;
}

async function roleIds(db: SupabaseClient) {
  const { data } = await db.from('roles').select('id, code').in('code', ['PARENT']);
  const parent = ((data ?? []) as { id: string; code: string }[]).find((r) => r.code === 'PARENT');
  if (!parent) throw new Error(MIGRATION_025);
  return { parent: parent.id };
}

export async function loadFamilies(): Promise<Loaded<{ families: FamilyRow[]; classes: { id: string; name_en: string; name_am: string }[] }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const year = await currentYear(db);
    const fams = await families(db);
    const phones = [...fams.keys()];
    const { parent } = await roleIds(db);
    const [users, classes] = await Promise.all([
      phones.length
        ? (db.from('system_users').select('id, person_id, username, is_active, last_login_at').in('username', phones).then(check) as Promise<Row[]>)
        : Promise.resolve([] as Row[]),
      year ? (db.from('classes').select('id, name_en, name_am').eq('academic_year_id', year).order('grade_level').order('name_en').then(check) as Promise<Row[]>) : Promise.resolve([] as Row[]),
    ]);
    const userIds = users.map((u) => u.id as string);
    const personIds = users.map((u) => u.person_id as string);
    const [assignments, links] = await Promise.all([
      userIds.length ? (db.from('user_unit_assignments').select('system_user_id, role_id').eq('is_active', true).in('system_user_id', userIds).then(check) as Promise<Row[]>) : Promise.resolve([] as Row[]),
      personIds.length ? (db.from('student_guardians').select('student_id, guardian_person_id').in('guardian_person_id', personIds).then(check) as Promise<Row[]>) : Promise.resolve([] as Row[]),
    ]);
    const rows: FamilyRow[] = [...fams.entries()].map(([phone, f]) => {
      const user = users.find((u) => u.username === phone);
      const roles = assignments.filter((a) => a.system_user_id === user?.id).map((a) => a.role_id as string);
      const linked = new Set(links.filter((l) => l.guardian_person_id === user?.person_id).map((l) => l.student_id as string));
      return {
        phone,
        guardian_name: f.name,
        children: f.children.map((c) => ({ ...c, linked: linked.has(c.student_id) })),
        account: !user ? 'NONE' : roles.includes(parent) ? 'PARENT' : 'STAFF',
        parent_only: Boolean(user) && roles.length > 0 && roles.every((r) => r === parent),
        active: Boolean(user?.is_active),
        last_login: (user?.last_login_at as string) ?? null,
      };
    });
    rows.sort((a, b) => a.guardian_name.localeCompare(b.guardian_name));
    return {
      mode: 'live',
      data: { families: rows, classes: classes.map((c) => ({ id: c.id as string, name_en: c.name_en as string, name_am: (c.name_am as string) || (c.name_en as string) })) },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const ParentSchema = z.object({
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Not a valid phone number'),
  name: z.string().trim().min(2, 'Enter the parent’s name'),
  relationship: z.enum(['Mother', 'Father', 'Guardian']),
  gender: z.enum(['MALE', 'FEMALE']),
});

/** Link the family's children to the parent's person (missing links only; first guardian becomes the primary one). */
async function linkChildren(db: SupabaseClient, personId: string, studentIds: string[], relationship: string) {
  if (studentIds.length === 0) return;
  const [{ data: mine }, { data: primaries }] = await Promise.all([
    db.from('student_guardians').select('student_id').eq('guardian_person_id', personId).in('student_id', studentIds),
    db.from('student_guardians').select('student_id').eq('is_primary', true).in('student_id', studentIds),
  ]);
  const have = new Set(((mine ?? []) as { student_id: string }[]).map((r) => r.student_id));
  const withPrimary = new Set(((primaries ?? []) as { student_id: string }[]).map((r) => r.student_id));
  const rows = studentIds.filter((id) => !have.has(id)).map((id) => ({ student_id: id, guardian_person_id: personId, relationship, is_primary: !withPrimary.has(id) }));
  if (rows.length) await db.from('student_guardians').insert(rows).then(check);
}

/** Create the parent's login (or add the parent role to their existing account) and link their children. */
export async function createParentLogin(input: z.input<typeof ParentSchema>): Promise<{ ok: true; slip: ParentSlip } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const p = ParentSchema.parse(input);
    const family = (await families(db)).get(p.phone);
    if (!family) throw new Error('No student of this year has this guardian phone');
    const { parent: parentRole } = await roleIds(db);
    const { data: unit } = await db.from('organization_units').select('id').in('code', ['DEPT_EDUCATION', 'COORD_EDUCATION']).order('sort_order').limit(1).maybeSingle();
    if (!unit) throw new Error('No education department found under Organization');

    const existing = (await db.from('system_users').select('id, person_id').eq('username', p.phone).maybeSingle().then(check)) as { id: string; person_id: string } | null;
    let personId: string;
    let pin: string | null = null;
    if (existing) {
      // Already has an account (e.g. staff): keep it, add the parent role
      personId = existing.person_id;
      const { data: has } = await db.from('user_unit_assignments').select('id').eq('system_user_id', existing.id).eq('role_id', parentRole).maybeSingle();
      if (!has) {
        await db.from('user_unit_assignments')
          .insert({ system_user_id: existing.id, organization_unit_id: unit.id, role_id: parentRole, is_active: true, assigned_by: me.systemUser.id })
          .then(check);
      }
    } else {
      // A person for the parent: reuse one with this phone (not a child's student record — a member who also studies is fine), or make one
      const { data: sameAll } = await db.from('persons').select('id').eq('phone_primary', p.phone);
      const sameIds = ((sameAll ?? []) as { id: string }[]).map((x) => x.id);
      const studentOnly = await studentOnlyIds(db, sameIds);
      const same = sameIds.map((id) => ({ id })).find((x) => !studentOnly.has(x.id));
      personId = same?.id ?? (await insertParentPerson(db, p));

      pin = newPin();
      const { data: created, error: authError } = await db.auth.admin.createUser({
        email: phoneToAuthEmail(p.phone),
        password: pin,
        email_confirm: true,
        user_metadata: { phone: p.phone, full_name: p.name, parent: true },
      });
      if (authError || !created.user) throw new Error(authError?.message ?? 'Could not create the login');
      let systemUserId: string | null = null;
      try {
        const su = (await db.from('system_users')
          .insert({ auth_user_id: created.user.id, person_id: personId, username: p.phone, is_active: true })
          .select('id')
          .single()
          .then(check)) as { id: string };
        systemUserId = su.id;
        await db.from('user_unit_assignments')
          .insert({ system_user_id: su.id, organization_unit_id: unit.id, role_id: parentRole, is_active: true, assigned_by: me.systemUser.id })
          .then(check);
      } catch (e) {
        if (systemUserId) await db.from('system_users').delete().eq('id', systemUserId);
        await db.auth.admin.deleteUser(created.user.id);
        throw e;
      }
    }
    await linkChildren(db, personId, family.children.map((c) => c.student_id), p.relationship);
    return {
      ok: true,
      slip: { name: p.name, phone: p.phone, pin, children: family.children.map((c) => c.name_am || c.name_en) },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

async function insertParentPerson(db: SupabaseClient, p: z.output<typeof ParentSchema>): Promise<string> {
  const row = { full_name_en: p.name, full_name_am: p.name, gender: p.gender, phone_primary: p.phone, status: 'ACTIVE', notes: 'Parent / guardian', is_guardian_only: true };
  let { data, error } = await db.from('persons').insert(row).select('id').single();
  // membership_code may have no database default — fall back to one derived from the phone
  if (error?.code === '23502' && error.message.includes('membership_code')) {
    ({ data, error } = await db.from('persons').insert({ ...row, membership_code: `PAR-${p.phone}` }).select('id').single());
  }
  if (error || !data) throw new Error(error?.message ?? 'Could not create the parent’s record');
  return data.id as string;
}

/** Link children who joined after the login was made (a new sibling with the same guardian phone). */
export async function relinkFamily(phone: string): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const key = normalizePhone(phone);
    const family = (await families(db)).get(key);
    const user = (await db.from('system_users').select('person_id').eq('username', key).maybeSingle().then(check)) as { person_id: string } | null;
    if (!family || !user) throw new Error('This family has no parent login yet');
    const { data: rel } = await db.from('student_guardians').select('relationship').eq('guardian_person_id', user.person_id).limit(1).maybeSingle();
    await linkChildren(db, user.person_id, family.children.map((c) => c.student_id), (rel as { relationship: string } | null)?.relationship ?? 'Guardian');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Parent-only accounts: a new PIN, or turn the login off / on. Staff accounts are managed under Administration → Users. */
async function parentOnlyAccount(db: SupabaseClient, phone: string) {
  const { parent } = await roleIds(db);
  const user = (await db.from('system_users').select('id, auth_user_id').eq('username', normalizePhone(phone)).maybeSingle().then(check)) as {
    id: string; auth_user_id: string;
  } | null;
  if (!user) throw new Error('This family has no parent login yet');
  const roles = ((await db.from('user_unit_assignments').select('role_id').eq('system_user_id', user.id).eq('is_active', true).then(check)) as { role_id: string }[]).map((r) => r.role_id);
  if (!roles.every((r) => r === parent)) throw new Error('This parent also has a staff account — manage it under Administration → Users');
  return user;
}

export async function resetParentPin(phone: string): Promise<{ ok: true; pin: string } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const user = await parentOnlyAccount(db, phone);
    const pin = newPin();
    const { error } = await db.auth.admin.updateUserById(user.auth_user_id, { password: pin });
    if (error) throw new Error(error.message);
    return { ok: true, pin };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setParentLoginActive(phone: string, active: boolean): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const user = await parentOnlyAccount(db, phone);
    await db.from('system_users').update({ is_active: active }).eq('id', user.id).then(check);
    const { error } = await db.auth.admin.updateUserById(user.auth_user_id, { ban_duration: active ? 'none' : '876000h' });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
