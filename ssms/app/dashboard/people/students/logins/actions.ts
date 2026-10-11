'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Student logins: registration number + 6-digit PIN (migration 023).
// Each login is a system user (username = reg no) with the STUDENT role, which
// only opens the student's own pages. PINs are returned once, for the slips —
// they are never stored or shown again (reset to make a new one).
//   STUDENT_CREATE or USER_MANAGE   create, reset, disable
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { isStudentLogin, newPin, regNoToAuthEmail } from '@/lib/auth/student-login';

type Row = Record<string, unknown>;
type Named = { full_name_en: string; full_name_am: string | null } | null;

export interface StudentLoginRow {
  student_id: string;
  reg_no: string;
  name_en: string;
  name_am: string;
  class_id: string;
  /** Has a login (any account linked to the student's person) */
  has_login: boolean;
  /** The login is a student login (not, e.g., a staff account of the same person) */
  student_login: boolean;
  active: boolean;
  last_login: string | null;
}

export interface LoginSlip {
  name_en: string;
  name_am: string;
  reg_no: string;
  class_name: string;
  class_name_am: string;
  pin: string;
}

export interface StudentLoginsData {
  classes: { id: string; name_en: string; name_am: string }[];
  rows: StudentLoginRow[];
}

const MIGRATION_023 = 'Run database migration 023 (student portal) first';
const MAX_AT_ONCE = 60;

