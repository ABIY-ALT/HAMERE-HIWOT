// ─────────────────────────────────────────────────────────────────────────────
// What the platform pages show (server only). Every loader checks the
// platform admin itself — a page never relies on its layout for that.
// ─────────────────────────────────────────────────────────────────────────────

import { authorizePlatform } from './auth';
import { computeAccess, type PlanRow, type SubscriptionRow, type TenantAccess, type TenantStatus } from '@/lib/billing/access';
import { MODULE_CODES } from '@/lib/billing/modules';
import { brandOf, type Branding, type TenantBrand } from '@/lib/branding';
import { loadBranding } from '@/lib/tenant/branding';
import {
  billingSettings,
  invoicesOf,
  loadPlans,
  manualPaymentSettings,
  paymentsOf,
  priceOf,
  tenantUsage,
  type BillingSettings,
  type InvoiceRow,
  type ManualPaymentSettings,
  type PaymentRow,
} from '@/lib/billing/service';

export interface TenantRow {
  id: string;
  slug: string;
  name_en: string;
  name_am: string | null;
  status: TenantStatus;
  status_reason: string | null;
  city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_default: boolean;
  created_via: string;
  created_at: string;
  subscription: (SubscriptionRow & { plan: PlanRow | null }) | null;
}

const TENANT_LIST_COLUMNS =
  'id, slug, name_en, name_am, status, status_reason, city, contact_name, contact_phone, contact_email, is_default, created_via, created_at, subscription:subscriptions(*, plan:plans!subscriptions_plan_id_fkey(*))';

function oneSub(r: Record<string, unknown>): TenantRow['subscription'] {
  const s = r.subscription as unknown;
  const sub = (Array.isArray(s) ? s[0] : s) as TenantRow['subscription'] | undefined;
  return sub ?? null;
}

