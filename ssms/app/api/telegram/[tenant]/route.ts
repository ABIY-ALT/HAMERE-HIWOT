// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telegram/<slug> — a Sunday school's own Telegram bot. The secret
// header must match that Sunday school's bot token, so one school's bot can
// never act for another. The work is in lib/telegram/webhook.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { tenantBySlug } from '@/lib/tenant/context';
import { handleTelegramWebhook } from '@/lib/telegram/webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  if (!isSupabaseEnabled()) return new NextResponse('Not set up', { status: 404 });
  const tenant = await tenantBySlug((await params).tenant);
  if (!tenant) return new NextResponse('Not found', { status: 404 });
  return handleTelegramWebhook(request, tenant.id);
}