export async function loadStudentLogins(): Promise<Loaded<StudentLoginsData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const year = (await db.from('academic_years').select('id').order('is_current', { ascending: false }).order('start_date', { ascending: false }).limit(1).maybeSingle().then(check)) as { id: string } | null;
    if (!year) return { mode: 'live', data: { classes: [], rows: [] } };

    const [classes, enrollments, students, users] = await Promise.all([
      db.from('classes').select('id, name_en, name_am').eq('academic_year_id', year.id).order('grade_level').order('name_en').then(check) as Promise<
        { id: string; name_en: string; name_am: string | null }[]
      >,
      selectAll<Row>((a, b) => db.from('enrollments').select('student_id, class_id').eq('academic_year_id', year.id).eq('status', 'ACTIVE').order('student_id').range(a, b)),
      selectAll<Row>((a, b) =>
        db.from('students')
          .select('id, reg_no, person_id, person:persons!students_person_id_fkey(full_name_en, full_name_am)')
          .eq('status', 'ACTIVE')
          .order('reg_no')
          .range(a, b)
      ),
      selectAll<Row>((a, b) => db.from('system_users').select('person_id, username, is_active, last_login_at').order('id').range(a, b)),
    ]);
    const classOf = new Map(enrollments.map((e) => [e.student_id as string, e.class_id as string]));
    const userOf = new Map(users.map((u) => [u.person_id as string, u]));
    const rows: StudentLoginRow[] = students
      .filter((s) => classOf.has(s.id as string))
      .map((s) => {
        const person = s.person as Named;
        const user = userOf.get(s.person_id as string);
        return {
          student_id: s.id as string,
          reg_no: s.reg_no as string,
          name_en: person?.full_name_en ?? '',
          name_am: person?.full_name_am || person?.full_name_en || '',
          class_id: classOf.get(s.id as string)!,
          has_login: Boolean(user),
          student_login: Boolean(user && isStudentLogin(user.username as string)),
          active: Boolean(user?.is_active),
          last_login: (user?.last_login_at as string) ?? null,
        };
      })
      .sort((a, b) => a.name_en.localeCompare(b.name_en));
    return {
      mode: 'live',
      data: { classes: classes.map((c) => ({ id: c.id, name_en: c.name_en, name_am: c.name_am || c.name_en })), rows },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

/** The student, their person, class and (if any) system user. */
async function studentRecord(db: SupabaseClient, studentId: string) {
  const s = (await db.from('students')
    .select('id, reg_no, person_id, person:persons!students_person_id_fkey(full_name_en, full_name_am)')
    .eq('id', studentId)
    .single()
    .then(check)) as unknown as { id: string; reg_no: string; person_id: string; person: Named };
  const [{ data: enrollment }, { data: user }] = await Promise.all([
    db.from('enrollments')
      .select('class:classes(name_en, name_am)')
      .eq('student_id', studentId)
      .eq('status', 'ACTIVE')
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('system_users').select('id, auth_user_id, username').eq('person_id', s.person_id).maybeSingle(),
  ]);
  const cls = (enrollment as { class: { name_en: string; name_am: string | null } | null } | null)?.class;
  return {
    ...s,
    user: user as { id: string; auth_user_id: string; username: string } | null,
    slip: (pin: string): LoginSlip => ({
      name_en: s.person?.full_name_en ?? '',
      name_am: s.person?.full_name_am || s.person?.full_name_en || '',
      reg_no: s.reg_no,
      class_name: cls?.name_en ?? '',
      class_name_am: cls?.name_am || cls?.name_en || '',
      pin,
    }),
  };
}

/** Create logins for these students (those who already have one are left as they are). */
export async function createStudentLogins(
  studentIds: string[]
): Promise<{ ok: true; slips: LoginSlip[]; skipped: { name: string; reason: string }[] } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    if (studentIds.length === 0) throw new Error('Choose at least one student');
    if (studentIds.length > MAX_AT_ONCE) throw new Error(`Create at most ${MAX_AT_ONCE} logins at a time (one class)`);

    const { data: role } = await db.from('roles').select('id').eq('code', 'STUDENT').maybeSingle();
    if (!role) throw new Error(MIGRATION_023);
    // The role needs a unit; students belong to the education department
    const { data: unit } = await db.from('organization_units')
      .select('id')
      .in('code', ['DEPT_EDUCATION', 'COORD_EDUCATION'])
      .order('sort_order')
      .limit(1)
      .maybeSingle();
    if (!unit) throw new Error('No education department found under Organization');

    const slips: LoginSlip[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const id of studentIds) {
      const s = await studentRecord(db, id);
      const name = s.person?.full_name_en ?? s.reg_no;
      if (s.user) {
        skipped.push({ name, reason: 'already has a login' });
        continue;
      }
      if (!isStudentLogin(s.reg_no)) {
        skipped.push({ name, reason: `registration number "${s.reg_no}" is not in the REG-YYYY-NNNN form` });
        continue;
      }
      const pin = newPin();
      const { data: created, error: authError } = await db.auth.admin.createUser({
        email: regNoToAuthEmail(s.reg_no),
        password: pin,
        email_confirm: true,
        user_metadata: { reg_no: s.reg_no, full_name: name, student: true },
      });
      if (authError || !created.user) {
        skipped.push({ name, reason: authError?.message ?? 'could not create the login' });
        continue;
      }
      let systemUserId: string | null = null;
      try {
        const su = (await db.from('system_users')
          .insert({ auth_user_id: created.user.id, person_id: s.person_id, username: s.reg_no, is_active: true })
          .select('id')
          .single()
          .then(check)) as { id: string };
        systemUserId = su.id;
        await db.from('user_unit_assignments')
          .insert({ system_user_id: su.id, organization_unit_id: unit.id, role_id: role.id, is_active: true, assigned_by: me.systemUser.id })
          .then(check);
        slips.push(s.slip(pin));
      } catch (e) {
        if (systemUserId) await db.from('system_users').delete().eq('id', systemUserId);
        await db.auth.admin.deleteUser(created.user.id);
        skipped.push({ name, reason: errorMessage(e) });
      }
    }
    return { ok: true, slips, skipped };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** A new PIN for a student who forgot theirs. */
export async function resetStudentPin(studentId: string): Promise<{ ok: true; slip: LoginSlip } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const s = await studentRecord(db, studentId);
    if (!s.user || !isStudentLogin(s.user.username)) throw new Error('This student has no student login yet');
    const pin = newPin();
    const { error } = await db.auth.admin.updateUserById(s.user.auth_user_id, { password: pin });
    if (error) throw new Error(error.message);
    return { ok: true, slip: s.slip(pin) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Turn a student's login off (e.g. they left) or on again. */
export async function setStudentLoginActive(studentId: string, active: boolean): Promise<ActionResult> {
  try {
    const { db } = await authorize('STUDENT_CREATE', 'USER_MANAGE');
    const s = await studentRecord(db, studentId);
    if (!s.user || !isStudentLogin(s.user.username)) throw new Error('This student has no student login');
    await db.from('system_users').update({ is_active: active }).eq('id', s.user.id).then(check);
    // Ban the login too, so an open session cannot be refreshed
    const { error } = await db.auth.admin.updateUserById(s.user.auth_user_id, { ban_duration: active ? 'none' : '876000h' });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
