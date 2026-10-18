'use server';

// ─────────────────────────────────────────────────────────────────────────────
// The student portal (/dashboard/my): the signed-in student's own data — the
// student is found from their account's person, never from an id the browser
// sends. The data itself comes from lib/portal/student-data.
//   STUDENT_PORTAL (the STUDENT role, migration 023)
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { studentPortalData, type MyPortal } from '@/lib/portal/student-data';
import { isStudentLogin } from '@/lib/auth/student-login';

export type { MyAttendance, MyExam, MyGrade, MyPortal } from '@/lib/portal/student-data';

export async function loadMyPortal(): Promise<Loaded<MyPortal>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('STUDENT_PORTAL');
    const student = (await db.from('students').select('id').eq('person_id', me.person.id).maybeSingle().then(check)) as { id: string } | null;
    if (!student) throw new Error('This account is not linked to a student. Ask the school office.');
    // A member who also studies may use their own (staff) account here; only reg no logins have a PIN
    return { mode: 'live', data: { ...(await studentPortalData(db, student.id, { tickets: true })), pin_login: isStudentLogin(me.systemUser.username) } };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