export async function listTenants(filter: { q?: string; status?: string } = {}): Promise<TenantRow[]> {
  const { db } = await authorizePlatform();
  let query = db.from('tenants').select(TENANT_LIST_COLUMNS).neq('status', 'TEMPLATE').order('created_at', { ascending: false }).limit(500);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.q) {
    const q = filter.q.replace(/[%,()]/g, ' ').trim();
    if (q) query = query.or(`name_en.ilike.%${q}%,name_am.ilike.%${q}%,slug.ilike.%${q}%,contact_phone.ilike.%${q}%,city.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as TenantRow), subscription: oneSub(r) }));
}

export interface TenantDetail {
  tenant: TenantRow;
  access: TenantAccess;
  usage: Record<string, number>;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  events: { id: string; event: string; from_status: string | null; to_status: string | null; actor_type: string; details: Record<string, unknown>; created_at: string }[];
  audit: AuditRow[];
  users: { active: number; total: number };
  plans: PlanRow[];
  /** Logo, colour and photo the Sunday school chose */
  branding: Branding;
  brand: TenantBrand;
}

export async function tenantDetail(id: string): Promise<TenantDetail | null> {
  const { db } = await authorizePlatform();
  const { data, error } = await db.from('tenants').select(TENANT_LIST_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const tenant = { ...(data as unknown as TenantRow), subscription: oneSub(data as Record<string, unknown>) };
  const [usage, invoices, payments, events, audit, active, total, modules, plans] = await Promise.all([
    tenantUsage(id).catch(() => ({})),
    invoicesOf(id),
    paymentsOf(id),
    db.from('subscription_events').select('id, event, from_status, to_status, actor_type, details, created_at').eq('tenant_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('platform_audit_logs').select('*').eq('tenant_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('system_users').select('id', { count: 'exact', head: true }).eq('tenant_id', id).eq('is_active', true),
    db.from('system_users').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    db.from('platform_modules').select('code').eq('is_active', true),
    loadPlans(),
  ]);
  const branding = await loadBranding(id);
  const { plan, ...sub } = tenant.subscription ?? ({} as SubscriptionRow & { plan: PlanRow | null });
  const access = computeAccess({
    tenantStatus: tenant.status,
    subscription: tenant.subscription ? (sub as SubscriptionRow) : null,
    plan: plan ?? null,
    activeModules: new Set(modules.data ? modules.data.map((m) => m.code as string) : MODULE_CODES),
    now: new Date(),
  });
  return {
    tenant,
    access,
    usage,
    invoices,
    payments,
    events: (events.data ?? []) as TenantDetail['events'],
    audit: (audit.data ?? []) as AuditRow[],
    users: { active: active.count ?? 0, total: total.count ?? 0 },
    plans,
    branding,
    brand: brandOf(branding, tenant.is_default),
  };
}

export interface PlatformMetrics {
  tenantsByStatus: Record<string, number>;
  subscriptionsByStatus: Record<string, number>;
  /** Paid subscriptions, as a monthly amount (annual ÷ 12), by currency */
  monthlyRevenue: Record<string, number>;
  pendingPayments: number;
  openInvoices: number;
  signupsLast30: number;
  recent: TenantRow[];
}

export async function platformMetrics(): Promise<PlatformMetrics> {
  const { db } = await authorizePlatform();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [tenants, pending, open] = await Promise.all([
    listTenants(),
    db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    db.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'OPEN'),
  ]);
  const tenantsByStatus: Record<string, number> = {};
  const subscriptionsByStatus: Record<string, number> = {};
  const monthlyRevenue: Record<string, number> = {};
  for (const t of tenants) {
    tenantsByStatus[t.status] = (tenantsByStatus[t.status] ?? 0) + 1;
    const s = t.subscription;
    if (!s) continue;
    subscriptionsByStatus[s.status] = (subscriptionsByStatus[s.status] ?? 0) + 1;
    if (s.status === 'ACTIVE' && s.plan && s.billing_cycle !== 'NONE') {
      const price = priceOf({ ...s.plan, price_monthly: num(s.plan.price_monthly), price_annual: num(s.plan.price_annual) }, s.billing_cycle) ?? 0;
      const monthly = s.billing_cycle === 'ANNUAL' ? price / 12 : price;
      monthlyRevenue[s.plan.currency] = (monthlyRevenue[s.plan.currency] ?? 0) + monthly;
    }
  }
  return {
    tenantsByStatus,
    subscriptionsByStatus,
    monthlyRevenue,
    pendingPayments: pending.count ?? 0,
    openInvoices: open.count ?? 0,
    signupsLast30: tenants.filter((t) => t.created_at >= since).length,
    recent: tenants.slice(0, 8),
  };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface PaymentListRow extends PaymentRow {
  tenant: { id: string; name_en: string; slug: string } | null;
  invoice: { invoice_no: string; amount: number; billing_cycle: string; plan_id: string } | null;
}

export async function listPayments(status?: string): Promise<PaymentListRow[]> {
  const { db } = await authorizePlatform();
  let query = db
    .from('payments')
    .select('*, tenant:tenants!payments_tenant_id_fkey(id, name_en, slug), invoice:invoices!payments_invoice_id_fkey(invoice_no, amount, billing_cycle, plan_id)')
    .order('submitted_at', { ascending: false })
    .limit(300);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as PaymentListRow[]).map((p) => ({ ...p, amount: Number(p.amount), refunded_amount: Number(p.refunded_amount) }));
}

export async function platformPlans(): Promise<PlanRow[]> {
  await authorizePlatform();
  return loadPlans();
}

export interface PlatformSettingsData {
  billing: BillingSettings;
  registration: { open: boolean; require_approval: boolean };
  manual: ManualPaymentSettings;
  modules: { code: string; name_en: string; name_am: string | null; is_active: boolean; sort_order: number }[];
}

export async function platformSettings(): Promise<PlatformSettingsData> {
  const { db } = await authorizePlatform();
  const [billing, manual, reg, modules] = await Promise.all([
    billingSettings(),
    manualPaymentSettings(),
    db.from('platform_settings').select('value').eq('key', 'registration').maybeSingle(),
    db.from('platform_modules').select('code, name_en, name_am, is_active, sort_order').order('sort_order'),
  ]);
  const r = (reg.data?.value ?? {}) as { open?: boolean; require_approval?: boolean };
  return {
    billing,
    manual,
    registration: { open: r.open !== false, require_approval: r.require_approval === true },
    modules: (modules.data ?? []) as PlatformSettingsData['modules'],
  };
}

export interface AuditRow {
  id: string;
  actor_label: string;
  tenant_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export async function platformAudit(filter: { action?: string; before?: string } = {}): Promise<AuditRow[]> {
  const { db } = await authorizePlatform();
  let query = db.from('platform_audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
  if (filter.action) query = query.ilike('action', `%${filter.action.replace(/[%_]/g, '')}%`);
  if (filter.before) query = query.lt('created_at', filter.before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}

export async function platformAdmins(): Promise<{ id: string; full_name: string; phone: string; is_active: boolean; last_login_at: string | null; created_at: string }[]> {
  const { db } = await authorizePlatform();
  const { data, error } = await db.from('platform_admins').select('id, full_name, phone, is_active, last_login_at, created_at').order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}
