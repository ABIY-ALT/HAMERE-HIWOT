// ─────────────────────────────────────────────────────────────────────────────
// A website login people make for themselves (server only). Someone already
// in the Sunday school's records — a member, teacher or servant with their own
// phone on their record — who has no login yet can get one without the office:
// from the Telegram bot (🔑 → "Create my login") or from the sign-in page
// ("First time?"), which sends it to their own Telegram chat. There is no SMS,
// so their Telegram chat (linked by their own phone) is the proof it is them.
// The login gets the plain Member role (their own pages only: tasks, roster,
// check-in, profile) in the General Assembly, and a temporary password they
// change at the first sign-in (lib/auth/temp-password). Students sign in with
// their student number and parents with the parent login — not made here.
// The office can switch this off: system_settings "self_login".
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { TEMP_FLAG, newTemporary } from '@/lib/auth/temp-password';
import { existingLoginForPhone } from '@/lib/tenant/accounts';
import { studentOnlyIds } from '@/lib/members/membership';

export const SELF_LOGIN_KEY = 'self_login';
const MEMBER_ROLE = 'MEMBER';
/** Where a self-made login's role is held (the first one that exists) */
const MEMBER_UNITS = ['GENERAL_ASSEMBLY', 'COORD_MEMBERS'];

/** On unless the office switched it off */
export async function selfLoginAllowed(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from('system_settings').select('value').eq('key', SELF_LOGIN_KEY).maybeSingle();
  return (data?.value as { enabled?: boolean } | undefined)?.enabled !== false;
}

export interface OwnLoginCandidate {
  person_id: string;
  name: string;
  phone: string;
}

/** Of these people, those who may make their own login now. */
export async function ownLoginCandidates(db: SupabaseClient, personIds: string[]): Promise<OwnLoginCandidate[]> {
  if (personIds.length === 0) return [];
  const [{ data: people }, { data: accounts }, studentOnly] = await Promise.all([
    db.from('persons').select('id, full_name_en, full_name_am, phone_primary, status, is_guardian_only').in('id', personIds),
    db.from('system_users').select('person_id').in('person_id', personIds),
    studentOnlyIds(db, personIds),
  ]);
  const hasLogin = new Set(((accounts ?? []) as { person_id: string }[]).map((a) => a.person_id));
  return ((people ?? []) as { id: string; full_name_en: string; full_name_am: string | null; phone_primary: string | null; status: string; is_guardian_only?: boolean | null }[])
    .filter((p) => p.status === 'ACTIVE' && !p.is_guardian_only && !studentOnly.has(p.id) && !hasLogin.has(p.id))
    .map((p) => ({ person_id: p.id, name: p.full_name_am || p.full_name_en, phone: normalizePhone(p.phone_primary ?? '') }))
    .filter((p) => isValidPhone(p.phone));
}

async function memberRole(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('roles').select('id').eq('code', MEMBER_ROLE).maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: made, error } = await db.from('roles')
    .insert({
      code: MEMBER_ROLE,
      name_en: 'Member',
      name_am: 'አባል',
      description_en: 'Own pages only (tasks, roster, check-in, profile) — given to logins people make for themselves',
      description_am: 'የራስ ገጾች ብቻ (ተግባር፣ ምደባ፣ መገኘት፣ መገለጫ) — ሰዎች ለራሳቸው ለሚሠሩት መግቢያ',
      is_system_role: false,
      is_active: true,
    })
    .select('id')
    .single();
  if (error || !made) throw new Error(error?.message ?? 'Could not prepare the Member role');
  return (made as { id: string }).id;
}

async function memberUnit(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('organization_units').select('id, code').in('code', MEMBER_UNITS).eq('is_active', true);
  const rows = (data ?? []) as { id: string; code: string }[];
  const found = MEMBER_UNITS.map((c) => rows.find((r) => r.code === c)).find(Boolean);
  if (found) return found.id;
  const { data: first } = await db.from('organization_units').select('id').eq('is_active', true).order('sort_order').limit(1).maybeSingle();
  if (!first) throw new Error('No organization unit to hold the Member role');
  return (first as { id: string }).id;
}

export type OwnLoginResult =
  | { status: 'created'; systemUserId: string; username: string; secret: string; name: string }
  /** The phone already signs in for another Sunday school: same login and password */
  | { status: 'linked'; systemUserId: string; username: string; name: string }
  | { status: 'not_allowed' };

/** Makes the person's own login (checked again here). */
export async function createOwnLogin(db: SupabaseClient, personId: string): Promise<OwnLoginResult> {
  if (!(await selfLoginAllowed(db))) return { status: 'not_allowed' };
  const [who] = await ownLoginCandidates(db, [personId]);
  if (!who) return { status: 'not_allowed' };
  const { data: taken } = await db.from('system_users').select('id').eq('username', who.phone).maybeSingle();
  if (taken) return { status: 'not_allowed' };

  const [roleId, unitId] = await Promise.all([memberRole(db), memberUnit(db)]);
  const shared = await existingLoginForPhone(who.phone);
  let authUserId = shared;
  let secret = '';
  if (!authUserId) {
    secret = newTemporary(false);
    const { data: created, error } = await db.auth.admin.createUser({
      email: phoneToAuthEmail(who.phone),
      password: secret,
      email_confirm: true,
      user_metadata: { phone: who.phone, full_name: who.name, self_made: true },
      app_metadata: { [TEMP_FLAG]: true },
    });
    if (error || !created.user) throw new Error(error?.message ?? 'Could not create the login');
    authUserId = created.user.id;
  }
  let systemUserId: string | null = null;
  try {
    const { data: su, error } = await db.from('system_users')
      .insert({ auth_user_id: authUserId, person_id: who.person_id, username: who.phone, is_active: true })
      .select('id')
      .single();
    if (error || !su) throw new Error(error?.message ?? 'Could not create the account');
    systemUserId = (su as { id: string }).id;
    const { error: assignError } = await db.from('user_unit_assignments')
      .insert({ system_user_id: systemUserId, organization_unit_id: unitId, role_id: roleId, is_active: true });
    if (assignError) throw new Error(assignError.message);
  } catch (e) {
    if (systemUserId) await db.from('system_users').delete().eq('id', systemUserId);
    if (!shared) await db.auth.admin.deleteUser(authUserId);
    throw e;
  }
  return shared
    ? { status: 'linked', systemUserId, username: who.phone, name: who.name }
    : { status: 'created', systemUserId, username: who.phone, secret, name: who.name };
}
