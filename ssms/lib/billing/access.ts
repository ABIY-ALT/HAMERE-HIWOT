// ─────────────────────────────────────────────────────────────────────────────
// What a tenant may do right now, from its status, subscription and plan.
//
//   full       everything the plan includes
//   read_only  data stays visible and exportable, nothing can be changed
//              (trial over, unpaid after the grace days, canceled, expired,
//              subscription suspended) — no data is ever deleted
//   blocked    the Sunday school itself is suspended / deactivated by the
//              platform, or not yet approved
//
// computeAccess is pure (the clock is passed in) so the rules are easy to
// check; loadTenantAccess reads the rows (server only, once per request).
// The daily job (lib/billing/lifecycle.ts) writes the matching statuses, but
// access never waits for it: an unpaid period ends on time even if the job
// did not run.
// ─────────────────────────────────────────────────────────────────────────────

import { MODULE_REQUIRES, isModuleCode, type ModuleCode } from './modules';

export type TenantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'TEMPLATE';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | 'SUSPENDED';
export type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'NONE';
export type AccessMode = 'full' | 'read_only' | 'blocked';
export type LimitMetric = 'staff_users' | 'people' | 'students' | 'storage_mb';

export const LIMIT_METRICS: LimitMetric[] = ['staff_users', 'people', 'students', 'storage_mb'];

export const LIMIT_LABELS: Record<LimitMetric, [en: string, am: string]> = {
  staff_users: ['Staff logins', 'የሠራተኛ መግቢያዎች'],
  people: ['People records', 'የሰዎች መዝገብ'],
  students: ['Active students', 'ንቁ ተማሪዎች'],
  storage_mb: ['File storage (MB)', 'የፋይል ማከማቻ (MB)'],
};

export interface PlanRow {
  id: string;
  code: string;
  name_en: string;
  name_am: string | null;
  description_en: string | null;
  description_am: string | null;
  price_monthly: number | null;
  price_annual: number | null;
  currency: string;
  is_free: boolean;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  features: string[];
  limits: Partial<Record<LimitMetric, number>>;
  overage_pct: number;
}

export interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  started_at: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_days: number;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
  suspended_at: string | null;
  pending_plan_id: string | null;
  pending_billing_cycle: BillingCycle | null;
  limit_overrides: Partial<Record<LimitMetric, number>>;
  feature_overrides: { add?: string[]; remove?: string[] };
  notes: string | null;
}

export type AccessReason =
  | 'TENANT_PENDING'
  | 'TENANT_SUSPENDED'
  | 'TENANT_DEACTIVATED'
  | 'NO_SUBSCRIPTION'
  | 'TRIAL_ENDED'
  | 'PAST_DUE_GRACE_OVER'
  | 'CANCELED'
  | 'EXPIRED'
  | 'SUSPENDED';

export type AccessNotice =
  | { kind: 'TRIAL_ENDING'; date: string }
  | { kind: 'RENEWAL_DUE'; date: string }
  | { kind: 'PAST_DUE'; date: string } // date = when it becomes read-only
  | { kind: 'ENDING'; date: string } // canceled, runs until date
  | { kind: 'READ_ONLY'; reason: AccessReason }
  | { kind: 'BLOCKED'; reason: AccessReason };

export interface TenantAccess {
  mode: AccessMode;
  reason: AccessReason | null;
  /** Status as of now (may be ahead of the stored one until the daily job runs) */
  status: SubscriptionStatus | null;
  planCode: string | null;
  planNameEn: string | null;
  planNameAm: string | null;
  isFree: boolean;
  modules: ModuleCode[];
  /** Effective limits (plan + overrides); a missing metric is unlimited */
  limits: Partial<Record<LimitMetric, number>>;
  trialEndsAt: string | null;
  periodEnd: string | null;
  graceEndsAt: string | null;
  notice: AccessNotice | null;
}

const DAY = 86_400_000;
/** Show the "trial ending" / "renewal due" notice this many days before */
const NOTICE_DAYS = 7;

