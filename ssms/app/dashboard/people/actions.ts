'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Members (persons) server actions. Students are persons too, managed on the
// Students page; a student is in the members registry only when they are also
// a member (registered with this form — lib/members/membership). One person
// can be both: "Already a student?" on the form, or "Enroll in a class" here.
// The fields follow the paper member registration form (lib/members/form.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server';
import { z } from 'zod';
import type { Person } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import { tenantPath } from '@/lib/tenant/db';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { MAX_PHOTO_BYTES, PHOTO_TYPES, SERVICE_DEPARTMENT_CODES } from '@/lib/members/form';
import { nonMemberIds } from '@/lib/members/membership';
import { syncChatsForPhones } from '@/lib/telegram/links';

const MEMBER_COLUMNS =
  'id, membership_code, full_name_en, full_name_am, baptismal_name, gender, date_of_birth, phone_primary, phone_secondary, email, address, emergency_contact_name, emergency_contact_phone, father_of_confession, profile_photo_url, status, notes, created_at, updated_at, registration_term, registered_on, membership_type, father_name, mother_name, marital_status, education_level, profession, workplace, woreda, house_no, served_elsewhere, previous_school, previous_role, preferred_departments, preferred_department_other, emergency_contact_relation, declaration_signed, assigned_unit_id, registered_by_name, approved_by_name, approved_on';

/** Baptism and confession father's phone (migration 045) — read only when the columns exist */
const SPIRITUAL_COLUMNS = ', baptism_date, baptism_church, confession_father_phone';
const spiritualMissing = (m: string) => /baptism_date|baptism_church|confession_father_phone/.test(m);
const SPIRITUAL_MIGRATION = 'Run database migration 045 (spiritual life, certificates, inbox) first to save baptism details';

const PHOTO_BUCKET = 'member-photos';

export type MemberUnit = { id: string; name_en: string; name_am: string };
/** A member's own student record, when they also attend classes */
export type MemberStudent = { reg_no: string; status: string; class_en: string; class_am: string };
export type MemberClass = { id: string; name_en: string; name_am: string };
export type StudentPerson = Person & { reg_no: string };
export type MembersData = {
  members: Person[];
  units: MemberUnit[];
  /** person id → student record, for members who are also students */
  student_of: Record<string, MemberStudent>;
  /** This year's classes, for "Enroll in a class" */
  classes: MemberClass[];
  /** Students who are not members yet, for "Already a student?" on the form (only for MEMBER_CREATE) */
  students_only: StudentPerson[];
};

function missingMigration(message: string) {
  if (spiritualMissing(message)) return SPIRITUAL_MIGRATION;
  return /registration_term|membership_type|father_name|assigned_unit_id|[Bb]ucket not found/.test(message)
    ? 'Run database migration 021 (member registration form) first'
    : message;
}

