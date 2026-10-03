'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard home — live counts and short lists for any signed-in user.
// Sections the user may not see (audit, members) come back empty.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Person } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { todayIso, weekdayOfIso } from '@/lib/utils/ethiopian-calendar';
import { addDays } from '@/lib/hr/types';

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
  /** Year-to-date ledger totals; null if the user can't see finance or finance isn't set up. */
  finance: { income: number; expenses: number } | null;
  /** Payment requests waiting for this user to approve. */
  financePending: number;
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
    let activeTeachers = new Set<string>();
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
        ((classRows ?? []) as { teacher_person_id: string | null }[]).map((c) => c.teacher_person_id).filter((id): id is string => Boolean(id))
      );
      pendingApprovals = pending;
    }
    // Teachers assigned under HR (migration 016); ignored if HR isn't set up yet
    const { data: hrTeachers } = await db.from('service_assignments').select('person_id').eq('status', 'ACTIVE').eq('role_kind', 'TEACHER');
    for (const r of (hrTeachers ?? []) as { person_id: string }[]) activeTeachers.add(r.person_id);

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

    let finance: DashboardData['finance'] = null;
    let financePending = 0;
    try {
      if (can('FINANCE_VIEW')) {
        const txns = await selectAll<{ txn_type: string; amount: number }>((a, b) =>
          db.from('finance_transactions').select('txn_type, amount').gte('txn_date', yearStart).order('id').range(a, b)
        );
        finance = {
          income: txns.filter((x) => x.txn_type === 'INCOME').reduce((s, x) => s + Number(x.amount), 0),
          expenses: txns.filter((x) => x.txn_type === 'EXPENSE').reduce((s, x) => s + Number(x.amount), 0),
        };
      }
      if (can('FINANCE_APPROVE')) {
        financePending = await count(db, 'finance_requests', { status: 'PENDING' });
      }
    } catch {
      // Finance tables not created yet (migration 008) — leave the section empty
    }

    return {
      mode: 'live',
      data: {
        totalMembers: persons - students,
        newMembersThisYear: Math.max(0, newPersons - newStudents),
        activeStudents,
        activeTeachers: activeTeachers.size,
        departments,
        coordinations,
        currentAcademicYear: year?.name ?? null,
        pendingApprovals,
        governanceBodies: (governance ?? []) as DashboardData['governanceBodies'],
        recentAudit,
        recentMembers,
        finance,
        financePending,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface Notice {
  /** Stable per item; with `version` it decides read / unread on the device. */
  id: string;
  /** Changes when something new arrives under the same item. */
  version: string;
  kind: 'alert' | 'info' | 'success';
  en: string;
  am: string;
  href: string;
  /** ISO date or timestamp shown under the text. */
  at: string | null;
}

type Source = () => Promise<Notice[]>;
type Query = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

/**
 * Things waiting for the signed-in user, by permission. Each area is read on
 * its own, so an area whose tables don't exist yet is simply skipped.
 */
export async function loadNotifications(): Promise<Loaded<Notice[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    const can = (...p: string[]) => p.some((x) => me.permissions.includes(x as never));
    const today = todayIso();
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    /** One notice for "N rows match", versioned by the newest row. */
    const counted = async (
      table: string,
      filter: (q: Query) => Query,
      stamp: string,
      make: (n: number, newest: string) => Omit<Notice, 'version' | 'at'>
    ): Promise<Notice[]> => {
      const { data, error } = await filter(db.from(table).select(stamp)).order(stamp, { ascending: false }).limit(200);
      if (error || !data?.length) return [];
      const newest = String((data[0] as unknown as Record<string, unknown>)[stamp]);
      return [{ ...make(data.length, newest), version: `${data.length}@${newest}`, at: newest }];
    };

    const sources: Source[] = [];

    if (can('FINANCE_APPROVE')) {
      sources.push(() =>
        counted('finance_requests', (q) => q.eq('status', 'PENDING'), 'created_at', (n) => ({
          id: 'finance-to-approve', kind: 'alert', href: '/dashboard/finance/requests',
          en: `${n} payment ${plural(n, 'request is', 'requests are')} waiting for your approval`,
          am: `${n} የክፍያ ጥያቄ(ዎች) የእርስዎን ማጽደቅ ይጠብቃሉ`,
        }))
      );
    }
    if (can('FINANCE_CREATE')) {
      sources.push(() =>
        counted('finance_requests', (q) => q.eq('status', 'APPROVED'), 'reviewed_at', (n) => ({
          id: 'finance-to-pay', kind: 'alert', href: '/dashboard/finance/requests',
          en: `${n} approved ${plural(n, 'request is', 'requests are')} waiting to be paid`,
          am: `${n} የጸደቀ ጥያቄ(ዎች) ክፍያ ይጠብቃሉ`,
        }))
      );
    }
    if (can('FINANCE_REQUEST', 'FINANCE_CREATE')) {
      sources.push(async () => {
        const { data } = await db.from('finance_requests')
          .select('id, request_no, title, status, updated_at')
          .eq('requested_by', me.systemUser.id)
          .in('status', ['APPROVED', 'REJECTED', 'RETURNED', 'COMPLETED'])
          .gte('updated_at', addDays(today, -14))
          .order('updated_at', { ascending: false })
          .limit(5);
        const words: Record<string, [string, string, Notice['kind']]> = {
          APPROVED: ['was approved', 'ጸድቋል', 'success'],
          COMPLETED: ['has been paid', 'ተከፍሏል', 'success'],
          RETURNED: ['was returned for changes', 'ለማስተካከያ ተመልሷል', 'alert'],
          REJECTED: ['was not approved', 'አልጸደቀም', 'alert'],
        };
        return ((data ?? []) as { id: string; request_no: string; title: string; status: string; updated_at: string }[]).map((r) => ({
          id: `my-request-${r.id}`, version: r.status, kind: words[r.status][2], href: '/dashboard/finance/requests', at: r.updated_at,
          en: `Your request ${r.request_no} (${r.title}) ${words[r.status][0]}`,
          am: `ጥያቄዎ ${r.request_no} (${r.title}) ${words[r.status][1]}`,
        }));
      });
    }
    if (can('GRADE_APPROVE')) {
      sources.push(() =>
        counted('grades', (q) => q.eq('status', 'PENDING'), 'created_at', (n) => ({
          id: 'grades-to-approve', kind: 'alert', href: '/dashboard/education/grades',
          en: `${n} ${plural(n, 'grade is', 'grades are')} waiting for approval`,
          am: `${n} ውጤት(ዎች) ማጽደቅ ይጠብቃሉ`,
        }))
      );
    }
    if (can('CHOIR_MANAGE')) {
      sources.push(() =>
        counted('choir_sessions', (q) => q.eq('status', 'PLANNED').lt('session_date', today), 'session_date', (n) => ({
          id: 'choir-attendance', kind: 'alert', href: '/dashboard/sacred-arts/choir',
          en: `Attendance not taken for ${n} choir ${plural(n, 'session', 'sessions')}`,
          am: `ለ${n} የመዘምራን መርሐ ግብር(ዎች) ተገኝነት አልተያዘም`,
        }))
      );
      sources.push(async () => {
        const { data } = await db.from('choir_sessions').select('id, title, kind, start_time').eq('status', 'PLANNED').eq('session_date', today);
        return ((data ?? []) as { id: string; title: string | null; kind: string; start_time: string | null }[]).map((s) => {
          const what = s.title || (s.kind === 'REHEARSAL' ? 'Choir rehearsal' : s.kind === 'SERVICE' ? 'Choir service' : 'Choir event');
          const time = s.start_time ? ` ${s.start_time.slice(0, 5)}` : '';
          return {
            id: `choir-today-${s.id}`, version: today, kind: 'info' as const, href: '/dashboard/sacred-arts/choir', at: today,
            en: `Today${time}: ${what}`, am: `ዛሬ${time}: ${s.title || 'የመዘምራን መርሐ ግብር'}`,
          };
        });
      });
    }
    if (can('HR_MANAGE')) {
      sources.push(async () => {
        const sunday = addDays(today, -(weekdayOfIso(today) ?? 0));
        const [{ count: serving, error }, { count: marked }] = await Promise.all([
          db.from('service_assignments').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').lte('start_date', sunday),
          db.from('servant_attendance').select('id', { count: 'exact', head: true }).eq('service_date', sunday),
        ]);
        if (error || !serving || marked) return [];
        const isToday = sunday === today;
        return [{
          id: 'servant-attendance', version: sunday, kind: isToday ? 'info' : 'alert', href: '/dashboard/hr/attendance', at: sunday,
          en: isToday ? "Take today's servant attendance" : "Servant attendance for last Sunday hasn't been taken",
          am: isToday ? 'የዛሬውን የአገልጋዮች ተገኝነት ይያዙ' : 'ያለፈው እሁድ የአገልጋዮች ተገኝነት አልተያዘም',
        }];
      });
      sources.push(() =>
        counted('discipline_cases', (q) => q.eq('status', 'OPEN'), 'opened_on', (n) => ({
          id: 'discipline-open', kind: 'info', href: '/dashboard/hr/discipline',
          en: `${n} discipline ${plural(n, 'case is', 'cases are')} still open`,
          am: `${n} የዲሲፕሊን ጉዳይ(ዮች) በሂደት ላይ ናቸው`,
        }))
      );
    }
    if (can('ASSET_CREATE')) {
      sources.push(() =>
        counted('asset_maintenance', (q) => q.eq('status', 'OPEN').lt('reported_on', addDays(today, -30)), 'reported_on', (n) => ({
          id: 'repairs-overdue', kind: 'alert', href: '/dashboard/property/maintenance',
          en: `${n} repair ${plural(n, 'job has', 'jobs have')} been open for more than 30 days`,
          am: `${n} የጥገና ሥራ(ዎች) ከ30 ቀን በላይ ክፍት ናቸው`,
        }))
      );
    }
    if (can('PROGRAM_VIEW', 'PROGRAM_CREATE')) {
      sources.push(async () => {
        const { data } = await db.from('programs')
          .select('id, title_en, title_am, start_date')
          .neq('status', 'CANCELLED')
          .gte('start_date', today)
          .lte('start_date', addDays(today, 7))
          .order('start_date')
          .limit(3);
        return ((data ?? []) as { id: string; title_en: string; title_am: string | null; start_date: string }[]).map((p) => ({
          id: `program-${p.id}`, version: p.start_date, kind: 'info' as const, href: '/dashboard/programs', at: p.start_date,
          en: p.start_date === today ? `Today: ${p.title_en}` : `Coming up: ${p.title_en}`,
          am: `${p.start_date === today ? 'ዛሬ' : 'በቅርቡ'}: ${p.title_am || p.title_en}`,
        }));
      });
    }

    const lists = await Promise.all(sources.map((s) => s().catch(() => [] as Notice[])));
    const order = { alert: 0, info: 1, success: 2 };
    return { mode: 'live', data: lists.flat().sort((a, b) => order[a.kind] - order[b.kind] || (b.at ?? '').localeCompare(a.at ?? '')) };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}
