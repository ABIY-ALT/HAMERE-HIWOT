'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Year-end promotion: enroll this year's students in next year's classes in
// one step — up a grade when their average of approved grades reaches the
// pass mark, the same grade otherwise; staff can change any student before
// saving. Students already enrolled in the new year are left as they are.
//   STUDENT_UPDATE (same as managing classes and academic years)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { Loaded } from '@/lib/admin/types';

type Row = Record<string, unknown>;

export interface PromotionClass {
  id: string;
  name_en: string;
  name_am: string;
  grade_level: number;
}

export interface PromotionStudent {
  student_id: string;
  reg_no: string;
  name_en: string;
  name_am: string;
  class_id: string;
  /** Average of approved grades this year; null = no results */
  average: number | null;
  /** Already enrolled in the new year (then left alone) */
  next_class_id: string | null;
}

export interface PromotionData {
  years: { id: string; name: string; start_date: string; is_current: boolean }[];
  from_year_id: string | null;
  to_year_id: string | null;
  from_classes: PromotionClass[];
  to_classes: PromotionClass[];
  students: PromotionStudent[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const toClass = (c: Row): PromotionClass => ({
  id: c.id as string,
  name_en: c.name_en as string,
  name_am: (c.name_am as string) || (c.name_en as string),
  grade_level: Number(c.grade_level),
});

/** From: the chosen year (or the current one). To: the chosen year (or the next one after it). */
export async function loadPromotion(fromYearId?: string, toYearId?: string): Promise<Loaded<PromotionData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    const years = ((await db.from('academic_years').select('id, name, start_date, is_current').order('start_date').then(check)) as Row[]).map((y) => ({
      id: y.id as string,
      name: y.name as string,
      start_date: y.start_date as string,
      is_current: Boolean(y.is_current),
    }));
    const from = years.find((y) => y.id === fromYearId) ?? years.find((y) => y.is_current) ?? years.at(-1) ?? null;
    const to = years.find((y) => y.id === toYearId && y.id !== from?.id) ?? years.find((y) => from && y.start_date > from.start_date) ?? null;
    if (!from) return { mode: 'live', data: { years, from_year_id: null, to_year_id: null, from_classes: [], to_classes: [], students: [] } };

    const [fromClasses, toClasses, enrollments, nextEnrollments, grades] = await Promise.all([
      db.from('classes').select('id, name_en, name_am, grade_level').eq('academic_year_id', from.id).order('grade_level').order('name_en').then(check) as Promise<Row[]>,
      to
        ? (db.from('classes').select('id, name_en, name_am, grade_level').eq('academic_year_id', to.id).order('grade_level').order('name_en').then(check) as Promise<Row[]>)
        : Promise.resolve([] as Row[]),
      selectAll<Row>((a, b) =>
        db.from('enrollments')
          .select('student_id, class_id, student:students(reg_no, status, person:persons!students_person_id_fkey(full_name_en, full_name_am))')
          .eq('academic_year_id', from.id)
          .eq('status', 'ACTIVE')
          .order('student_id')
          .range(a, b)
      ),
      to
        ? selectAll<Row>((a, b) => db.from('enrollments').select('student_id, class_id').eq('academic_year_id', to.id).order('student_id').range(a, b))
        : Promise.resolve([] as Row[]),
      selectAll<Row>((a, b) =>
        db.from('grades').select('student_id, total_score').eq('academic_year_id', from.id).eq('status', 'APPROVED').order('id').range(a, b)
      ),
    ]);

    const totals = new Map<string, number[]>();
    for (const g of grades) totals.set(g.student_id as string, [...(totals.get(g.student_id as string) ?? []), Number(g.total_score)]);
    const nextOf = new Map(nextEnrollments.map((e) => [e.student_id as string, e.class_id as string]));
    const students: PromotionStudent[] = enrollments
      .filter((e) => (e.student as Row | null)?.status === 'ACTIVE')
      .map((e) => {
        const s = e.student as Row;
        const p = (s.person ?? {}) as Record<string, string | null>;
        const list = totals.get(e.student_id as string);
        return {
          student_id: e.student_id as string,
          reg_no: s.reg_no as string,
          name_en: p.full_name_en ?? '',
          name_am: p.full_name_am || p.full_name_en || '',
          class_id: e.class_id as string,
          average: list?.length ? round1(list.reduce((sum, n) => sum + n, 0) / list.length) : null,
          next_class_id: nextOf.get(e.student_id as string) ?? null,
        };
      })
      .sort((a, b) => a.name_en.localeCompare(b.name_en));

    return {
      mode: 'live',
      data: {
        years,
        from_year_id: from.id,
        to_year_id: to?.id ?? null,
        from_classes: fromClasses.map(toClass),
        to_classes: toClasses.map(toClass),
        students,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

/** Give the new year the same classes as this one (names, grade levels, capacity, room; no teachers yet). */
export async function copyClasses(fromYearId: string, toYearId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    if (fromYearId === toYearId) throw new Error('Choose two different years');
    const [source, existing] = await Promise.all([
      db.from('classes').select('name_en, name_am, grade_level, capacity, room').eq('academic_year_id', fromYearId).then(check) as Promise<Row[]>,
      db.from('classes').select('name_en').eq('academic_year_id', toYearId).then(check) as Promise<Row[]>,
    ]);
    const taken = new Set(existing.map((c) => (c.name_en as string).toLowerCase()));
    const rows = source
      .filter((c) => !taken.has((c.name_en as string).toLowerCase()))
      .map((c) => ({ academic_year_id: toYearId, name_en: c.name_en, name_am: c.name_am, grade_level: c.grade_level, capacity: c.capacity, room: c.room }));
    if (rows.length) await db.from('classes').insert(rows).then(check);
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const DecisionSchema = z
  .array(z.object({ student_id: z.string().min(1), class_id: z.string().min(1) }))
  .max(5000);

/** Enroll the students in their new classes. Students already enrolled in that year are skipped. */
export async function applyPromotion(toYearId: string, decisions: z.input<typeof DecisionSchema>): Promise<{ ok: true; enrolled: number } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('STUDENT_UPDATE');
    const list = DecisionSchema.parse(decisions);
    if (list.length === 0) throw new Error('Nobody to enroll');
    const valid = new Set(((await db.from('classes').select('id').eq('academic_year_id', toYearId).then(check)) as Row[]).map((c) => c.id as string));
    if (list.some((d) => !valid.has(d.class_id))) throw new Error('A chosen class is not in the new year');
    const already = new Set(
      (await selectAll<Row>((a, b) => db.from('enrollments').select('student_id').eq('academic_year_id', toYearId).order('student_id').range(a, b))).map((e) => e.student_id as string)
    );
    const rows = list.filter((d) => !already.has(d.student_id)).map((d) => ({ student_id: d.student_id, class_id: d.class_id, academic_year_id: toYearId, status: 'ACTIVE' }));
    for (let i = 0; i < rows.length; i += 500) await db.from('enrollments').insert(rows.slice(i, i + 500)).then(check);
    return { ok: true, enrolled: rows.length };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
