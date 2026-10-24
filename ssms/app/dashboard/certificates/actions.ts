'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Spiritual courses, completions and certificates (migration 045).
//   see                                  MEMBER_VIEW or STUDENT_VIEW
//   courses, completions, certificates   MEMBER_UPDATE or STUDENT_UPDATE
// A certificate keeps the name and wording it was printed with; one given in
// error is revoked with a reason (its /verify page then says so), never deleted.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import { notifyPersonsLater } from '@/lib/push/send';
import {
  fillReason,
  type Certificate,
  type CertificateKind,
  type CertificatesData,
  type Completion,
  type CompletionResult,
  type Course,
  type CourseKind,
  type PersonOption,
} from '@/lib/certificates/types';

type Row = Record<string, unknown> & { id: string };
type PersonRow = { full_name_en: string; full_name_am: string | null; membership_code: string } | null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'Unknown record');
const MANAGE = ['MEMBER_UPDATE', 'STUDENT_UPDATE'] as const;
const canManage = (me: SessionUser) => MANAGE.some((p) => me.permissions.includes(p));

const MIGRATION = 'Run database migration 045 (spiritual life, certificates, inbox) first';
const friendly = (e: unknown) => {
  const msg = errorMessage(e);
  return /spiritual_courses|course_completions|certificates/.test(msg) && /schema cache|does not exist|Could not find/.test(msg) ? MIGRATION : msg;
};

function schoolOf(me: SessionUser): [string, string] {
  return me.tenant.is_default
    ? ['Hamere Hiwot Sunday School · Sallo Debre Tsehay St. George Church', 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት · ሳሎ ደብረ ፀሐይ ቅዱስ ጊዮርጊስ ቤተክርስቲያን']
    : [me.tenant.name_en, me.tenant.name_am || me.tenant.name_en];
}

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadCertificates(): Promise<Loaded<CertificatesData>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorize('MEMBER_VIEW', 'STUDENT_VIEW', ...MANAGE);
    const [courseRows, completionRows, certRows] = await Promise.all([
      db.from('spiritual_courses').select('*').order('name_en').then(check) as Promise<Row[]>,
      selectAll<Row>((a, b) =>
        db.from('course_completions')
          .select('id, course_id, person_id, completed_on, result, note, person:persons!course_completions_person_fkey(full_name_en, full_name_am, membership_code)')
          .order('completed_on', { ascending: false })
          .order('id')
          .range(a, b)
      ),
      selectAll<Row>((a, b) =>
        db.from('certificates')
          .select('*, issuer:system_users!certificates_issued_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
          .order('issued_on', { ascending: false })
          .order('certificate_no', { ascending: false })
          .range(a, b)
      ),
    ]);

    const certByCompletion = new Map(certRows.filter((c) => c.completion_id && !c.revoked_at).map((c) => [c.completion_id as string, c.certificate_no as string]));
    const completions: Completion[] = completionRows.map((r) => {
      const p = r.person as PersonRow;
      return {
        id: r.id,
        course_id: r.course_id as string,
        person_id: r.person_id as string,
        name: p?.full_name_en ?? '—',
        name_am: p?.full_name_am || p?.full_name_en || '—',
        code: p?.membership_code ?? '',
        completed_on: r.completed_on as string,
        result: r.result as CompletionResult,
        note: (r.note as string) ?? '',
        certificate_no: certByCompletion.get(r.id) ?? '',
      };
    });
    const courses: Course[] = courseRows.map((c) => ({
      id: c.id,
      name_en: c.name_en as string,
      name_am: (c.name_am as string) ?? '',
      kind: c.kind as CourseKind,
      hours: c.hours == null ? null : Number(c.hours),
      description: (c.description as string) ?? '',
      is_active: Boolean(c.is_active),
      completed: completions.filter((x) => x.course_id === c.id).length,
    }));
    const certificates: Certificate[] = certRows.map((c) => ({
      id: c.id,
      certificate_no: c.certificate_no as string,
      verify_code: c.verify_code as string,
      person_id: (c.person_id as string) ?? null,
      person_name_en: c.person_name_en as string,
      person_name_am: (c.person_name_am as string) || (c.person_name_en as string),
      kind: c.kind as CertificateKind,
      title_en: c.title_en as string,
      title_am: (c.title_am as string) ?? '',
      reason_en: (c.reason_en as string) ?? '',
      reason_am: (c.reason_am as string) ?? '',
      issued_on: c.issued_on as string,
      revoked_at: (c.revoked_at as string) ?? null,
      revoked_reason: (c.revoked_reason as string) ?? '',
      issued_by: (c.issuer as { person?: { full_name_en?: string } } | null)?.person?.full_name_en ?? '',
    }));
    return { mode: 'live', data: { courses, completions, certificates, school: schoolOf(me), canManage: canManage(me) } };
  } catch (e) {
    return { mode: 'error', error: friendly(e) };
  }
}

