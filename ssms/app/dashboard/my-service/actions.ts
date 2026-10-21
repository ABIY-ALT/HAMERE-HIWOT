'use server';

// ─────────────────────────────────────────────────────────────────────────────
// "My service" — a member's own service roster, rehearsal attendance and the
// vestments they hold (migration 037). Any signed-in person sees only theirs.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorizeIn, errorMessage } from '@/lib/auth/authorize';
import { answerAssignment, myService, type MyService } from '@/lib/choir/service-core';
import type { ActionResult, Loaded } from '@/lib/admin/types';

const missing = (msg: string) =>
  /service_roster|vestment|roster_status/.test(msg) ? 'The service roster is not set up yet (database migration 037)' : msg;

export async function loadMyService(): Promise<Loaded<MyService>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me, db } = await authorizeIn('sacred_arts');
    return { mode: 'live', data: await myService(db, me.person.id) };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

/** I will serve / I can't come (with a reason). */
export async function answerMyService(assignmentId: string, response: 'CONFIRMED' | 'DECLINED', note: string): Promise<ActionResult> {
  try {
    const { me, db } = await authorizeIn('sacred_arts');
    const res = await answerAssignment(
      db,
      z.string().min(1).parse(assignmentId),
      [me.person.id],
      z.enum(['CONFIRMED', 'DECLINED']).parse(response),
      z.string().max(1000).parse(note)
    );
    return res.ok ? { ok: true } : res;
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}
