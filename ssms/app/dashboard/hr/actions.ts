'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Human resources: servant assignments, servant attendance and discipline.
// View: HR_VIEW (discipline needs HR_MANAGE). Change: HR_MANAGE.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type { AttendanceStatus } from '@/lib/attendance/store';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import {
  addDays,
  type AttendanceMark,
  type CaseKind,
  type CaseStatus,
  type DisciplineCase,
  type EndReason,
  type HrData,
  type RoleKind,
  type ServiceAssignment,
} from '@/lib/hr/types';

type Row = Record<string, unknown> & { id: string };
type PersonRow = { id: string; full_name_en: string; full_name_am: string | null; phone_primary: string | null; baptismal_name: string | null; status: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const ROLE = z.enum(['HEAD', 'DEPUTY', 'SECRETARY', 'TEACHER', 'SERVANT']);

export async function loadHr(): Promise<Loaded<HrData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('HR_VIEW', 'HR_MANAGE', 'AUDIT_VIEW_ALL');
    const canSeeCases = me.permissions.includes('HR_MANAGE');
    const [assignRows, markRows, caseRows, persons, students, units, activeYear] = await Promise.all([
      selectAll<Row>((a, b) =>
        db.from('service_assignments')
          .select('*, unit:organization_units(name_en, name_am), class:classes(name_en)')
          .order('start_date', { ascending: false })
          .order('id')
          .range(a, b)
      ),
      selectAll<Row>((a, b) =>
        db.from('servant_attendance')
          .select('id, service_date, person_id, status, check_in, note')
          .gte('service_date', addDays(todayIso(), -400))
          .order('service_date')
          .order('id')
          .range(a, b)
      ),
      canSeeCases
        ? selectAll<Row>((a, b) => db.from('discipline_cases').select('*').order('opened_on', { ascending: false }).order('id').range(a, b))
        : Promise.resolve([] as Row[]),
      selectAll<PersonRow>((a, b) =>
        db.from('persons').select('id, full_name_en, full_name_am, phone_primary, baptismal_name, status').order('full_name_en').order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
      db.from('organization_units')
        .select('id, code, name_en, name_am, unit_type')
        .eq('is_active', true)
        .order('sort_order')
        .then(check) as Promise<{ id: string; code: string; name_en: string; name_am: string; unit_type: string }[]>,
      db.from('academic_years').select('id').eq('status', 'ACTIVE').maybeSingle().then(check) as Promise<{ id: string } | null>,
    ]);
    const classRows = activeYear
      ? ((await db.from('classes')
          .select('id, name_en, teacher_person_id')
          .eq('academic_year_id', activeYear.id)
          .order('grade_level')
          .order('name_en')
          .then(check)) as { id: string; name_en: string; teacher_person_id: string | null }[])
      : [];

    const assignments: ServiceAssignment[] = assignRows.map((r) => {
      const unit = r.unit as { name_en?: string; name_am?: string } | null;
      return {
        id: r.id,
        person_id: r.person_id as string,
        unit_id: r.unit_id as string,
        unit: unit?.name_en ?? '—',
        unit_am: unit?.name_am || unit?.name_en || '—',
        role_kind: r.role_kind as RoleKind,
        title: (r.title as string) ?? '',
        class_id: (r.class_id as string) ?? null,
        class_name: ((r.class as { name_en?: string } | null)?.name_en) ?? '',
        start_date: r.start_date as string,
        end_date: (r.end_date as string) ?? null,
        end_reason: (r.end_reason as EndReason) ?? null,
        status: r.status as 'ACTIVE' | 'ENDED',
        notes: (r.notes as string) ?? '',
      };
    });
    const attendance: AttendanceMark[] = markRows.map((m) => ({
      date: m.service_date as string,
      person_id: m.person_id as string,
      status: m.status as AttendanceStatus,
      check_in: ((m.check_in as string) ?? '').slice(0, 5),
      note: (m.note as string) ?? '',
    }));
    const cases: DisciplineCase[] = caseRows.map((c) => ({
      id: c.id,
      person_id: c.person_id as string,
      opened_on: c.opened_on as string,
      kind: c.kind as CaseKind,
      reason: c.reason as string,
      handled_by: (c.handled_by as string) ?? '',
      suspended_until: (c.suspended_until as string) ?? null,
      status: c.status as CaseStatus,
      resolution: (c.resolution as string) ?? '',
      closed_on: (c.closed_on as string) ?? null,
    }));

    const involved = new Set([
      ...assignments.map((a) => a.person_id),
      ...attendance.map((m) => m.person_id),
      ...cases.map((c) => c.person_id),
      ...classRows.map((c) => c.teacher_person_id).filter((id): id is string => Boolean(id)),
    ]);
    const studentPersons = new Set(students.map((s) => s.person_id));
    const toPerson = (p: PersonRow) => ({
      id: p.id,
      name: p.full_name_en,
      name_am: p.full_name_am || p.full_name_en,
      phone: p.phone_primary ?? '',
      baptismal_name: p.baptismal_name ?? '',
      status: p.status,
    });

    return {
      mode: 'live',
      data: {
        people: persons.filter((p) => involved.has(p.id)).map(toPerson),
        assignments,
        attendance,
        cases,
        canSeeCases,
        homeroom: classRows.map((c) => ({ class_id: c.id, class_name: c.name_en, person_id: c.teacher_person_id })),
        candidates: persons.filter((p) => p.status === 'ACTIVE' && !studentPersons.has(p.id)).map((p) => ({ id: p.id, name: p.full_name_en })),
        units: units.map((u) => ({ id: u.id, code: u.code, name: u.name_en, name_am: u.name_am || u.name_en, type: u.unit_type })),
        classes: classRows.map((c) => ({ id: c.id, name: c.name_en })),
      },
    };
  } catch (e) {
    const msg = errorMessage(e);
    return { mode: 'error', error: msg.includes('service_assignments') || msg.includes('servant_attendance') ? 'Run database migration 016 (HR) first' : msg };
  }
}