export async function loadMembers(): Promise<Loaded<MembersData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('MEMBER_VIEW', 'AUDIT_VIEW_ALL');
    const [persons, students, units, notMembers, year] = await Promise.all([
      selectAll<Person>(
        (a, b) =>
          db.from('persons').select(`${MEMBER_COLUMNS}${SPIRITUAL_COLUMNS}`).order('created_at', { ascending: false }).order('id').range(a, b) as unknown as PromiseLike<{
            data: Person[] | null;
            error: { message: string } | null;
          }>
      ).catch((err: Error) =>
        spiritualMissing(err.message)
          ? selectAll<Person>((a, b) => db.from('persons').select(MEMBER_COLUMNS).order('created_at', { ascending: false }).order('id').range(a, b))
          : Promise.reject(err)
      ),
      selectAll<{ id: string; person_id: string; reg_no: string; status: string }>((a, b) =>
        db.from('students').select('id, person_id, reg_no, status').order('id').range(a, b)
      ),
      db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check) as Promise<MemberUnit[]>,
      // Student-only records and parents' login records (lib/members/membership)
      nonMemberIds(db),
      db.from('academic_years')
        .select('id')
        .order('is_current', { ascending: false })
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(check) as Promise<{ id: string } | null>,
    ]);
    const members = persons.filter((p) => !notMembers.has(p.id));
    const isMember = new Set(members.map((p) => p.id));
    const memberStudents = students.filter((s) => isMember.has(s.person_id));

    // Members who are also students: their registration number and this year's class
    type Enrolled = { student_id: string; class_id: string };
    const [classes, enrolled]: [MemberClass[], Enrolled[]] = year
      ? await Promise.all([
          db.from('classes').select('id, name_en, name_am').eq('academic_year_id', year.id).order('grade_level').order('name_en').then(check) as Promise<MemberClass[]>,
          memberStudents.length
            ? (db.from('enrollments')
                .select('student_id, class_id')
                .eq('academic_year_id', year.id)
                .in('student_id', memberStudents.map((s) => s.id))
                .then(check) as Promise<Enrolled[]>)
            : Promise.resolve([]),
        ])
      : [[], []];
    const classById = new Map(classes.map((c) => [c.id, c]));
    const classOf = new Map(enrolled.map((e) => [e.student_id, classById.get(e.class_id)]));
    const student_of: Record<string, MemberStudent> = {};
    for (const s of memberStudents) {
      const c = classOf.get(s.id);
      student_of[s.person_id] = { reg_no: s.reg_no, status: s.status, class_en: c?.name_en ?? '', class_am: c?.name_am || c?.name_en || '' };
    }

    const regNo = new Map(students.map((s) => [s.person_id, s.reg_no]));
    const students_only = me.permissions.includes('MEMBER_CREATE')
      ? persons.filter((p) => !isMember.has(p.id) && regNo.has(p.id) && p.status === 'ACTIVE').map((p) => ({ ...p, reg_no: regNo.get(p.id)! }))
      : [];
    return { mode: 'live', data: { members, units, student_of, classes, students_only } };
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
  confession_father_phone: optional,
  baptism_date: optionalDate('Use a valid baptism date'),
  baptism_church: optional,
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
function toRow(input: MemberInput, allFields = false) {
  const parsed = MemberSchema.parse(input);
  // Baptism details only when given, so a new record saves before migration 045 too
  const { baptism_date, baptism_church, confession_father_phone, ...m } = parsed;
  const spiritual = allFields || baptism_date || baptism_church || confession_father_phone ? { baptism_date, baptism_church, confession_father_phone } : {};
  return {
    ...spiritual,
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

/**
 * Register a member. `studentPersonId`: someone already registered as a
 * student — their own record becomes a member too (a member ID and the form's
 * fields), so results, attendance and logins stay with the same person.
 */
export async function createMember(
  input: MemberInput,
  studentPersonId?: string
): Promise<{ ok: true; code: string; id: string } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('MEMBER_CREATE');
    const row = toRow(input);
    // The secretary who registers is the signed-in user unless another name is written
    row.registered_by_name ??= me.person.full_name_am || me.person.full_name_en;
    row.registered_on ??= new Date().toISOString().slice(0, 10);
    if (studentPersonId) {
      const id = z.string().min(1).parse(studentPersonId);
      const { data: student } = await db.from('students').select('id').eq('person_id', id).maybeSingle();
      if (!student) throw new Error('That student was not found — reload the page');
      if (!(await nonMemberIds(db, [id])).has(id)) throw new Error('This student is already a member');
      for (let attempt = 0; ; attempt++) {
        const code = await nextMembershipCode(db);
        const { error } = await db.from('persons')
          .update({ ...row, membership_code: code, status: 'ACTIVE', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (!error) {
          after(() => syncChatsForPhones(db, [row.phone_primary]));
          return { ok: true, code, id };
        }
        if (error.code !== '23505' || attempt > 0) throw new Error(missingMigration(error.message));
      }
    }
    // Two people registering at the same moment can collide on the code — retry once.
    for (let attempt = 0; ; attempt++) {
      const code = await nextMembershipCode(db);
      const { data, error } = await db.from('persons')
        .insert({ ...row, membership_code: code, status: 'ACTIVE' })
        .select('id')
        .single();
      if (!error) {
        // Someone who already shared this number with the bot is connected as this member at once
        after(() => syncChatsForPhones(db, [row.phone_primary]));
        return { ok: true, code, id: (data as { id: string }).id };
      }
      if (error.code !== '23505' || attempt > 0) throw new Error(missingMigration(error.message));
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** "Enroll in a class": a member who also attends classes becomes a student — the same person, with a registration number. */
export async function enrollMemberAsStudent(
  personId: string,
  classId: string,
  enrollmentDate: string
): Promise<{ ok: true; reg_no: string } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('STUDENT_CREATE');
    const id = z.string().min(1).parse(personId);
    const cls = z.string().min(1, 'Choose a class').parse(classId);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').parse(enrollmentDate);
    const person = (await db.from('persons').select('id, membership_type').eq('id', id).maybeSingle().then(check)) as { id: string; membership_type: string | null } | null;
    if (!person || (await nonMemberIds(db, [id])).has(id)) throw new Error('That member was not found — reload the page');
    const { data: already } = await db.from('students').select('reg_no').eq('person_id', id).maybeSingle();
    if (already) throw new Error(`Already a student (${(already as { reg_no: string }).reg_no})`);
    const klass = (await db.from('classes').select('id, academic_year_id').eq('id', cls).maybeSingle().then(check)) as { id: string; academic_year_id: string } | null;
    if (!klass) throw new Error('That class no longer exists');
    // Members from before the form have no membership type; set it so they stay a member once they are a student
    if (!person.membership_type) await db.from('persons').update({ membership_type: 'REGULAR' }).eq('id', id).then(check);

    const student = (await db.from('students')
      .insert({ id: crypto.randomUUID(), person_id: id, status: 'ACTIVE', enrollment_date: date })
      .select('id, reg_no')
      .single()
      .then(check)) as { id: string; reg_no: string };
    const { error } = await db.from('enrollments').insert({ student_id: student.id, class_id: cls, academic_year_id: klass.academic_year_id, status: 'ACTIVE' });
    if (error) {
      await db.from('students').delete().eq('id', student.id);
      throw new Error(error.message);
    }
    return { ok: true, reg_no: student.reg_no };
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
    const row = toRow(input, true);
    const status = StatusSchema.parse(input.status);
    const { data: before } = await db.from('persons').select('phone_primary').eq('id', personId).maybeSingle();
    let { error } = await db.from('persons').update({ ...row, status, updated_at: new Date().toISOString() }).eq('id', personId);
    if (error && spiritualMissing(error.message)) {
      // Before migration 045: fine as long as no baptism details were given
      if (row.baptism_date || row.baptism_church || row.confession_father_phone) throw new Error(SPIRITUAL_MIGRATION);
      const older = Object.fromEntries(Object.entries(row).filter(([k]) => !['baptism_date', 'baptism_church', 'confession_father_phone'].includes(k)));
      ({ error } = await db.from('persons').update({ ...older, status, updated_at: new Date().toISOString() }).eq('id', personId));
    }
    if (error) throw new Error(missingMigration(error.message));
    // The bot's links follow the member's phone (old and new number) and status
    after(() => syncChatsForPhones(db, [(before as { phone_primary: string | null } | null)?.phone_primary, row.phone_primary]));
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
    const path = tenantPath(db, person.id, `${crypto.randomUUID()}${ext}`);
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