/** Members and students by name, code or phone */
export async function findPeople(q: string): Promise<{ ok: true; people: PersonOption[] } | { ok: false; error: string }> {
  try {
    const { db } = await authorize(...MANAGE);
    const term = q.trim().replace(/[%,()]/g, ' ').trim();
    if (term.length < 2) return { ok: true, people: [] };
    const { data, error } = await db.from('persons')
      .select('id, full_name_en, full_name_am, membership_code, phone_primary')
      .eq('status', 'ACTIVE')
      .or(`full_name_en.ilike.%${term}%,full_name_am.ilike.%${term}%,membership_code.ilike.%${term}%,phone_primary.ilike.%${term}%`)
      .order('full_name_en')
      .limit(25);
    if (error) throw new Error(error.message);
    return {
      ok: true,
      people: ((data ?? []) as { id: string; full_name_en: string; full_name_am: string | null; membership_code: string; phone_primary: string | null }[]).map((p) => ({
        id: p.id,
        name: p.full_name_en,
        name_am: p.full_name_am || p.full_name_en,
        code: p.membership_code,
        phone: p.phone_primary ?? '',
      })),
    };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Courses ──────────────────────────────────────────────────────────────────

const CourseSchema = z.object({
  id: z.string(),
  name_en: z.string().trim().min(2, 'Enter the course name'),
  name_am: z.string().trim(),
  kind: z.enum(['COURSE', 'TRAINING', 'SEMINAR', 'RETREAT', 'OTHER']),
  hours: z.union([z.literal(''), z.coerce.number().positive().max(10000)]),
  description: z.string().trim().max(1000),
  is_active: z.boolean(),
});

export async function saveCourse(input: z.input<typeof CourseSchema>): Promise<ActionResult> {
  try {
    const { me, db } = await authorize(...MANAGE);
    const c = CourseSchema.parse(input);
    const fields = { name_en: c.name_en, name_am: c.name_am || null, kind: c.kind, hours: c.hours === '' ? null : c.hours, description: c.description || null, is_active: c.is_active };
    const { error } = c.id
      ? await db.from('spiritual_courses').update(fields).eq('id', uuid.parse(c.id))
      : await db.from('spiritual_courses').insert({ ...fields, created_by: me.systemUser.id });
    if (error) throw new Error(/spiritual_courses_tid_name_key/.test(error.message) ? 'A course with this name already exists' : error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize(...MANAGE);
    const { count } = await db.from('course_completions').select('id', { count: 'exact', head: true }).eq('course_id', uuid.parse(id));
    if (count) throw new Error('People have completed this course — make it inactive instead');
    await db.from('spiritual_courses').delete().eq('id', id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Completions ──────────────────────────────────────────────────────────────

const CompletionSchema = z.object({
  course_id: uuid,
  person_ids: z.array(uuid).min(1, 'Choose at least one person').max(500),
  completed_on: isoDate,
  result: z.enum(['COMPLETED', 'PASSED', 'ATTENDED']),
  note: z.string().trim().max(300),
});

/** Records that these people completed the course (people already recorded are left as they are). */
export async function recordCompletions(input: z.input<typeof CompletionSchema>): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize(...MANAGE);
    const c = CompletionSchema.parse(input);
    const rows = (await db.from('course_completions')
      .upsert(
        c.person_ids.map((person_id) => ({
          course_id: c.course_id,
          person_id,
          completed_on: c.completed_on,
          result: c.result,
          note: c.note || null,
          recorded_by: me.systemUser.id,
        })),
        { onConflict: 'tenant_id,course_id,person_id', ignoreDuplicates: true }
      )
      .select('id')
      .then(check)) as { id: string }[];
    return { ok: true, added: rows.length };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function removeCompletion(id: string): Promise<ActionResult> {
  try {
    const { db } = await authorize(...MANAGE);
    const { count } = await db.from('certificates').select('id', { count: 'exact', head: true }).eq('completion_id', uuid.parse(id)).is('revoked_at', null);
    if (count) throw new Error('A certificate was given for this — revoke it first');
    await db.from('course_completions').delete().eq('id', id).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

// ── Certificates ─────────────────────────────────────────────────────────────

const IssueSchema = z
  .object({
    kind: z.enum(['COURSE', 'GRADUATION', 'SERVICE', 'MEMBERSHIP', 'APPRECIATION', 'OTHER']),
    /** One certificate per person… */
    person_ids: z.array(uuid).max(500),
    /** …or one per course completion (the course name goes into the wording) */
    completion_ids: z.array(uuid).max(500),
    title_en: z.string().trim().min(3, 'Enter the title').max(120),
    title_am: z.string().trim().max(120),
    /** "{x}" is replaced by the course name for completions */
    reason_en: z.string().trim().max(300),
    reason_am: z.string().trim().max(300),
    issued_on: isoDate,
  })
  .refine((i) => i.person_ids.length + i.completion_ids.length > 0, 'Choose who receives a certificate');

export type IssueInput = z.input<typeof IssueSchema>;

export async function issueCertificates(input: IssueInput): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  try {
    const { me, db } = await authorize(...MANAGE);
    const i = IssueSchema.parse(input);

    type Target = { person_id: string; completion_id: string | null; x_en: string; x_am: string };
    const targets: Target[] = i.person_ids.map((person_id) => ({ person_id, completion_id: null, x_en: '', x_am: '' }));
    if (i.completion_ids.length) {
      const rows = (await db.from('course_completions')
        .select('id, person_id, course:spiritual_courses!course_completions_course_fkey(name_en, name_am)')
        .in('id', i.completion_ids)
        .then(check)) as unknown as { id: string; person_id: string; course: { name_en: string; name_am: string | null } | null }[];
      const given = (await db.from('certificates').select('completion_id').in('completion_id', i.completion_ids).is('revoked_at', null).then(check)) as { completion_id: string }[];
      const done = new Set(given.map((g) => g.completion_id));
      for (const r of rows) {
        if (done.has(r.id)) continue;
        targets.push({ person_id: r.person_id, completion_id: r.id, x_en: r.course?.name_en ?? '', x_am: r.course?.name_am || r.course?.name_en || '' });
      }
    }
    if (targets.length === 0) throw new Error('Everyone chosen already has a certificate for this');

    const people = (await db.from('persons').select('id, full_name_en, full_name_am').in('id', [...new Set(targets.map((t) => t.person_id))]).then(check)) as {
      id: string; full_name_en: string; full_name_am: string | null;
    }[];
    const byId = new Map(people.map((p) => [p.id, p]));
    const rows = targets
      .filter((t) => byId.has(t.person_id))
      .map((t) => {
        const p = byId.get(t.person_id)!;
        return {
          person_id: t.person_id,
          person_name_en: p.full_name_en,
          person_name_am: p.full_name_am || null,
          kind: i.kind,
          title_en: i.title_en,
          title_am: i.title_am || null,
          reason_en: fillReason(i.reason_en, t.x_en) || null,
          reason_am: fillReason(i.reason_am, t.x_am) || null,
          issued_on: i.issued_on,
          completion_id: t.completion_id,
          issued_by: me.systemUser.id,
        };
      });
    const created = (await db.from('certificates').insert(rows).select('id, person_id, certificate_no').then(check)) as {
      id: string; person_id: string; certificate_no: string;
    }[];
    for (const c of created) {
      notifyPersonsLater(
        [c.person_id],
        { title: '🎓 የምስክር ወረቀት · Certificate', body: `${i.title_am || i.title_en} — ${c.certificate_no}`, url: '/dashboard', tag: `cert-${c.id}` },
        { link: false }
      );
    }
    return { ok: true, ids: created.map((c) => c.id) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function revokeCertificate(id: string, reason: string): Promise<ActionResult> {
  try {
    const { db } = await authorize(...MANAGE);
    const r = z.string().trim().min(3, 'Write why it is revoked').max(300).parse(reason);
    const done = (await db.from('certificates')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: r })
      .eq('id', uuid.parse(id))
      .is('revoked_at', null)
      .select('id')
      .then(check)) as { id: string }[];
    if (!done.length) throw new Error('This certificate is already revoked');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
