// ─────────────────────────────────────────────────────────────────────────────
// GET or POST /api/cron — the daily automation (lib/automation/jobs). An
// outside timer (cron-job.org, a GitHub Actions schedule, a Render cron job…)
// calls it once a day, early morning Ethiopian time, with the CRON_SECRET
// setting as either
//   Authorization: Bearer <CRON_SECRET>      (preferred)
//   /api/cron?key=<CRON_SECRET>              (for timers that cannot set headers)
// It answers at once and works after the answer, so a timer that gives up
// after 30 seconds still counts as a success; ?wait=1 waits and returns what
// each job did. The results also show under Administration → Automation.
// ─────────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { runDaily } from '@/lib/automation/jobs';

export const dynamic = 'force-dynamic';

function allowed(request: Request, secret: string): boolean {
  const url = new URL(request.url);
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('key') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const secret = env.cronSecret();
  if (!secret || !isSupabaseEnabled()) return new NextResponse('Not set up', { status: 404 });
  if (!allowed(request, secret)) return new NextResponse('Forbidden', { status: 401 });

  const db = createAdminClient();
  if (new URL(request.url).searchParams.get('wait') === '1') {
    return NextResponse.json(await runDaily(db, 'timer'), { headers: { 'Cache-Control': 'no-store' } });
  }
  after(async () => {
    try {
      await runDaily(db, 'timer');
    } catch (e) {
      console.error('daily automation failed', e);
    }
  });
  return NextResponse.json({ started: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = handle;
export const POST = handle;
