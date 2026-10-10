// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard/tasks/files/[id] — opens a file attached to a task. Checks
// that the signed-in user may see the task, then redirects to a link to the
// private "task-files" bucket that works for one minute. Under /dashboard so
// the proxy keeps the session fresh.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Opened in the browser; anything else is downloaded under its own name. */
const INLINE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseEnabled()) return new NextResponse('Files need the database', { status: 404 });
  const me = await getCurrentUser();
  if (!me) return new NextResponse('Sign in again to open this file', { status: 401 });

  const { id } = await params;
  const db = createAdminClient(me.systemUser.id);
  const { data: file } = await db.from('task_files')
    .select('path, file_name, mime_type, task:tasks!inner(unit_id)')
    .eq('id', id)
    .maybeSingle();
  if (!file) return new NextResponse('File not found', { status: 404 });

  const unitId = (file.task as unknown as { unit_id: string }).unit_id;
  const allowed =
    me.permissions.includes('TASK_ASSIGN') ||
    me.permissions.includes('AUDIT_VIEW_ALL') ||
    (me.permissions.includes('TASK_REPORT') && me.organizationIds.includes(unitId));
  if (!allowed) return new NextResponse('You do not have permission to open this file', { status: 403 });

  const { data, error } = await db.storage
    .from('task-files')
    .createSignedUrl(file.path, 60, INLINE.test(file.mime_type) ? undefined : { download: file.file_name });
  if (error || !data) return new NextResponse('Could not open the file', { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
