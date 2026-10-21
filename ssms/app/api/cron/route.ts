// ─────────────────────────────────────────────────────────────────────────────
// GET or POST /api/cron — the daily run. An outside timer (cron-job.org, a
// GitHub Actions schedule, a Render cron job…) calls it once a day, early
// morning Ethiopian time, with the CRON_SECRET setting as either
//   Authorization: Bearer <CRON_SECRET>      (preferred)
//   /api/cron?key=<CRON_SECRET>              (for timers that cannot set headers)
// First billing (lib/billing/service runBillingDaily: trials and periods that
// ended, renewal invoices, usage snapshots), then for each Sunday school that
// is paid up: its automation (lib/automation/jobs) when its plan includes it,
// otherwise just its repeating tasks. Each Sunday school runs on its own, with
// a client held to it, so one failing does not stop the others.
// It answers at once and works after the answer, so a timer that gives up
// after 30 seconds still counts as a success; ?wait=1 waits and returns what
// each part did. Each Sunday school's results also show under
// Administration → Automation.
// ─────────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { env } from '@/lib/env';
import { runDaily } from '@/lib/automation/jobs';
import { issueRepeatingTasks } from '@/lib/tasks/recurring';
import { runBillingDaily } from '@/lib/billing/service';
import { platformClient, tenantClient } from '@/lib/tenant/db';
import { loadTenantAccess } from '@/lib/tenant/context';
import { runInTenant } from '@/lib/tenant/scope';

export const dynamic = 'force-dynamic';

function allowed(request: Request, secret: string): boolean {
  const url = new URL(request.url);
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('key') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function runAll() {
  const billing = await runBillingDaily().catch((e) => {
    console.error('billing run failed', e);
    return { error: e instanceof Error ? e.message : 'failed' };
  });
  const { data: tenants, error } = await platformClient().from('tenants').select('id, slug').eq('status', 'ACTIVE');
  if (error) throw new Error(error.message);
  const schools: Record<string, unknown> = {};
  for (const t of (tenants ?? []) as { id: string; slug: string }[]) {
    try {
      const access = await loadTenantAccess(t.id);
      if (access.mode !== 'full') {
        schools[t.slug] = 'skipped (not paid up)';
        continue;
      }
      schools[t.slug] = await runInTenant(t.id, async () => {
        const db = tenantClient(t.id);
        if (access.modules.includes('automation')) return runDaily(db, 'timer');
        if (access.modules.includes('tasks')) return { repeating_tasks: await issueRepeatingTasks(db) };
        return 'nothing to run';
      });
    } catch (e) {
      console.error(`daily run failed for ${t.slug}`, e);
      schools[t.slug] = { error: e instanceof Error ? e.message : 'failed' };
    }
  }
  return { billing, schools };
}

async function handle(request: Request) {
  const secret = env.cronSecret();
  if (!secret || !isSupabaseEnabled()) return new NextResponse('Not set up', { status: 404 });
  if (!allowed(request, secret)) return new NextResponse('Forbidden', { status: 401 });

  if (new URL(request.url).searchParams.get('wait') === '1') {
    return NextResponse.json(await runAll(), { headers: { 'Cache-Control': 'no-store' } });
  }
  after(async () => {
    try {
      await runAll();
    } catch (e) {
      console.error('daily run failed', e);
    }
  });
  return NextResponse.json({ started: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = handle;
export const POST = handle;
