'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Members (persons) server actions. Students are persons too, but they are
// managed on the Students page and left out of the members registry.
// The fields follow the paper member registration form (lib/members/form.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { Person } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { MAX_PHOTO_BYTES, PHOTO_TYPES, SERVICE_DEPARTMENT_CODES } from '@/lib/members/form';

const MEMBER_COLUMNS =
  'id, membership_code, full_name_en, full_name_am, baptismal_name, gender, date_of_birth, phone_primary, phone_secondary, email, address, emergency_contact_name, emergency_contact_phone, father_of_confession, profile_photo_url, status, notes, created_at, updated_at, registration_term, registered_on, membership_type, father_name, mother_name, marital_status, education_level, profession, workplace, woreda, house_no, served_elsewhere, previous_school, previous_role, preferred_departments, preferred_department_other, emergency_contact_relation, declaration_signed, assigned_unit_id, registered_by_name, approved_by_name, approved_on';

const PHOTO_BUCKET = 'member-photos';

export type MemberUnit = { id: string; name_en: string; name_am: string };
export type MembersData = { members: Person[]; units: MemberUnit[] };

function missingMigration(message: string) {
  return /registration_term|membership_type|father_name|assigned_unit_id|[Bb]ucket not found/.test(message)
    ? 'Run database migration 021 (member registration form) first'
    : message;
}

export async function loadMembers(): Promise<Loaded<MembersData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('MEMBER_VIEW', 'AUDIT_VIEW_ALL');
    const [persons, students, units] = await Promise.all([
      selectAll<Person>((a, b) =>
        db.from('persons').select(MEMBER_COLUMNS).order('created_at', { ascending: false }).order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
      db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check) as Promise<MemberUnit[]>,
    ]);
    // Parents' records made only for their login are not members (migration 025; none before it)
    const { data: guardianOnly } = await db.from('persons').select('id').eq('is_guardian_only', true);
    const skip = new Set([...students.map((s) => s.person_id), ...((guardianOnly ?? []) as { id: string }[]).map((g) => g.id)]);
    return { mode: 'live', data: { members: persons.filter((p) => !skip.has(p.id)), units } };
  } catch (e) {
    return { mode: 'error', error: missingMigration(errorMessage(e)) };
  }
}

const optional = z.string().trim().transform((v) => v || null);
const optionalDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), message)
    .transform((v) => v || null);

const MemberSchema = z.object({
  // Header of the form
  registration_term: optional,
  registered_on: optionalDate('Use a valid registration date'),
  membership_type: z.enum(['REGULAR', 'SPECIAL', 'HONORARY']),
  // ፩ Personal & family
  full_name_am: optional,
  full_name_en: optional,
  father_name: optional,
  mother_name: optional,
  baptismal_name: optional,
  gender: z.enum(['MALE', 'FEMALE']),
  date_of_birth: optionalDate('Use a valid date of birth'),
  marital_status: z.union([z.literal(''), z.enum(['MARRIED', 'SINGLE'])]).transform((v) => v || null),
  education_level: optional,
  profession: optional,
  workplace: optional,
  phone_primary: optional,
  phone_secondary: optional,
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid e-mail address')
    .transform((v) => v || null),
  address: optional,
  woreda: optional,
  house_no: optional,
  // ፪ Spiritual & service
  father_of_confession: optional,
  served_elsewhere: z.boolean().nullable(),
  previous_school: optional,
  previous_role: optional,
  preferred_departments: z.array(z.enum(SERVICE_DEPARTMENT_CODES as [string, ...string[]])),
  preferred_department_other: optional,
  // ፫ Emergency contact
  emergency_contact_name: optional,
  emergency_contact_relation: optional,
  emergency_contact_phone: optional,
  // ፬ Declaration
  declaration_signed: z.boolean(),
  // ፭ Office use only
  assigned_unit_id: z.string().transform((v) => v || null),
  registered_by_name: optional,
  approved_by_name: optional,
  approved_on: optionalDate('Use a valid approval date'),
  notes: optional,
}).refine((m) => (m.full_name_am ?? m.full_name_en ?? '').length >= 2, {
  message: "Enter the full name (with grandfather's name)",
  path: ['full_name_am'],
});

const StatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRANSFERRED', 'DECEASED']);

export type MemberInput = z.input<typeof MemberSchema>;

/**
 * Validated form → persons row. The paper form only has the Amharic full name;
 * the English name falls back to it because that column is required.
 */
function toRow(input: MemberInput) {
  const m = MemberSchema.parse(input);
  return {
    ...m,
    full_name_en: (m.full_name_en ?? m.full_name_am) as string,
    previous_school: m.served_elsewhere ? m.previous_school : null,
    previous_role: m.served_elsewhere ? m.previous_role : null,
  };
}

/** Next MBR-YYYY-NNNN code for this year. */
async function nextMembershipCode(db: Awaited<ReturnType<typeof authorize>>['db']): Promise<string> {
  const prefix = `MBR-${new Date().getFullYear()}-`;
  const last = (await db.from('persons')
    .select('membership_code')
    .like('membership_code', `${prefix}%`)
    .order('membership_code', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(check)) as { membership_code: string } | null;
  const n = last ? Number(last.membership_code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

export async function createMember(
  input: MemberInput
): Promise<{ ok: true; code: string; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('MEMBER_CREATE');
    const row = toRow(input);
    // The secretary who registers is the signed-in user unless another name is written
    row.registered_by_name ??= me.person.full_name_am || me.person.full_name_en;
    row.registered_on ??= new Date().toISOString().slice(0, 10);
    // Two people registering at the same moment can collide on the code — retry once.
    for (let attempt = 0; ; attempt++) {
      const code = await nextMembershipCode(db);
      const { data, error } = await db.from('persons')
        .insert({ ...row, membership_code: code, status: 'ACTIVE' })
        .select('id')
        .single();
      if (!error) return { ok: true, code, id: (data as { id: string }).id };
      if (error.code !== '23505' || attempt > 0) throw new Error(missingMigration(error.message));
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateMember(
  personId: string,
  input: MemberInput & { status: z.input<typeof StatusSchema> }
): Promise<ActionResult> {
  try {
    const { db } = await authorize('MEMBER_UPDATE');
    const row = toRow(input);
    const status = StatusSchema.parse(input.status);
    const { error } = await db.from('persons').update({ ...row, status, updated_at: new Date().toISOString() }).eq('id', personId);
    if (error) throw new Error(missingMigration(error.message));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** The "ፎቶግራፍ" box: store the member's photo in the private bucket and point profile_photo_url at it. */
export async function uploadMemberPhoto(form: FormData): Promise<ActionResult> {
  try {
    const { db } = await authorize('MEMBER_CREATE', 'MEMBER_UPDATE');
    const personId = String(form.get('person_id') ?? '');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a photo');
    const ext = PHOTO_TYPES[file.type];
    if (!ext) throw new Error('The photo must be a JPG, PNG or WebP image');
    if (file.size > MAX_PHOTO_BYTES) throw new Error(`The photo is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB`);

    const person = (await db.from('persons').select('id, profile_photo_url').eq('id', personId).single().then(check)) as {
      id: string; profile_photo_url: string | null;
    };
    const path = `${person.id}/${crypto.randomUUID()}${ext}`;
    const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(missingMigration(uploadError.message));
    const { error } = await db.from('persons').update({ profile_photo_url: path, updated_at: new Date().toISOString() }).eq('id', person.id);
    if (error) {
      await db.storage.from(PHOTO_BUCKET).remove([path]);
      throw new Error(error.message);
    }
    // Replace, don't pile up: remove the previous photo kept in the bucket
    if (person.profile_photo_url && !/^https?:/.test(person.profile_photo_url)) {
      await db.storage.from(PHOTO_BUCKET).remove([person.profile_photo_url]);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
