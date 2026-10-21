// ─────────────────────────────────────────────────────────────────────────────
// Tenants (server only): lookup by id or by the slug in public addresses
// (/s/<slug>), the default tenant (served at /), and what each may do now.
// The tenant of a signed-in user always comes from their own account rows
// (lib/auth/session.ts) — never from anything the browser sends.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { platformClient, DEFAULT_TENANT_ID } from './db';
import {
  computeAccess,
  type PlanRow,
  type SubscriptionRow,
  type TenantAccess,
  type TenantStatus,
} from '@/lib/billing/access';
import { MODULE_CODES } from '@/lib/billing/modules';

export interface TenantInfo {
  id: string;
  slug: string;
  name_en: string;
  name_am: string | null;
  status: TenantStatus;
  is_default: boolean;
  reg_prefix: string;
}

export interface TenantContext extends TenantInfo {
  access: TenantAccess;
}

export const TENANT_COLUMNS = 'id, slug, name_en, name_am, status, is_default, reg_prefix';

/** Slugs that would clash with the site's own addresses. */
export const RESERVED_SLUGS = new Set([
  'www', 'api', 'app', 'admin', 'platform', 'dashboard', 'login', 'logout', 'register', 'signup', 'billing',
  's', 'exam', 'profile', 'about', 'contact', 'events', 'news', 'gallery', 'help', 'support', 'status',
  'template-defaults', 'static', 'assets', 'public', 'choose',
]);

export const loadTenant = cache(async (id: string): Promise<TenantInfo | null> => {
  const { data } = await platformClient().from('tenants').select(TENANT_COLUMNS).eq('id', id).maybeSingle();
  return (data as TenantInfo | null) ?? null;
});

/** A tenant that can be shown publicly (not the template, not deactivated). */
export const tenantBySlug = cache(async (slug: string): Promise<TenantInfo | null> => {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data } = await platformClient()
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('slug', slug)
    .in('status', ['ACTIVE', 'SUSPENDED'])
    .maybeSingle();
  return (data as TenantInfo | null) ?? null;
});

export const defaultTenant = cache(async (): Promise<TenantInfo | null> => {
  const { data } = await platformClient().from('tenants').select(TENANT_COLUMNS).eq('is_default', true).maybeSingle();
  return (data as TenantInfo | null) ?? (await loadTenant(DEFAULT_TENANT_ID));
});

export const loadTenantAccess = cache(async (tenantId: string): Promise<TenantAccess> => {
  const db = platformClient();
  const [{ data: tenant }, { data: sub, error: subError }, { data: modules }] = await Promise.all([
    db.from('tenants').select('status').eq('id', tenantId).maybeSingle(),
    db.from('subscriptions').select('*, plan:plans!subscriptions_plan_id_fkey(*)').eq('tenant_id', tenantId).maybeSingle(),
    db.from('platform_modules').select('code').eq('is_active', true),
  ]);
  const tenantStatus = (tenant?.status as TenantStatus | undefined) ?? 'DEACTIVATED';
  // Between migrations 040 and 041 there are no subscriptions yet: nobody is locked out meanwhile
  if (subError?.code === 'PGRST205' && tenantStatus === 'ACTIVE') {
    return { ...computeAccess({ tenantStatus, subscription: null, plan: null, activeModules: new Set(), now: new Date() }), mode: 'full', reason: null, notice: null, modules: [...MODULE_CODES] };
  }
  const { plan, ...subscription } = (sub ?? {}) as SubscriptionRow & { plan?: PlanRow | null };
  return computeAccess({
    tenantStatus,
    subscription: sub ? (subscription as SubscriptionRow) : null,
    plan: plan ?? null,
    // Before migration 041 there are no modules: everything stays on
    activeModules: new Set(modules ? modules.map((m) => m.code as string) : MODULE_CODES),
    now: new Date(),
  });
});

export async function loadTenantContext(id: string): Promise<TenantContext | null> {
  const [tenant, access] = await Promise.all([loadTenant(id), loadTenantAccess(id)]);
  return tenant ? { ...tenant, access } : null;
}

/** Public address of a tenant page: the default tenant at /, others under /s/<slug>. */
export function publicPath(tenant: Pick<TenantInfo, 'slug' | 'is_default'>, path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (tenant.is_default) return p;
  return p === '/' ? `/s/${tenant.slug}` : `/s/${tenant.slug}${p}`;
}
