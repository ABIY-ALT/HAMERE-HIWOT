'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard home — permission-based. Each section is read only when the
// signed-in user may see it; otherwise it comes back null and is not shown.
// A section whose tables don't exist yet is also null.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Person, PermissionCode } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';
import { todayIso, weekdayOfIso } from '@/lib/utils/ethiopian-calendar';
import { addDays } from '@/lib/hr/types';
import { monthsBetween } from '@/lib/reports/types';
import type { AssetStatus } from '@/lib/property/types';

export type WeekRate = { week: string; rate: number | null };

export interface DashboardData {
  currentAcademicYear: string | null;
  /** Grades waiting for approval this year (GRADE_VIEW / GRADE_APPROVE). */
  gradesPending: number | null;
  /** Payment requests waiting for this user to approve. */
  financePending: number;
  units: { departments: number; coordinations: number };
  members: { total: number; newThisYear: number; byMonth: { month: string; count: number }[]; recent: Person[] } | null;
  students: { active: number; attendanceByWeek: WeekRate[] } | null;
  teachers: number | null;
  servants: { serving: number; attendanceByWeek: WeekRate[] } | null;
  choir: { members: number; next: { date: string; time: string; title: string; kind: string } | null } | null;
  finance: {
    income: number;
    expenses: number;
    byMonth: { month: string; income: number; expense: number }[];
    pending: number;
    pendingAmount: number;
    toPay: number;
    toPayAmount: number;
  } | null;
  assets: { total: number; byStatus: Partial<Record<AssetStatus, number>> } | null;
  programs: { id: string; title_en: string; title_am: string | null; start_date: string; program_type: string }[] | null;
  governanceBodies: { id: string; name_en: string; name_am: string; is_active: boolean }[] | null;
  recentAudit: { id: string; action: string; table_name: string; created_at: string }[] | null;
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

/** Runs a section; a missing table or other failure hides that section instead of the whole page. */
async function section<T>(allowed: boolean, load: () => Promise<T>): Promise<T | null> {
  if (!allowed) return null;
  try {
    return await load();
  } catch (e) {
    console.error('dashboard section failed:', errorMessage(e));
    return null;
  }
}

/** Sunday that starts the week of a date. */
const weekOf = (iso: string) => addDays(iso, -(weekdayOfIso(iso) ?? 0));

/** Attendance rate per week: present + late over present + late + absent. */
function weeklyRates(weeks: string[], marks: { date: string; status: string }[]): WeekRate[] {
  const tally = new Map(weeks.map((w) => [w, { came: 0, counted: 0 }]));
  for (const m of marks) {
    const t = tally.get(weekOf(m.date));
    if (!t || m.status === 'EXCUSED') continue;
    t.counted += 1;
    if (m.status === 'PRESENT' || m.status === 'LATE') t.came += 1;
  }
  return weeks.map((week) => {
    const t = tally.get(week)!;
    return { week, rate: t.counted ? Math.round((t.came / t.counted) * 100) : null };
  });
}

export async function loadDashboard(): Promise<Loaded<DashboardData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize();
    const can = (...codes: PermissionCode[]) => codes.some((c) => me.permissions.includes(c));
    const today = todayIso();
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const months = monthsBetween(`${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`, today).slice(-12);
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekOf(today), -7 * (11 - i)));

    const year = (await db.from('academic_years').select('id, name').eq('is_current', true).maybeSingle().then(check)) as {
      id: string; name: string;
    } | null;

    const [departments, coordinations] = await Promise.all([
      count(db, 'organization_units', { unit_type: 'DEPARTMENT', is_active: true }),
      count(db, 'organization_units', { unit_type: 'COORDINATION', is_active: true }),
    ]);

    const [members, students, teachers, servants, choir, finance, financePending, assets, programs, governanceBodies, recentAudit, gradesPending] =
      await Promise.all([
        section(can('MEMBER_VIEW', 'AUDIT_VIEW_ALL'), async () => {
          const [persons, studentRows, newPersons, newStudents, created, latest] = await Promise.all([
            count(db, 'persons'),
            selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
            count(db, 'persons', {}, yearStart),
            count(db, 'students', {}, yearStart),
            selectAll<{ id: string; created_at: string }>((a, b) =>
              db.from('persons').select('id, created_at').gte('created_at', `${months[0]}-01`).order('id').range(a, b)
            ),
            db.from('persons').select('*').order('created_at', { ascending: false }).limit(25).then(check) as Promise<Person[]>,
          ]);
          const studentIds = new Set(studentRows.map((s) => s.person_id));
          const perMonth = new Map(months.map((m) => [m, 0]));
          for (const p of created) {
            if (studentIds.has(p.id)) continue;
            const key = p.created_at.slice(0, 7);
            if (perMonth.has(key)) perMonth.set(key, perMonth.get(key)! + 1);
          }
          return {
            total: persons - studentRows.length,
            newThisYear: Math.max(0, newPersons - newStudents),
            byMonth: months.map((month) => ({ month, count: perMonth.get(month) ?? 0 })),
            recent: latest.filter((p) => !studentIds.has(p.id)).slice(0, 5),
          };
        }),
        section(can('STUDENT_VIEW', 'ATTENDANCE_VIEW'), async () => {
          const [active, sessions] = await Promise.all([
            year ? count(db, 'enrollments', { academic_year_id: year.id, status: 'ACTIVE' }) : Promise.resolve(0),
            selectAll<{ session_date: string; records: { status: string }[] }>((a, b) =>
              db.from('attendance_sessions').select('session_date, records:attendance_records(status)').gte('session_date', weeks[0]).order('id').range(a, b)
            ),
          ]);
          const marks = sessions.flatMap((s) => (s.records ?? []).map((r) => ({ date: s.session_date, status: r.status })));
          return { active, attendanceByWeek: weeklyRates(weeks, marks) };
        }),
        section(can('STUDENT_VIEW', 'HR_VIEW'), async () => {
          const ids = new Set<string>();
          if (year) {
            const rows = (await db.from('classes').select('teacher_person_id').eq('academic_year_id', year.id).then(check)) as { teacher_person_id: string | null }[];
            for (const r of rows) if (r.teacher_person_id) ids.add(r.teacher_person_id);
          }
          // Teachers assigned under HR (migration 016); ignored if HR isn't set up yet
          const { data: hr } = await db.from('service_assignments').select('person_id').eq('status', 'ACTIVE').eq('role_kind', 'TEACHER');
          for (const r of (hr ?? []) as { person_id: string }[]) ids.add(r.person_id);
          return ids.size;
        }),
        section(can('HR_VIEW', 'HR_MANAGE'), async () => {
          const [serving, marks] = await Promise.all([
            selectAll<{ person_id: string }>((a, b) => db.from('service_assignments').select('person_id').eq('status', 'ACTIVE').order('id').range(a, b)),
            selectAll<{ service_date: string; status: string }>((a, b) =>
              db.from('servant_attendance').select('service_date, status').gte('service_date', weeks[0]).order('id').range(a, b)
            ),
          ]);
          return {
            serving: new Set(serving.map((r) => r.person_id)).size,
            attendanceByWeek: weeklyRates(weeks, marks.map((m) => ({ date: m.service_date, status: m.status }))),
          };
        }),
        section(can('MEMBER_VIEW', 'CHOIR_MANAGE'), async () => {
          const [members, next] = await Promise.all([
            count(db, 'choir_members', { status: 'ACTIVE' }),
            db.from('choir_sessions')
              .select('session_date, start_time, title, kind')
              .eq('status', 'PLANNED')
              .gte('session_date', today)
              .order('session_date')
              .order('start_time')
              .limit(1)
              .maybeSingle()
              .then(check) as Promise<{ session_date: string; start_time: string | null; title: string | null; kind: string } | null>,
          ]);
          return {
            members,
            next: next ? { date: next.session_date, time: (next.start_time ?? '').slice(0, 5), title: next.title ?? '', kind: next.kind } : null,
          };
        }),
        section(can('FINANCE_VIEW'), async () => {
          const since = `${months[0]}-01` < yearStart ? `${months[0]}-01` : yearStart;
          const [txns, requests] = await Promise.all([
            selectAll<{ txn_type: string; amount: number; txn_date: string }>((a, b) =>
              db.from('finance_transactions').select('txn_type, amount, txn_date').gte('txn_date', since).order('id').range(a, b)
            ),
            db.from('finance_requests').select('status, amount').in('status', ['PENDING', 'APPROVED']).then(check) as Promise<{ status: string; amount: number }[]>,
          ]);
          const sum = (rows: { amount: number }[]) => rows.reduce((t, r) => t + Number(r.amount), 0);
          const ytd = txns.filter((x) => x.txn_date >= yearStart);
          const perMonth = new Map(months.map((m) => [m, { income: 0, expense: 0 }]));
          for (const x of txns) {
            const bucket = perMonth.get(x.txn_date.slice(0, 7));
            if (!bucket) continue;
            if (x.txn_type === 'INCOME') bucket.income += Number(x.amount);
            else bucket.expense += Number(x.amount);
          }
          const pending = requests.filter((r) => r.status === 'PENDING');
          const toPay = requests.filter((r) => r.status === 'APPROVED');
          return {
            income: sum(ytd.filter((x) => x.txn_type === 'INCOME')),
            expenses: sum(ytd.filter((x) => x.txn_type === 'EXPENSE')),
            byMonth: months.map((month) => ({ month, ...perMonth.get(month)! })),
            pending: pending.length,
            pendingAmount: sum(pending),
            toPay: toPay.length,
            toPayAmount: sum(toPay),
          };
        }),
        section(can('FINANCE_APPROVE'), () => count(db, 'finance_requests', { status: 'PENDING' })),
        section(can('ASSET_VIEW'), async () => {
          const rows = await selectAll<{ status: AssetStatus }>((a, b) => db.from('assets').select('status').order('id').range(a, b));
          const byStatus: Partial<Record<AssetStatus, number>> = {};
          for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          return { total: rows.length, byStatus };
        }),
        section(can('PROGRAM_VIEW', 'PROGRAM_CREATE', 'PROGRAM_MANAGE'), async () =>
          (await db.from('programs')
            .select('id, title_en, title_am, start_date, program_type')
            .neq('status', 'CANCELLED')
            .gte('start_date', today)
            .lte('start_date', addDays(today, 30))
            .order('start_date')
            .limit(5)
            .then(check)) as NonNullable<DashboardData['programs']>
        ),
        section(can('GOVERNANCE_VIEW', 'GOVERNANCE_MANAGE', 'AUDIT_VIEW_ALL'), async () =>
          (await db.from('governance_bodies').select('id, name_en, name_am, is_active').order('name_en').then(check)) as NonNullable<DashboardData['governanceBodies']>
        ),
        section(can('AUDIT_VIEW_ALL'), async () =>
          (await db.from('system_audit_logs')
            .select('id, action, table_name, created_at')
            .order('created_at', { ascending: false })
            .limit(5)
            .then(check)) as NonNullable<DashboardData['recentAudit']>
        ),
        section(Boolean(year) && can('GRADE_VIEW', 'GRADE_APPROVE'), () => count(db, 'grades', { academic_year_id: year!.id, status: 'PENDING' })),
      ]);

    return {
      mode: 'live',
      data: {
        currentAcademicYear: year?.name ?? null,
        gradesPending,
        financePending: financePending ?? 0,
        units: { departments, coordinations },
        members,
        students,
        teachers,
        servants,
        choir,
        finance,
        assets,
        programs,
        governanceBodies,
        recentAudit,
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
