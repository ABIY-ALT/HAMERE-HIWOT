// ─────────────────────────────────────────────────────────────────────────────
// A Sunday school's saved branding (server only), read once per request.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { platformClient } from './db';
import { BRANDING_KEY, EMPTY_BRANDING, type Branding } from '@/lib/branding';

export const loadBranding = cache(async (tenantId: string): Promise<Branding> => {
  const { data } = await platformClient()
    .from('system_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', BRANDING_KEY)
    .maybeSingle();
  return { ...EMPTY_BRANDING, ...((data?.value as Partial<Branding> | undefined) ?? {}) };
});
