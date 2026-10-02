'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard home — live counts and short lists for any signed-in user.
// Sections the user may not see (audit, members) come back empty.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Person } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';

export interface DashboardData {
  totalMembers: number;
  newMembersThisYear: number;
  activeStudents: number;
  activeTeachers: number;
  departments: number;
  coordinations: number;
  currentAcademicYear: string | null;
  pendingApprovals: number;
  governanceBodies: { id: string; name_en: string; name_am: string; is_active: boolean }[];
  recentAudit: { id: string; action: string; table_name: string; created_at: string }[];
  recentMembers: Person[];
}

/** Row count with equality filters and an optional created_at lower bound. */
async function count(
  db: SupabaseClient,
  table: string,
  eq: Record<string, string | boolean> = {},
  createdSince?: string
): Promise<number> {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(eq)) q = q.eq(column, value);
  if (createdSince) q = q.gte('created_at', createdSince);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

export async function loadDashboard(): Promise<Loaded<DashboardData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    const can = (p: string) => me.permissions.includes(p as never);
    const yearStart = `${new Date().getFullYear()}-01-01`;

    const year = (await db.from('academic_years').select('id, name').eq('is_current', true).maybeSingle().then(check)) as {
      id: string; name: string;
    } | null;

    const [persons, students, newPersons, newStudents, departments, coordinations, governance] = await Promise.all([
      count(db, 'persons'),
      count(db, 'students'),
      count(db, 'persons', {}, yearStart),
      count(db, 'students', {}, yearStart),
      count(db, 'organization_units', { unit_type: 'DEPARTMENT', is_active: true }),
      count(db, 'organization_units', { unit_type: 'COORDINATION', is_active: true }),
      db.from('governance_bodies').select('id, name_en, name_am, is_active').order('name_en').then(check),
    ]);

    let activeStudents = 0;
    let activeTeachers = 0;
    let pendingApprovals = 0;
    if (year) {
      const [enrolled, classRows, pending] = await Promise.all([
        count(db, 'enrollments', { academic_year_id: year.id, status: 'ACTIVE' }),
        db.from('classes').select('teacher_person_id').eq('academic_year_id', year.id).then(check),
        can('GRADE_APPROVE') || can('GRADE_VIEW')
          ? count(db, 'grades', { academic_year_id: year.id, status: 'PENDING' })
          : Promise.resolve(0),
      ]);
      activeStudents = enrolled;
      activeTeachers = new Set(
        ((classRows ?? []) as { teacher_person_id: string | null }[]).map((c) => c.teacher_person_id).filter(Boolean)
      ).size;
      pendingApprovals = pending;
    }

    // Latest members (persons that are not students)
    let recentMembers: Person[] = [];
    if (can('MEMBER_VIEW') || can('AUDIT_VIEW_ALL')) {
      const latest = (await db.from('persons').select('*').order('created_at', { ascending: false }).limit(25).then(check)) as Person[];
      const ids = latest.map((p) => p.id);
      const studentRows = ids.length
        ? ((await db.from('students').select('person_id').in('person_id', ids).then(check)) as { person_id: string }[])
        : [];
      const studentIds = new Set(studentRows.map((s) => s.person_id));
      recentMembers = latest.filter((p) => !studentIds.has(p.id)).slice(0, 5);
    }

    const recentAudit = can('AUDIT_VIEW_ALL')
      ? ((await db.from('system_audit_logs')
          .select('id, action, table_name, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
          .then(check)) as DashboardData['recentAudit'])
      : [];

    return {
      mode: 'live',
      data: {
        totalMembers: persons - students,
        newMembersThisYear: Math.max(0, newPersons - newStudents),
        activeStudents,
        activeTeachers,
        departments,
        coordinations,
        currentAcademicYear: year?.name ?? null,
        pendingApprovals,
        governanceBodies: (governance ?? []) as DashboardData['governanceBodies'],
        recentAudit,
        recentMembers,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
