// ─────────────────────────────────────────────────────────────────────────────
// Create a system user account (server only, service-role client)
//
// One account = Supabase auth user + persons row + system_users row + role
// assignment. If a later step fails, the earlier ones are rolled back.
// No runtime imports: scripts/create-admin.mjs loads this file directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProvisionInput {
  phone: string; // normalised, also used as the username
  email: string; // internal auth e-mail alias (see lib/auth/phone.ts)
  password: string;
  nameEn: string;
  nameAm: string;
  gender: 'MALE' | 'FEMALE';
  roleId: string;
  unitId: string;
  assignedBy: string | null;
}

/** Returns the new system_users id. Throws with a readable message on failure. */
export async function provisionSystemUser(
  db: SupabaseClient,
  input: ProvisionInput
): Promise<string> {
  const { data: existing, error: existingError } = await db
    .from('system_users')
    .select('id')
    .eq('username', input.phone)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) throw new Error('A user with this phone number already exists');

  const { data: created, error: authError } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { phone: input.phone, full_name: input.nameEn },
  });
  if (authError || !created.user) {
    throw new Error(authError?.message ?? 'Could not create the login');
  }
  const authUserId = created.user.id;

  let personId: string | null = null;
  let systemUserId: string | null = null;
  try {
    personId = await insertPerson(db, input);

    const { data: systemUser, error: suError } = await db
      .from('system_users')
      .insert({ auth_user_id: authUserId, person_id: personId, username: input.phone, is_active: true })
      .select('id')
      .single();
    if (suError) throw new Error(suError.message);
    systemUserId = systemUser.id as string;

    const { error: assignError } = await db.from('user_unit_assignments').insert({
      system_user_id: systemUserId,
      organization_unit_id: input.unitId,
      role_id: input.roleId,
      is_active: true,
      assigned_by: input.assignedBy,
    });
    if (assignError) throw new Error(assignError.message);

    return systemUserId;
  } catch (e) {
    if (systemUserId) await db.from('system_users').delete().eq('id', systemUserId);
    if (personId) await db.from('persons').delete().eq('id', personId);
    await db.auth.admin.deleteUser(authUserId);
    throw e;
  }
}

async function insertPerson(db: SupabaseClient, input: ProvisionInput): Promise<string> {
  const row = {
    full_name_en: input.nameEn,
    full_name_am: input.nameAm || null,
    gender: input.gender,
    phone_primary: input.phone,
    status: 'ACTIVE',
  };

  let { data, error } = await db.from('persons').insert(row).select('id').single();
  // membership_code may have no database default — fall back to one derived from the phone.
  if (error?.code === '23502' && error.message.includes('membership_code')) {
    ({ data, error } = await db
      .from('persons')
      .insert({ ...row, membership_code: `USR-${input.phone}` })
      .select('id')
      .single());
  }
  if (error || !data) throw new Error(error?.message ?? 'Could not create the person record');
  return data.id as string;
}
