// ─────────────────────────────────────────────────────────────────────────────
// The hymns planned for choir sessions (choir_session_hymns), in their order —
// server only. A session (rehearsal, service, performance) can belong to a
// program, so the same list shows on the program's page, on the public
// Events page and in the day-before roster reminder.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HymnCategory } from './types';

export interface PlannedHymn {
  id: string;
  title_am: string;
  title_en: string;
  category: HymnCategory;
  /** On the public website's Hymns page (048) */
  on_website: boolean;
}

export interface SessionHymns {
  session_id: string;
  program_id: string | null;
  title: string;
  kind: 'REHEARSAL' | 'SERVICE' | 'PERFORMANCE';
  date: string;
  time: string;
  status: 'PLANNED' | 'HELD' | 'CANCELLED';
  hymns: PlannedHymn[];
}

type SessionRow = {
  id: string;
  program_id: string | null;
  title: string | null;
  kind: SessionHymns['kind'];
  session_date: string;
  start_time: string | null;
  status: SessionHymns['status'];
  hymns: { hymn_id: string; position: number }[] | null;
};

/** Sessions of these programs (or these sessions), soonest first, each with its hymns in order. Cancelled ones are left out. */
export async function hymnsOfSessions(db: SupabaseClient, filter: { programIds?: string[]; sessionIds?: string[] }): Promise<SessionHymns[]> {
  const ids = filter.programIds ?? filter.sessionIds ?? [];
  if (ids.length === 0) return [];
  const { data, error } = await db.from('choir_sessions')
    .select('id, program_id, title, kind, session_date, start_time, status, hymns:choir_session_hymns(hymn_id, position)')
    .in(filter.programIds ? 'program_id' : 'id', ids)
    .neq('status', 'CANCELLED')
    .order('session_date')
    .order('start_time');
  if (error) return [];
  const sessions = (data ?? []) as SessionRow[];
  const hymnIds = [...new Set(sessions.flatMap((s) => (s.hymns ?? []).map((h) => h.hymn_id)))];
  const byId = new Map<string, PlannedHymn>();
  if (hymnIds.length) {
    // on_website comes with migration 048
    let res = await db.from('hymns').select('id, title_am, title_en, category, on_website').in('id', hymnIds);
    if (res.error) res = (await db.from('hymns').select('id, title_am, title_en, category').in('id', hymnIds)) as typeof res;
    for (const h of (res.data ?? []) as { id: string; title_am: string; title_en: string | null; category: HymnCategory; on_website?: boolean }[]) {
      byId.set(h.id, { id: h.id, title_am: h.title_am, title_en: h.title_en ?? '', category: h.category, on_website: Boolean(h.on_website) });
    }
  }
  return sessions.map((s) => ({
    session_id: s.id,
    program_id: s.program_id,
    title: s.title ?? '',
    kind: s.kind,
    date: s.session_date,
    time: (s.start_time ?? '').slice(0, 5),
    status: s.status,
    hymns: [...(s.hymns ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((h) => byId.get(h.hymn_id))
      .filter((h): h is PlannedHymn => Boolean(h)),
  }));
}

/** "1. title · English title" lines, for Telegram messages */
export function hymnLines(hymns: PlannedHymn[]): string[] {
  return hymns.map((h, i) => `${i + 1}. ${h.title_am}${h.title_en && h.title_en !== h.title_am ? ` · ${h.title_en}` : ''}`);
}
