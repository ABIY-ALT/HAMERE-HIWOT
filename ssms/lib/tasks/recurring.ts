// ─────────────────────────────────────────────────────────────────────────────
// Repeating tasks (server only — never import from a client component).
//
// The next task of a series is given on its issue day (due date minus
// ISSUE_BEFORE) by the daily automation (lib/automation/jobs), or earlier the
// first time anyone loads the Tasks page or the notification bell that day.
// (series_id, due_date) is unique, so two of them at once cannot create it
// twice. If a whole period passed without either (no daily timer set up and
// nobody signed in), that period is skipped rather than given late.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyLater } from '@/lib/push/send';
import { addDays } from '@/lib/hr/types';
import { todayIso } from '@/lib/utils/ethiopian-calendar';
import { ISSUE_BEFORE, nextDue, type Frequency } from './types';

type SeriesRow = {
  id: string;
  title: string;
  details: string | null;
  from_unit_id: string | null;
  unit_id: string;
  source: string;
  meeting_title: string | null;
  meeting_date: string | null;
  decision_ref: string | null;
  priority: string;
  frequency: Frequency;
  next_due: string;
  created_by: string;
};

const LONGEST_LEAD = Math.max(...Object.values(ISSUE_BEFORE));

/** Gives every repeating task whose issue day has come; returns how many were given. Quietly does nothing before migration 020. */
export async function issueRepeatingTasks(db: SupabaseClient): Promise<number> {
  const today = todayIso();
  const { data, error } = await db.from('task_series')
    .select('id, title, details, from_unit_id, unit_id, source, meeting_title, meeting_date, decision_ref, priority, frequency, next_due, created_by')
    .eq('is_active', true)
    .lte('next_due', addDays(today, LONGEST_LEAD));
  if (error || !data?.length) return 0;
  let given = 0;

  for (const s of data as SeriesRow[]) {
    const lead = ISSUE_BEFORE[s.frequency];
    if (addDays(s.next_due, -lead) > today) continue;
    let due = s.next_due;
    while (addDays(nextDue(due, s.frequency), -lead) <= today) due = nextDue(due, s.frequency);

    const { data: created, error: insertError } = await db.from('tasks')
      .upsert(
        {
          title: s.title,
          details: s.details,
          from_unit_id: s.from_unit_id,
          unit_id: s.unit_id,
          source: s.source,
          meeting_title: s.meeting_title,
          meeting_date: s.meeting_date,
          decision_ref: s.decision_ref,
          priority: s.priority,
          due_date: due,
          created_by: s.created_by,
          series_id: s.id,
        },
        { onConflict: 'series_id,due_date', ignoreDuplicates: true }
      )
      .select('id, task_no');
    if (insertError) {
      console.error('repeating task not given:', insertError.message);
      continue;
    }
    // Only the request that moved next_due on wins; a parallel one changes nothing.
    await db.from('task_series').update({ next_due: nextDue(due, s.frequency) }).eq('id', s.id).eq('next_due', s.next_due);

    for (const row of (created ?? []) as { id: string; task_no: string }[]) {
      given += 1;
      notifyLater(
        { units: { ids: [s.unit_id], holding: 'TASK_REPORT' } },
        { title: 'አዲስ ተግባር · New task', body: `${row.task_no} — ${s.title} · ${due}`, url: '/dashboard/tasks', tag: `task-${row.id}` }
      );
    }
  }
  return given;
}
