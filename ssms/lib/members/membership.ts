// ─────────────────────────────────────────────────────────────────────────────
// Who is a member — server only. Everyone is a row in `persons`, students and
// parents too. Two kinds of rows are not members:
//   • students who are only students. A student who was also registered with
//     the member form (membership_type set, migration 021) is BOTH, and stays
//     in every member list: members, dues and the bot's "I paid", reports,
//     departments, choir, HR, programs, property, donations…
//   • parents' records made only for their login (is_guardian_only, 025).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/auth/authorize';

/** Before migrations 021/025 the columns are missing: then nobody matches. */
async function optional<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch {
    return [];
  }
}

const persons = (db: SupabaseClient, personIds?: string[]) =>
  personIds ? db.from('persons').select('id').in('id', personIds) : db.from('persons').select('id');

/** Students who are only students — not also registered as members (all, or among `personIds`). */
export async function studentOnlyIds(db: SupabaseClient, personIds?: string[]): Promise<Set<string>> {
  if (personIds && personIds.length === 0) return new Set();
  const [students, registered] = await Promise.all([
    selectAll<{ person_id: string }>((a, b) =>
      (personIds ? db.from('students').select('person_id').in('person_id', personIds) : db.from('students').select('person_id')).order('id').range(a, b)
    ),
    optional(() => selectAll<{ id: string }>((a, b) => persons(db, personIds).not('membership_type', 'is', null).order('id').range(a, b))),
  ]);
  const members = new Set(registered.map((p) => p.id));
  return new Set(students.map((s) => s.person_id).filter((id) => !members.has(id)));
}

/** The people in `persons` who are not members: student-only records and parents' login records. */
export async function nonMemberIds(db: SupabaseClient, personIds?: string[]): Promise<Set<string>> {
  if (personIds && personIds.length === 0) return new Set();
  const [studentOnly, parents] = await Promise.all([
    studentOnlyIds(db, personIds),
    optional(() => selectAll<{ id: string }>((a, b) => persons(db, personIds).eq('is_guardian_only', true).order('id').range(a, b))),
  ]);
  return new Set([...studentOnly, ...parents.map((p) => p.id)]);
}
