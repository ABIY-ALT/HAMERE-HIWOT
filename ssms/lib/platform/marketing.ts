// ─────────────────────────────────────────────────────────────────────────────
// What the product page (/start) shows about the platform (server only, no
// sign-in): the plans open for sign-up, the trial, whether sign-up is open,
// and how many Sunday schools use it. Cached for 5 minutes. Before migrations
// 040/041 (no plans yet) or without the database it returns no plans, and the
// page leaves the pricing out.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from 'next/cache';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { platformClient } from '@/lib/tenant/db';
import { DEFAULT_BILLING, billingSettings, loadPlans, planByCode } from '@/lib/billing/service';
import type { PlanRow } from '@/lib/billing/access';

export interface ProductInfo {
  plans: PlanRow[];
  currency: string;
  /** 0 = no trial */
  trial_days: number;
  /** The plan a trial runs on */
  trial_plan_code: string;
  /** The plan a trial falls back to when unpaid (null = read-only) */
  after_trial_plan: { en: string; am: string } | null;
  registration_open: boolean;
  /** Active Sunday schools, the default one included */
  schools: number;
}

const EMPTY: ProductInfo = {
  plans: [],
  currency: DEFAULT_BILLING.currency,
  trial_days: DEFAULT_BILLING.trial_days,
  trial_plan_code: DEFAULT_BILLING.trial_plan_code,
  after_trial_plan: null,
  registration_open: true,
  schools: 0,
};

const cached = unstable_cache(
  async (): Promise<ProductInfo> => {
    if (!isSupabaseEnabled()) return EMPTY;
    const db = platformClient();
    const [plans, billing, reg, schools] = await Promise.all([
      loadPlans({ publicOnly: true }).catch(() => [] as PlanRow[]),
      billingSettings().catch(() => DEFAULT_BILLING),
      db.from('platform_settings').select('value').eq('key', 'registration').maybeSingle(),
      db.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    ]);
    const after = billing.after_trial_plan_code ? await planByCode(billing.after_trial_plan_code).catch(() => null) : null;
    return {
      plans,
      currency: billing.currency,
      trial_days: billing.trial_days,
      trial_plan_code: billing.trial_plan_code,
      after_trial_plan: after ? { en: after.name_en, am: after.name_am || after.name_en } : null,
      registration_open: (reg.data?.value as { open?: boolean } | undefined)?.open !== false,
      schools: schools.count ?? 0,
    };
  },
  ['product-info-v1'],
  { revalidate: 300 }
);

export async function productInfo(): Promise<ProductInfo> {
  try {
    return await cached();
  } catch (e) {
    console.error('product info failed', e);
    return EMPTY;
  }
}
