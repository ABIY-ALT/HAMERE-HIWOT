'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Prayer requests from the public website (migration 048) — WEBSITE_MANAGE
// only. NEW → PRAYED (and called back, if they asked) → ARCHIVED.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, check, errorMessage, selectAll } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';

export type PrayerStatus = 'NEW' | 'PRAYED' | 'ARCHIVED';

export interface PrayerRequest {
  id: string;
  name: string;
  phone: string;
  request: string;
  wants_call: boolean;
  status: PrayerStatus;
  handled_by: string;
  handled_at: string | null;
  created_at: string;
}

const MIGRATION = 'Run database migration 048 (hymns on the website, prayer requests) first';
const missing = (m: string) => (/prayer_requests/.test(m) && /does not exist|schema cache|Could not find/.test(m) ? MIGRATION : m);

export async function loadPrayers(): Promise<Loaded<PrayerRequest[]>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { db } = await authorize('WEBSITE_MANAGE');
    const rows = await selectAll<Record<string, unknown>>((a, b) =>
      db.from('prayer_requests')
        .select('id, name, phone, request, wants_call, status, handled_at, created_at, handler:system_users!prayer_requests_handled_by_fkey(person:persons!system_users_person_id_fkey(full_name_en))')
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b)
    );
    return {
      mode: 'live',
      data: rows.map((r) => ({
        id: r.id as string,
        name: (r.name as string) ?? '',
        phone: (r.phone as string) ?? '',
        request: r.request as string,
        wants_call: Boolean(r.wants_call),
        status: r.status as PrayerStatus,
        handled_by: ((r.handler as { person?: { full_name_en?: string } | null } | null)?.person?.full_name_en) ?? '',
        handled_at: (r.handled_at as string) ?? null,
        created_at: r.created_at as string,
      })),
    };
  } catch (e) {
    return { mode: 'error', error: missing(errorMessage(e)) };
  }
}

export async function setPrayerStatus(id: string, status: PrayerStatus): Promise<ActionResult> {
  try {
    const { me, db } = await authorize('WEBSITE_MANAGE');
    await db.from('prayer_requests')
      .update(status === 'NEW' ? { status, handled_by: null, handled_at: null } : { status, handled_by: me.systemUser.id, handled_at: new Date().toISOString() })
      .eq('id', z.string().regex(/^[0-9a-f-]{36}$/i).parse(id))
      .then(check);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: missing(errorMessage(e)) };
  }
}