// ── Assignments ──────────────────────────────────────────────────────────────

function assignmentError(error: { code?: string; message: string }): string {
  if (error.message.includes('uq_service_assignment_head')) return 'This unit already has a head — end that assignment first';
  if (error.code === '23505') return 'This person already holds this role there';
  if (error.code === '23514') return 'The end date cannot be before the start date';
  return error.message;
}

const AssignmentSchema = z.object({
  person_id: z.string(),
  unit_id: z.string().min(1, 'Choose the department or coordination'),
  role_kind: ROLE,
  title: z.string().trim().max(120),
  class_id: z.string(),
  start_date: isoDate,
  notes: z.string().trim(),
});

export type AssignmentInput = z.input<typeof AssignmentSchema>;

export async function saveAssignment(id: string | null, input: AssignmentInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('HR_MANAGE');
    const a = AssignmentSchema.parse(input);
    const fields = {
      unit_id: a.unit_id,
      role_kind: a.role_kind,
      title: a.title || null,
      class_id: a.role_kind === 'TEACHER' && a.class_id ? a.class_id : null,
      start_date: a.start_date,
      notes: a.notes || null,
    };
    if (id) {
      const { error } = await db.from('service_assignments').update(fields).eq('id', id);
      if (error) throw new Error(assignmentError(error));
    } else {
      if (!a.person_id) throw new Error('Choose the person to assign');
      const { error } = await db.from('service_assignments').insert({ ...fields, person_id: a.person_id, status: 'ACTIVE', created_by: me.systemUser.id });
      if (error) throw new Error(assignmentError(error));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const EndSchema = z.object({
  end_date: isoDate,
  end_reason: z.enum(['COMPLETED', 'TRANSFERRED', 'RESIGNED', 'SUSPENDED', 'OTHER']),
  note: z.string().trim(),
});

export type EndAssignmentInput = z.input<typeof EndSchema>;

export async function endAssignment(id: string, input: EndAssignmentInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('HR_MANAGE');
    const e = EndSchema.parse(input);
    const row = (await db.from('service_assignments').select('notes, status').eq('id', id).single().then(check)) as { notes: string | null; status: string };
    if (row.status !== 'ACTIVE') throw new Error('This assignment has already ended');
    const { error } = await db.from('service_assignments')
      .update({ status: 'ENDED', end_date: e.end_date, end_reason: e.end_reason, notes: [row.notes, e.note].filter(Boolean).join('\n') || null })
      .eq('id', id);
    if (error) throw new Error(assignmentError(error));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const TransferSchema = z.object({
  unit_id: z.string().min(1, 'Choose the new department or coordination'),
  role_kind: ROLE,
  title: z.string().trim().max(120),
  class_id: z.string(),
  date: isoDate,
});

export type TransferInput = z.input<typeof TransferSchema>;

/** Moves a servant: starts the new assignment, then ends the old one as transferred. */
export async function transferAssignment(id: string, input: TransferInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('HR_MANAGE');
    const t = TransferSchema.parse(input);
    const old = (await db.from('service_assignments')
      .select('person_id, unit_id, role_kind, class_id, start_date, status')
      .eq('id', id)
      .single()
      .then(check)) as { person_id: string; unit_id: string; role_kind: string; class_id: string | null; start_date: string; status: string };
    if (old.status !== 'ACTIVE') throw new Error('This assignment has already ended');
    if (t.date < old.start_date) throw new Error('The move cannot be before the assignment started');
    const class_id = t.role_kind === 'TEACHER' && t.class_id ? t.class_id : null;
    if (t.unit_id === old.unit_id && t.role_kind === old.role_kind && class_id === old.class_id) {
      throw new Error('Choose a different unit, role or class');
    }
    const { error } = await db.from('service_assignments').insert({
      person_id: old.person_id, unit_id: t.unit_id, role_kind: t.role_kind, title: t.title || null, class_id,
      start_date: t.date, status: 'ACTIVE', created_by: me.systemUser.id,
    });
    if (error) throw new Error(assignmentError(error));
    await db.from('service_assignments').update({ status: 'ENDED', end_date: t.date, end_reason: 'TRANSFERRED' }).eq('id', id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Attendance ───────────────────────────────────────────────────────────────

const MarkSchema = z.object({
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  check_in: z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Use a valid time'),
});

/**
 * Saves one service day for the servants on the roll: marked people are
 * stored, people on the roll left unmarked are cleared.
 */
export async function saveServantAttendance(
  date: string,
  roll: string[],
  marks: Record<string, { status: AttendanceStatus; check_in: string }>
): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('HR_MANAGE');
    isoDate.parse(date);
    if (date > addDays(todayIso(), 1)) throw new Error('Attendance cannot be taken for a future day');
    const people = z.array(z.string()).max(3000).parse(roll);
    const m = z.record(z.string(), MarkSchema).parse(marks);
    const marked = people.filter((p) => m[p]);
    if (marked.length === 0) throw new Error('Mark at least one servant');
    await db.from('servant_attendance')
      .upsert(
        marked.map((person_id) => ({
          service_date: date, person_id, status: m[person_id].status,
          check_in: m[person_id].status === 'PRESENT' || m[person_id].status === 'LATE' ? m[person_id].check_in || null : null,
          recorded_by: me.systemUser.id,
        })),
        { onConflict: 'service_date,person_id' }
      )
      .then(check);
    const unmarked = people.filter((p) => !m[p]);
    for (let i = 0; i < unmarked.length; i += 200) {
      await db.from('servant_attendance').delete().eq('service_date', date).in('person_id', unmarked.slice(i, i + 200)).then(check);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Discipline ───────────────────────────────────────────────────────────────

const CaseSchema = z.object({
  person_id: z.string().min(1, 'Choose the servant'),
  opened_on: isoDate,
  kind: z.enum(['WARNING', 'COUNSELING', 'SUSPENSION', 'RECONCILIATION', 'OTHER']),
  reason: z.string().trim().min(3, 'Describe the reason'),
  handled_by: z.string().trim(),
  suspended_until: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date'),
  end_assignments: z.boolean(),
});

export type CaseInput = z.input<typeof CaseSchema>;

export async function saveDisciplineCase(id: string | null, input: CaseInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('HR_MANAGE');
    const c = CaseSchema.parse(input);
    const suspended_until = c.kind === 'SUSPENSION' && c.suspended_until ? c.suspended_until : null;
    if (suspended_until && suspended_until < c.opened_on) throw new Error('The suspension cannot end before it starts');
    const fields = { opened_on: c.opened_on, kind: c.kind, reason: c.reason, handled_by: c.handled_by || null, suspended_until };
    if (id) {
      await db.from('discipline_cases').update(fields).eq('id', id).then(check);
    } else {
      await db.from('discipline_cases').insert({ ...fields, person_id: c.person_id, status: 'OPEN', created_by: me.systemUser.id }).then(check);
      if (c.kind === 'SUSPENSION' && c.end_assignments) {
        await db.from('service_assignments')
          .update({ status: 'ENDED', end_date: c.opened_on, end_reason: 'SUSPENDED' })
          .eq('person_id', c.person_id)
          .eq('status', 'ACTIVE')
          .lte('start_date', c.opened_on)
          .then(check);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const CloseSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  closed_on: isoDate,
  resolution: z.string().trim().min(3, 'Write how the case was settled'),
});

export type CloseCaseInput = z.input<typeof CloseSchema>;

export async function closeDisciplineCase(id: string, input: CloseCaseInput): Promise<ActionResult> {
  try {
    const { db } = await authorize('HR_MANAGE');
    const c = CloseSchema.parse(input);
    const { error } = await db.from('discipline_cases').update(c).eq('id', id).eq('status', 'OPEN');
    if (error) throw new Error(error.code === '23514' ? 'The closing date cannot be before the case was opened' : error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
