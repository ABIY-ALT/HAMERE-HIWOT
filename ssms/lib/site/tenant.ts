// ─────────────────────────────────────────────────────────────────────────────
// Which Sunday school a public page is for (server only): the default one at
// /, or /s/<slug>. A Sunday school shows a public website only while it is not
// blocked and its plan includes the website module (the default one always,
// since it is the site's front page). In demo mode: a stand-in default one.
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseEnabled } from '@/lib/supabase/config';
import { DEFAULT_TENANT_ID } from '@/lib/tenant/db';
import { defaultTenant, loadTenantAccess, tenantBySlug, type TenantInfo } from '@/lib/tenant/context';

const STAND_IN: TenantInfo = {
  id: DEFAULT_TENANT_ID,
  slug: 'hamere-hiwot',
  name_en: 'Hamere Hiwot Sunday School',
  name_am: 'ሐመረ ሕይወት ሰንበት ትምህርት ቤት',
  status: 'ACTIVE',
  is_default: true,
  reg_prefix: 'REG',
};

/** The Sunday school for this public address, or null (→ 404). */
export async function siteTenant(slug?: string): Promise<TenantInfo | null> {
  if (!isSupabaseEnabled()) return slug ? null : STAND_IN;
  try {
    const tenant = slug ? await tenantBySlug(slug) : await defaultTenant();
    if (!tenant) return slug ? null : STAND_IN;
    if (tenant.is_default) return tenant;
    const access = await loadTenantAccess(tenant.id);
    return access.mode !== 'blocked' && access.modules.includes('website') ? tenant : null;
  } catch (e) {
    // The front page keeps working (with less on it) when the database cannot be reached
    console.error('site tenant lookup failed', e);
    return slug ? null : STAND_IN;
  }
}

/** "ሐመረ ሕይወት Hamere Hiwot" style name for page titles */
export function siteName(tenant: TenantInfo): string {
  if (tenant.is_default) return 'ሐመረ ሕይወት Hamere Hiwot';
  return tenant.name_am && tenant.name_am !== tenant.name_en ? `${tenant.name_am} ${tenant.name_en}` : tenant.name_en;
}
