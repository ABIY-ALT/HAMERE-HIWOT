// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard/people/members/photo/[id] — a member's photo (the "ፎቶግራፍ"
// box of the registration form). Checks that the signed-in user may see
// members, then redirects to a link to the private "member-photos" bucket
// that works for five minutes. Under /dashboard so the proxy keeps the
// session fresh.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { tenantClient } from '@/lib/tenant/db';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseEnabled()) return new NextResponse('Photos need the database', { status: 404 });
  const me = await getCurrentUser();
  if (!me) return new NextResponse('Sign in again to see this photo', { status: 401 });
  if (!me.permissions.includes('MEMBER_VIEW') && !me.permissions.includes('AUDIT_VIEW_ALL')) {
    return new NextResponse('You do not have permission to see members', { status: 403 });
  }

  const { id } = await params;
  const db = tenantClient(me.tenant.id, { actorId: me.systemUser.id });
  const { data: person } = await db.from('persons').select('profile_photo_url').eq('id', id).maybeSingle();
  const photo = person?.profile_photo_url as string | null | undefined;
  if (!photo) return new NextResponse('No photo', { status: 404 });
  if (/^https?:/.test(photo)) return NextResponse.redirect(photo);

  const { data, error } = await db.storage.from('member-photos').createSignedUrl(photo, 300);
  if (error || !data) return new NextResponse('Could not open the photo', { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
