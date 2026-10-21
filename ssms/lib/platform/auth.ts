// ─────────────────────────────────────────────────────────────────────────────
// Platform owner (server only). A platform admin is a row in platform_admins
// (migration 041), added only by another platform admin or the setup script —
// no Sunday-school role or permission leads here.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createSessionClient } from '@/lib/supabase/server';
import { platformClient } from '@/lib/tenant/db';

export interface PlatformAdmin {
  id: string;
  auth_user_id: string;
  full_name: string;
  phone: string;
}

export async function isPlatformAdmin(authUserId: string): Promise<boolean> {
  const { data } = await platformClient()
    .from('platform_admins')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();
  return Boolean(data);
}

/** The signed-in platform admin, or null. */
export const getPlatformAdmin = cache(async (): Promise<PlatformAdmin | null> => {
  if (!isSupabaseEnabled()) return null;
  const {
    data: { user },
  } = await (await createSessionClient()).auth.getUser();
  if (!user) return null;
  const { data } = await platformClient()
    .from('platform_admins')
    .select('id, auth_user_id, full_name, phone')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  return (data as PlatformAdmin | null) ?? null;
});

/** For platform server actions: the admin and the unrestricted client, or a readable error. */
export async function authorizePlatform(): Promise<{ admin: PlatformAdmin; db: SupabaseClient }> {
  if (!isSupabaseEnabled()) throw new Error('The database is not connected');
  const admin = await getPlatformAdmin();
  if (!admin) throw new Error('Platform administrators only');
  return { admin, db: platformClient() };
}

/** Permanent record of a platform action (platform_audit_logs). Never throws. */
export async function logPlatform(
  entry: {
    admin?: PlatformAdmin | null;
    actorLabel?: string;
    tenantId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await platformClient().from('platform_audit_logs').insert({
      actor_admin_id: entry.admin?.id ?? null,
      actor_label: entry.actorLabel ?? entry.admin?.full_name ?? 'system',
      tenant_id: entry.tenantId ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? {},
    });
  } catch (e) {
    console.error('platform audit log failed', e);
  }
}