export function computeAccess(input: {
  tenantStatus: TenantStatus;
  subscription: SubscriptionRow | null;
  plan: PlanRow | null;
  /** platform_modules that are switched on */
  activeModules: ReadonlySet<string>;
  now: Date;
}): TenantAccess {
  const { tenantStatus, subscription: sub, plan, activeModules, now } = input;
  const base: TenantAccess = {
    mode: 'full',
    reason: null,
    status: sub?.status ?? null,
    planCode: plan?.code ?? null,
    planNameEn: plan?.name_en ?? null,
    planNameAm: plan?.name_am ?? null,
    isFree: plan?.is_free ?? false,
    modules: [],
    limits: { ...(plan?.limits ?? {}), ...(sub?.limit_overrides ?? {}) },
    trialEndsAt: sub?.trial_ends_at ?? null,
    periodEnd: sub?.current_period_end ?? null,
    graceEndsAt: null,
    notice: null,
  };

  const blocked = (reason: AccessReason): TenantAccess => ({ ...base, mode: 'blocked', reason, notice: { kind: 'BLOCKED', reason } });
  if (tenantStatus === 'PENDING') return blocked('TENANT_PENDING');
  if (tenantStatus === 'SUSPENDED') return blocked('TENANT_SUSPENDED');
  if (tenantStatus === 'DEACTIVATED' || tenantStatus === 'TEMPLATE') return blocked('TENANT_DEACTIVATED');
  if (!sub || !plan) return { ...base, mode: 'read_only', reason: 'NO_SUBSCRIPTION', notice: { kind: 'READ_ONLY', reason: 'NO_SUBSCRIPTION' } };

  base.modules = effectiveModules(plan.features, sub.feature_overrides, activeModules);
  const readOnly = (reason: AccessReason, status: SubscriptionStatus): TenantAccess => ({
    ...base,
    mode: 'read_only',
    reason,
    status,
    notice: { kind: 'READ_ONLY', reason },
  });
  const t = now.getTime();
  const at = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const soon = (iso: string) => (at(iso) as number) - t <= NOTICE_DAYS * DAY;

  switch (sub.status) {
    case 'SUSPENDED':
      return readOnly('SUSPENDED', 'SUSPENDED');
    case 'EXPIRED':
      return readOnly('EXPIRED', 'EXPIRED');
    case 'CANCELED': {
      const end = at(sub.current_period_end);
      if (end !== null && t < end) return { ...base, notice: { kind: 'ENDING', date: sub.current_period_end as string } };
      return readOnly('CANCELED', 'CANCELED');
    }
    case 'TRIALING': {
      const end = at(sub.trial_ends_at);
      if (end !== null && t >= end) return readOnly('TRIAL_ENDED', 'EXPIRED');
      if (sub.trial_ends_at && soon(sub.trial_ends_at)) return { ...base, notice: { kind: 'TRIAL_ENDING', date: sub.trial_ends_at } };
      return base;
    }
    case 'ACTIVE':
    case 'PAST_DUE': {
      const end = at(sub.current_period_end);
      if (end === null) return { ...base, status: 'ACTIVE' }; // free / complimentary: no end
      const graceEnd = end + sub.grace_days * DAY;
      const graceEndsAt = new Date(graceEnd).toISOString();
      if (t < end) {
        if (sub.cancel_at_period_end) return { ...base, graceEndsAt, notice: { kind: 'ENDING', date: sub.current_period_end as string } };
        if (soon(sub.current_period_end as string)) return { ...base, graceEndsAt, notice: { kind: 'RENEWAL_DUE', date: sub.current_period_end as string } };
        return { ...base, graceEndsAt };
      }
      if (sub.cancel_at_period_end) return readOnly('CANCELED', 'CANCELED');
      if (t < graceEnd) return { ...base, status: 'PAST_DUE', graceEndsAt, notice: { kind: 'PAST_DUE', date: graceEndsAt } };
      return { ...readOnly('PAST_DUE_GRACE_OVER', 'PAST_DUE'), graceEndsAt };
    }
  }
}

/** Plan modules + per-tenant additions − removals, only those switched on and whose prerequisites are there. */
export function effectiveModules(
  planFeatures: string[],
  overrides: { add?: string[]; remove?: string[] } | null | undefined,
  activeModules: ReadonlySet<string>
): ModuleCode[] {
  const set = new Set<string>([...planFeatures, ...(overrides?.add ?? [])]);
  for (const r of overrides?.remove ?? []) set.delete(r);
  const on = [...set].filter((m): m is ModuleCode => isModuleCode(m) && activeModules.has(m));
  const has = new Set<string>(on);
  return on.filter((m) => (MODULE_REQUIRES[m] ?? []).every((req) => has.has(req)));
}

/** Permissions kept while read-only: seeing and exporting, and the settings page (to pay). */
export function readOnlyPermissions<P extends string>(permissions: P[]): P[] {
  const keep = new Set(['REPORT_EXPORT', 'STUDENT_PORTAL', 'PARENT_PORTAL', 'AUDIT_VIEW_ALL', 'SYSTEM_CONFIGURE']);
  return permissions.filter((p) => p.endsWith('_VIEW') || keep.has(p));
}

/** Share of a limit used, 0–100+; null when unlimited. */
export function usagePercent(used: number, limit: number | undefined): number | null {
  if (limit === undefined || limit === null) return null;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.round((used / limit) * 100);
}
