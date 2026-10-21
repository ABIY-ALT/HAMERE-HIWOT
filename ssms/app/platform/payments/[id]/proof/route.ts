// GET /platform/payments/<id>/proof — a payment's receipt (platform admins):
// redirects to a link to the private billing-proofs bucket valid for a minute.

import { NextResponse } from 'next/server';
import { getPlatformAdmin } from '@/lib/platform/auth';
import { paymentProofUrl } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformAdmin())) return new NextResponse('Platform administrators only', { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });
  const url = await paymentProofUrl(id);
  if (!url) return new NextResponse('No receipt', { status: 404 });
  return NextResponse.redirect(url);
}
