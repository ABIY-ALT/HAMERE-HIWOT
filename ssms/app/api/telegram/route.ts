// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telegram — the default Sunday school's bot (the address set up
// before Sunday schools had their own bots). Other Sunday schools' bots call
// /api/telegram/<slug>. The work is in lib/telegram/webhook.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { defaultTenant } from '@/lib/tenant/context';
import { handleTelegramWebhook } from '@/lib/telegram/webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSupabaseEnabled()) return new NextResponse('Not set up', { status: 404 });
  const tenant = await defaultTenant();
  if (!tenant) return new NextResponse('Not set up', { status: 404 });
  return handleTelegramWebhook(request, tenant.id);
}
