'use server';

// ─────────────────────────────────────────────────────────────────────────────
// The parent portal (/dashboard/family): the children linked to the signed-in
// parent (student_guardians.guardian_person_id = their person). Each child's
// results, attendance and exams come from lib/portal/student-data — without
// the exam tickets, so a parent cannot sit an exam for the child.
//   PARENT_PORTAL (the PARENT role, migration 025)
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { studentPortalData, type MyPortal } from '@/lib/portal/student-data';

export interface MyChild extends MyPortal {
  student_id: string;
  relationship: string;
}

export async function loadMyFamily(): Promise<Loaded<{ parent: string; parent_am: string; phone: string; children: MyChild[] }>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('PARENT_PORTAL');
    const links = (await db.from('student_guardians')
      .select('student_id, relationship')
      .eq('guardian_person_id', me.person.id)
      .then(check)) as { student_id: string; relationship: string }[];
    const children: MyChild[] = [];
    for (const l of links) {
      const data = await studentPortalData(db, l.student_id, { tickets: false });
      children.push({ ...data, student_id: l.student_id, relationship: l.relationship });
    }
    children.sort((a, b) => a.student.name_en.localeCompare(b.student.name_en));
    return {
      mode: 'live',
      data: {
        parent: me.person.full_name_en,
        parent_am: me.person.full_name_am || me.person.full_name_en,
        phone: me.systemUser.username,
        children,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
