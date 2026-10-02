'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Members (persons) server actions. Students are persons too, but they are
// managed on the Students page and left out of the members registry.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { Person } from '@/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';

const MEMBER_COLUMNS =
  'id, membership_code, full_name_en, full_name_am, baptismal_name, gender, date_of_birth, phone_primary, phone_secondary, email, address, emergency_contact_name, emergency_contact_phone, father_of_confession, profile_photo_url, status, notes, created_at, updated_at';

export async function loadMembers(): Promise<Loaded<Person[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('MEMBER_VIEW', 'AUDIT_VIEW_ALL');
    const [persons, students] = await Promise.all([
      selectAll<Person>((a, b) =>
        db.from('persons').select(MEMBER_COLUMNS).order('created_at', { ascending: false }).order('id').range(a, b)
      ),
      selectAll<{ person_id: string }>((a, b) => db.from('students').select('person_id').order('id').range(a, b)),
    ]);
    const studentPersons = new Set(students.map((s) => s.person_id));
    return { mode: 'live', data: persons.filter((p) => !studentPersons.has(p.id)) };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const optional = z.string().trim().transform((v) => v || null);

const MemberSchema = z.object({
  full_name_en: z.string().trim().min(2, 'Enter the full name in English'),
  full_name_am: optional,
  baptismal_name: optional,
  gender: z.enum(['MALE', 'FEMALE']),
  date_of_birth: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date of birth')
    .transform((v) => v || null),
  phone_primary: optional,
  phone_secondary: optional,
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid e-mail address')
    .transform((v) => v || null),
  address: optional,
  father_of_confession: optional,
  emergency_contact_name: optional,
  emergency_contact_phone: optional,
  notes: optional,
});

const StatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRANSFERRED', 'DECEASED']);

export type MemberInput = z.input<typeof MemberSchema>;

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

export async function createMember(input: MemberInput): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  try {
    const { db } = await authorize('MEMBER_CREATE');
    const m = MemberSchema.parse(input);
    // Two people registering at the same moment can collide on the code — retry once.
    for (let attempt = 0; ; attempt++) {
      const code = await nextMembershipCode(db);
      const { error } = await db.from('persons').insert({ ...m, membership_code: code, status: 'ACTIVE' });
      if (!error) return { ok: true, code };
      if (error.code !== '23505' || attempt > 0) throw new Error(error.message);
    }
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
    const m = MemberSchema.parse(input);
    const status = StatusSchema.parse(input.status);
    await db.from('persons').update({ ...m, status }).eq('id', personId).then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
