// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard/finance/dues/proof/[id] — the receipt photo a member sent
// with "💳 I paid" in the Telegram bot (dues_claims.proof_file_id). Telegram
// keeps the file; this fetches it on the server so the bot token stays secret.
// Finance only.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { tenantClient } from '@/lib/tenant/db';
import { getCurrentUser } from '@/lib/auth/session';
import { telegramFile } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseEnabled()) return new NextResponse('Receipts need the database', { status: 404 });
  const me = await getCurrentUser();
  if (!me) return new NextResponse('Sign in again to see this receipt', { status: 401 });
  if (!me.permissions.includes('FINANCE_VIEW') && !me.permissions.includes('AUDIT_VIEW_ALL')) {
    return new NextResponse('You do not have permission to see finance', { status: 403 });
  }

  const { id } = await params;
  const db = tenantClient(me.tenant.id, { actorId: me.systemUser.id });
  const { data: claim } = await db.from('dues_claims').select('proof_file_id').eq('id', id).maybeSingle();
  const fileId = claim?.proof_file_id as string | null | undefined;
  if (!fileId) return new NextResponse('No receipt photo', { status: 404 });

  const file = await telegramFile(fileId);
  if (!file) return new NextResponse('Could not get the photo from Telegram', { status: 502 });
  return new NextResponse(file.bytes, {
    headers: { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' },
  });
}
