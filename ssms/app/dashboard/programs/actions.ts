'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Programs, assemblies & events. Create: PROGRAM_CREATE (or MANAGE).
// Change / confirm / complete / cancel: PROGRAM_MANAGE, or the person who
// created the program.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import { nonMemberIds } from '@/lib/members/membership';
import type { SessionUser } from '@/lib/auth/session';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type { Program, ProgramOptions, ProgramStatus, ProgramType } from '@/lib/programs/types';
import { refreshPublicSite } from '@/lib/site/cache';

type Row = Record<string, unknown> & { id: string };
type Db = Awaited<ReturnType<typeof authorize>>['db'];

export async function loadPrograms(): Promise<Loaded<{ programs: Program[] } & ProgramOptions>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('PROGRAM_VIEW', 'AUDIT_VIEW_ALL');
    const [rows, units, persons, notMembers] = await Promise.all([
      selectAll<Row>((a, b) =>
        db.from('programs')
          .select('*, unit:organization_units(name_en, name_am), coordinator:persons!programs_coordinator_person_id_fkey(full_name_en)')
          .order('start_date', { ascending: false })
          .order('id')
          .range(a, b)
      ),
      db.from('organization_units').select('id, name_en, name_am').eq('is_active', true).order('sort_order').then(check) as Promise<ProgramOptions['units']>,
      selectAll<{ id: string; full_name_en: string }>((a, b) =>
        db.from('persons').select('id, full_name_en').eq('status', 'ACTIVE').order('full_name_en').order('id').range(a, b)
      ),
      // Students who are also members stay; student-only and parents' login records do not
      nonMemberIds(db),
    ]);
    
    const programs: Program[] = rows.map((p) => {
      const unit = (p.unit ?? null) as { name_en?: string; name_am?: string | null } | null;
      return {
        id: p.id,
        title_en: p.title_en as string,
        title_am: (p.title_am as string) || (p.title_en as string),
        type: p.program_type as ProgramType,
        unit_id: (p.organization_unit_id as string) ?? null,
        unit: unit?.name_en ?? '',
        unit_am: unit?.name_am || unit?.name_en || '',
        start_date: p.start_date as string,
        start_time: ((p.start_time as string) ?? '').slice(0, 5),
        end_date: (p.end_date as string) ?? null,
        location: (p.location as string) ?? '',
        coordinator_id: (p.coordinator_person_id as string) ?? null,
        coordinator: ((p.coordinator as { full_name_en?: string } | null)?.full_name_en) ?? '',
        expected: (p.expected_participants as number) ?? null,
        actual: (p.actual_participants as number) ?? null,
        description: (p.description as string) ?? '',
        is_public: Boolean(p.is_public),
        outcome: (p.outcome_notes as string) ?? '',
        status: p.status as ProgramStatus,
        created_by_id: (p.created_by as string) ?? null,
      };
    });

    return {
      mode: 'live',
      data: {
        programs,
        units,
        people: persons.filter((p) => !notMembers.has(p.id)).map((p) => ({ id: p.id, name: p.full_name_en })),
      },
    };
  } catch (e) {
    const msg = errorMessage(e);
    return { mode: 'error', error: msg.includes('programs') ? 'Run database migration 013 (programs) first' : msg };
  }
}

const optionalDate = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date');
const count = z.union([z.literal(''), z.coerce.number().int().min(0).max(100_000)]);

const ProgramSchema = z
  .object({
    title_en: z.string().trim().min(3, 'Enter the title in English'),
    title_am: z.string().trim(),
    type: z.enum(['ASSEMBLY', 'CONFERENCE', 'HOLIDAY', 'SERVICE', 'TRAINING', 'ACADEMIC', 'OUTREACH', 'OTHER']),
    unit_id: z.string(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date'),
    start_time: z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Use a valid time'),
    end_date: optionalDate,
    location: z.string().trim(),
    coordinator_id: z.string(),
    expected: count,
    description: z.string().trim(),
    is_public: z.boolean(),
  })
  .refine((p) => !p.end_date || p.end_date >= p.start_date, 'The end date cannot be before the start date');

export type ProgramInput = z.input<typeof ProgramSchema>;

function fields(p: z.output<typeof ProgramSchema>) {
  return {
    title_en: p.title_en,
    title_am: p.title_am || null,
    program_type: p.type,
    organization_unit_id: p.unit_id || null,
    start_date: p.start_date,
    start_time: p.start_time || null,
    end_date: p.end_date || null,
    location: p.location || null,
    coordinator_person_id: p.coordinator_id || null,
    expected_participants: p.expected === '' ? null : p.expected,
    description: p.description || null,
    is_public: p.is_public,
  };
}

/** Program managers may change any program; others only the ones they created. */
async function editable(db: Db, me: SessionUser, id: string) {
  const row = (await db.from('programs').select('id, status, created_by').eq('id', id).single().then(check)) as {
    id: string; status: ProgramStatus; created_by: string | null;
  };
  if (!me.permissions.includes('PROGRAM_MANAGE') && row.created_by !== me.systemUser.id) {
    throw new Error('Only the person who created this program or a program manager can change it');
  }
  return row;
}

export async function saveProgram(id: string | null, input: ProgramInput): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const p = ProgramSchema.parse(input);
    const save = async (values: Partial<ReturnType<typeof fields>>) => {
      if (id) {
        const row = await editable(db, me, id);
        if (row.status === 'COMPLETED' || row.status === 'CANCELLED') throw new Error('A completed or cancelled program cannot be edited');
        return db.from('programs').update(values).eq('id', id);
      }
      return db.from('programs').insert({ ...values, status: 'PLANNED', created_by: me.systemUser.id });
    };
    const res = await save(fields(p));
    // Before migration 038 there is no is_public: save the rest, and say so only if it was asked for
    if (res.error && /is_public/.test(res.error.message)) {
      const rest: Partial<ReturnType<typeof fields>> = fields(p);
      delete rest.is_public;
      await save(rest).then(check);
      if (p.is_public) throw new Error('Saved, but “Show on the public website” needs database migration 038 first');
    } else check(res);
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const OutcomeSchema = z.object({
  actual: z.coerce.number().int().min(0, 'Enter how many attended').max(100_000),
  outcome: z.string().trim(),
});

export async function setProgramStatus(
  id: string,
  status: Exclude<ProgramStatus, 'PLANNED'>,
  outcome?: z.input<typeof OutcomeSchema>
): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('PROGRAM_CREATE', 'PROGRAM_MANAGE');
    const row = await editable(db, me, id);
    if (row.status === 'COMPLETED' || row.status === 'CANCELLED') throw new Error('This program is already closed');

    if (status === 'COMPLETED') {
      const o = OutcomeSchema.parse(outcome ?? {});
      await db.from('programs').update({ status, actual_participants: o.actual, outcome_notes: o.outcome || null }).eq('id', id).then(check);
    } else if (status === 'CONFIRMED' || status === 'CANCELLED') {
      await db.from('programs').update({ status }).eq('id', id).then(check);
    } else {
      throw new Error('Invalid status');
    }
    refreshPublicSite();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
