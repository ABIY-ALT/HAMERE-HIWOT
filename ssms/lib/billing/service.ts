// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions, invoices and payments (server only, platform client).
//
// Rules
// • Prices come from the plan when an invoice is made — never from the
//   browser. A payment's amount is the invoice's amount.
// • A subscription changes plan / period only when an invoice is paid
//   (confirmPayment → applyPaidInvoice), or by a platform admin.
// • A payment is applied once: it moves PENDING → SUCCEEDED in one
//   conditional update, so a double click or a retried webhook does nothing.
// • No proration: an upgrade starts a new full period when it is paid;
//   a downgrade waits for the end of the paid period (pending_plan_id).
// • Every change is kept: subscription_events (history) and
//   platform_audit_logs (who did what).
// Payment providers (lib/billing/providers) only report payments; what a
// payment does to the subscription is decided here.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { platformClient } from '@/lib/tenant/db';
import { logPlatform, type PlatformAdmin } from '@/lib/platform/auth';
import type { BillingCycle, PlanRow, SubscriptionRow, SubscriptionStatus } from './access';

export interface BillingSettings {
  currency: string;
  trial_days: number;
  trial_plan_code: string;
  /** Plan a Sunday school falls back to when its trial ends unpaid ('' = read-only) */
  after_trial_plan_code: string;
  grace_days: number;
  invoice_due_days: number;
  warn_usage_pct: number;
  /** What an unpaid subscription becomes after the grace days */
  expired_mode: 'read_only' | 'free_plan';
}

export const DEFAULT_BILLING: BillingSettings = {
  currency: 'ETB',
  trial_days: 14,
  trial_plan_code: 'PROFESSIONAL',
  after_trial_plan_code: 'FREE',
  grace_days: 7,
  invoice_due_days: 7,
  warn_usage_pct: 80,
  expired_mode: 'read_only',
};

export interface ManualPaymentSettings {
  instructions_en: string;
  instructions_am: string;
  accounts: { bank: string; name: string; number: string }[];
}

export interface InvoiceRow {
  id: string;
  invoice_no: string;
  tenant_id: string;
  subscription_id: string | null;
  plan_id: string;
  billing_cycle: BillingCycle;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  kind: 'NEW' | 'RENEWAL' | 'UPGRADE' | 'MANUAL';
  due_at: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  tenant_id: string;
  invoice_id: string;
  provider: string;
  provider_ref: string | null;
  method: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CASH' | 'CARD' | 'OTHER';
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELED';
  payer_name: string | null;
  payer_phone: string | null;
  reference_no: string | null;
  proof_path: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  refunded_amount: number;
}

/** Who caused a change, for the history and the audit log. */
export type Actor =
  | { type: 'PLATFORM_ADMIN'; admin: PlatformAdmin }
  | { type: 'TENANT_USER'; systemUserId: string; label: string }
  | { type: 'SYSTEM' }
  | { type: 'PAYMENT'; paymentId: string };

const db = (): SupabaseClient => platformClient();

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toPlan(r: Record<string, unknown>): PlanRow {
  return {
    ...(r as unknown as PlanRow),
    price_monthly: num(r.price_monthly),
    price_annual: num(r.price_annual),
    features: (r.features as string[]) ?? [],
    limits: (r.limits as PlanRow['limits']) ?? {},
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export async function billingSettings(): Promise<BillingSettings> {
  const { data } = await db().from('platform_settings').select('value').eq('key', 'billing').maybeSingle();
  return { ...DEFAULT_BILLING, ...((data?.value as Partial<BillingSettings>) ?? {}) };
}

export async function manualPaymentSettings(): Promise<ManualPaymentSettings> {
  const { data } = await db().from('platform_settings').select('value').eq('key', 'manual_payment').maybeSingle();
  const v = (data?.value ?? {}) as Partial<ManualPaymentSettings>;
  return { instructions_en: v.instructions_en ?? '', instructions_am: v.instructions_am ?? '', accounts: Array.isArray(v.accounts) ? v.accounts : [] };
}

export async function loadPlans(options: { publicOnly?: boolean } = {}): Promise<PlanRow[]> {
  let q = db().from('plans').select('*').order('sort_order');
  if (options.publicOnly) q = q.eq('is_active', true).eq('is_public', true);
  return ((must(await q) ?? []) as Record<string, unknown>[]).map(toPlan);
}

export async function planByCode(code: string): Promise<PlanRow | null> {
  const { data } = await db().from('plans').select('*').eq('code', code).maybeSingle();
  return data ? toPlan(data as Record<string, unknown>) : null;
}

async function planById(id: string): Promise<PlanRow> {
  return toPlan(must(await db().from('plans').select('*').eq('id', id).single()) as Record<string, unknown>);
}

export async function subscriptionOf(tenantId: string): Promise<SubscriptionRow | null> {
  const { data } = await db().from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

export async function invoicesOf(tenantId: string, limit = 50): Promise<InvoiceRow[]> {
  const rows = must(await db().from('invoices').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit)) as InvoiceRow[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function paymentsOf(tenantId: string, limit = 50): Promise<PaymentRow[]> {
  const rows = must(await db().from('payments').select('*').eq('tenant_id', tenantId).order('submitted_at', { ascending: false }).limit(limit)) as PaymentRow[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount), refunded_amount: Number(r.refunded_amount) }));
}

export async function tenantUsage(tenantId: string): Promise<Record<string, number>> {
  const { data, error } = await db().rpc('tenant_usage', { p_tenant: tenantId });
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, number>;
}

// ── Money and dates ──────────────────────────────────────────────────────────

export function priceOf(plan: PlanRow, cycle: BillingCycle): number | null {
  if (plan.is_free) return 0;
  if (cycle === 'MONTHLY') return plan.price_monthly;
  if (cycle === 'ANNUAL') return plan.price_annual;
  return null;
}

export function addPeriod(start: Date, cycle: BillingCycle): Date | null {
  if (cycle === 'NONE') return null;
  const d = new Date(start);
  if (cycle === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

const DAY = 86_400_000;

// ── History ──────────────────────────────────────────────────────────────────

function actorFields(actor: Actor): { actor_type: string; actor_id: string | null; label: string } {
  switch (actor.type) {
    case 'PLATFORM_ADMIN':
      return { actor_type: 'PLATFORM_ADMIN', actor_id: actor.admin.id, label: actor.admin.full_name };
    case 'TENANT_USER':
      return { actor_type: 'TENANT_USER', actor_id: actor.systemUserId, label: `tenant:${actor.label}` };
    case 'PAYMENT':
      return { actor_type: 'PAYMENT', actor_id: actor.paymentId, label: 'payment' };
    default:
      return { actor_type: 'SYSTEM', actor_id: null, label: 'system' };
  }
}

async function record(
  tenantId: string,
  before: SubscriptionRow | null,
  after: SubscriptionRow,
  event: string,
  actor: Actor,
  details: Record<string, unknown> = {}
): Promise<void> {
  const a = actorFields(actor);
  await db().from('subscription_events').insert({
    tenant_id: tenantId,
    subscription_id: after.id,
    event,
    from_status: before?.status ?? null,
    to_status: after.status,
    from_plan_id: before?.plan_id ?? null,
    to_plan_id: after.plan_id,
    actor_type: a.actor_type,
    actor_id: a.actor_id,
    details,
  });
  await logPlatform({
    admin: actor.type === 'PLATFORM_ADMIN' ? actor.admin : null,
    actorLabel: a.label,
    tenantId,
    action: `SUBSCRIPTION_${event}`,
    targetType: 'subscription',
    targetId: after.id,
    details: { ...details, status: after.status, plan_id: after.plan_id },
  });
}

async function updateSubscription(
  tenantId: string,
  changes: Partial<SubscriptionRow>,
  event: string,
  actor: Actor,
  details?: Record<string, unknown>
): Promise<SubscriptionRow> {
  const before = await subscriptionOf(tenantId);
  if (!before) throw new Error('This Sunday school has no subscription');
  const after = must(await db().from('subscriptions').update(changes).eq('id', before.id).select('*').single()) as SubscriptionRow;
  await record(tenantId, before, after, event, actor, details);
  return after;
}

// ── New Sunday schools ───────────────────────────────────────────────────────

/** The trial a new Sunday school starts with (platform settings: plan and length). */
export async function startTrial(tenantId: string, actor: Actor): Promise<SubscriptionRow> {
  const settings = await billingSettings();
  const plan = (await planByCode(settings.trial_plan_code)) ?? (await planByCode('FREE'));
  if (!plan) throw new Error('No plans are set up yet');
  const now = new Date();
  const trial = !plan.is_free && settings.trial_days > 0;
  const row = must(
    await db()
      .from('subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: plan.id,
        status: trial ? 'TRIALING' : 'ACTIVE',
        billing_cycle: 'NONE',
        started_at: now.toISOString(),
        trial_ends_at: trial ? new Date(now.getTime() + settings.trial_days * DAY).toISOString() : null,
        current_period_start: now.toISOString(),
        grace_days: settings.grace_days,
      })
      .select('*')
      .single()
  ) as SubscriptionRow;
  await record(tenantId, null, row, 'CREATED', actor, { trial_days: trial ? settings.trial_days : 0 });
  return row;
}

// ── Choosing a plan (Sunday-school administrators) ───────────────────────────

/**
 * A Sunday school chooses a plan. Free plans switch now (or at the end of a
 * paid period); paid plans get an invoice to pay — the plan changes when it
 * is paid. Returns the invoice to pay, if any.
 */
export async function choosePlan(tenantId: string, planCode: string, cycle: BillingCycle, actor: Actor): Promise<InvoiceRow | null> {
  const plan = await planByCode(planCode);
  if (!plan || !plan.is_active || !plan.is_public) throw new Error('That plan is not available');
  const sub = await subscriptionOf(tenantId);
  if (!sub) throw new Error('This Sunday school has no subscription');
  const now = Date.now();
  const paidAndRunning =
    sub.status === 'ACTIVE' && sub.billing_cycle !== 'NONE' && sub.current_period_end !== null && Date.parse(sub.current_period_end) > now;

  if (plan.is_free) {
    if (paidAndRunning) {
      await updateSubscription(tenantId, { pending_plan_id: plan.id, pending_billing_cycle: 'NONE' }, 'DOWNGRADE_SCHEDULED', actor, { plan: plan.code });
    } else {
      await updateSubscription(
        tenantId,
        { plan_id: plan.id, status: 'ACTIVE', billing_cycle: 'NONE', trial_ends_at: null, current_period_start: new Date().toISOString(), current_period_end: null, cancel_at_period_end: false, pending_plan_id: null, pending_billing_cycle: null, ended_at: null },
        'PLAN_CHANGED',
        actor,
        { plan: plan.code }
      );
    }
    return null;
  }

  if (cycle === 'NONE') throw new Error('Choose monthly or yearly');
  const price = priceOf(plan, cycle);
  if (price === null) throw new Error(`The ${plan.name_en} plan is not offered ${cycle === 'MONTHLY' ? 'monthly' : 'yearly'}`);

  // A cheaper paid plan while the current one is paid: from the next renewal
  const current = await planById(sub.plan_id);
  const currentPrice = priceOf(current, sub.billing_cycle) ?? 0;
  if (paidAndRunning && price < currentPrice && sub.billing_cycle === cycle) {
    await updateSubscription(tenantId, { pending_plan_id: plan.id, pending_billing_cycle: cycle }, 'DOWNGRADE_SCHEDULED', actor, { plan: plan.code, cycle });
    return null;
  }

  const kind = sub.plan_id === plan.id ? 'RENEWAL' : paidAndRunning ? 'UPGRADE' : 'NEW';
  return createInvoice(tenantId, plan, cycle, kind, actor);
}

/** An open invoice for a plan and cycle (an existing open one for the same plan is reused). */
export async function createInvoice(
  tenantId: string,
  plan: PlanRow,
  cycle: BillingCycle,
  kind: InvoiceRow['kind'],
  actor: Actor,
  periodStart?: Date
): Promise<InvoiceRow> {
  const price = priceOf(plan, cycle);
  if (price === null) throw new Error('This plan has no price for that period');
  const existing = (await invoicesOf(tenantId, 20)).find((i) => i.status === 'OPEN' && i.plan_id === plan.id && i.billing_cycle === cycle);
  if (existing) return existing;
  // Older unpaid invoices for another plan are replaced
  await db().from('invoices').update({ status: 'VOID', voided_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('status', 'OPEN');

  const settings = await billingSettings();
  const sub = await subscriptionOf(tenantId);
  const start = periodStart ?? new Date();
  const end = addPeriod(start, cycle) as Date;
  const row = must(
    await db()
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        subscription_id: sub?.id ?? null,
        plan_id: plan.id,
        billing_cycle: cycle,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        amount: price,
        currency: plan.currency,
        status: 'OPEN',
        kind,
        due_at: new Date(Date.now() + settings.invoice_due_days * DAY).toISOString(),
        created_by: actor.type === 'PLATFORM_ADMIN' ? actor.admin.id : null,
      })
      .select('*')
      .single()
  ) as InvoiceRow;
  await logPlatform({
    admin: actor.type === 'PLATFORM_ADMIN' ? actor.admin : null,
    actorLabel: actorFields(actor).label,
    tenantId,
    action: 'INVOICE_CREATED',
    targetType: 'invoice',
    targetId: row.id,
    details: { invoice_no: row.invoice_no, plan: plan.code, cycle, amount: price, kind },
  });
  return { ...row, amount: Number(row.amount) };
}

// ── Manual payments ──────────────────────────────────────────────────────────

/** A Sunday school reports a bank / mobile-money payment for an open invoice; a platform admin confirms it. */
export async function submitManualPayment(
  tenantId: string,
  invoiceId: string,
  input: { method: PaymentRow['method']; reference_no: string; payer_name: string; payer_phone: string; proof_path: string | null },
  submittedBy: { systemUserId: string; label: string }
): Promise<PaymentRow> {
  const invoice = must(await db().from('invoices').select('*').eq('id', invoiceId).eq('tenant_id', tenantId).maybeSingle()) as InvoiceRow | null;
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'OPEN') throw new Error('This invoice is not waiting for payment');
  const { data: pending } = await db().from('payments').select('id').eq('invoice_id', invoiceId).eq('status', 'PENDING').limit(1);
  if (pending?.length) throw new Error('A payment for this invoice is already waiting for confirmation');

  const res = await db()
    .from('payments')
    .insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      provider: 'MANUAL',
      method: input.method,
      amount: invoice.amount,
      currency: invoice.currency,
      status: 'PENDING',
      payer_name: input.payer_name,
      payer_phone: input.payer_phone,
      reference_no: input.reference_no,
      proof_path: input.proof_path,
      submitted_by: submittedBy.systemUserId,
    })
    .select('*')
    .single();
  if (res.error?.code === '23505') throw new Error('This transaction reference was already used for a payment');
  const payment = must(res) as PaymentRow;
  await logPlatform({
    actorLabel: `tenant:${submittedBy.label}`,
    tenantId,
    action: 'PAYMENT_SUBMITTED',
    targetType: 'payment',
    targetId: payment.id,
    details: { invoice_no: invoice.invoice_no, method: input.method, reference_no: input.reference_no, amount: invoice.amount },
  });
  return payment;
}

const PROOF_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/** Stores a payment receipt in the private billing-proofs bucket under the tenant's folder; returns its path. */
export async function uploadPaymentProof(tenantId: string, invoiceId: string, file: File): Promise<string> {
  const ext = PROOF_TYPES[file.type];
  if (!ext) throw new Error('The receipt must be a photo (JPG, PNG, WebP) or a PDF');
  if (file.size > MAX_PROOF_BYTES) throw new Error('The receipt is larger than 5 MB');
  const path = `${tenantId}/${invoiceId}/${crypto.randomUUID()}${ext}`;
  const { error } = await db().storage.from('billing-proofs').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** A one-minute link to a payment's receipt (platform admins). */
export async function paymentProofUrl(paymentId: string): Promise<string | null> {
  const { data } = await db().from('payments').select('proof_path').eq('id', paymentId).maybeSingle();
  if (!data?.proof_path) return null;
  const { data: signed } = await db().storage.from('billing-proofs').createSignedUrl(data.proof_path as string, 60);
  return signed?.signedUrl ?? null;
}

/** Platform admin: the money arrived. Marks the payment and invoice paid and applies the invoice — once. */
export async function confirmPayment(paymentId: string, admin: PlatformAdmin, note?: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: claimed, error } = await db()
    .from('payments')
    .update({ status: 'SUCCEEDED', reviewed_by: admin.id, reviewed_at: now, review_note: note ?? null })
    .eq('id', paymentId)
    .eq('status', 'PENDING')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) throw new Error('This payment was already handled');
  const payment = claimed as PaymentRow;
  await markInvoicePaid(payment.invoice_id, { type: 'PAYMENT', paymentId: payment.id });
  await logPlatform({ admin, tenantId: payment.tenant_id, action: 'PAYMENT_CONFIRMED', targetType: 'payment', targetId: payment.id, details: { amount: Number(payment.amount), note } });
}

export async function rejectPayment(paymentId: string, admin: PlatformAdmin, note: string): Promise<void> {
  const { data, error } = await db()
    .from('payments')
    .update({ status: 'FAILED', reviewed_by: admin.id, reviewed_at: new Date().toISOString(), review_note: note })
    .eq('id', paymentId)
    .eq('status', 'PENDING')
    .select('tenant_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('This payment was already handled');
  await logPlatform({ admin, tenantId: data.tenant_id as string, action: 'PAYMENT_REJECTED', targetType: 'payment', targetId: paymentId, details: { note } });
}

/** Records a refund made outside the system (bank). Does not change the subscription by itself. */
export async function refundPayment(paymentId: string, admin: PlatformAdmin, amount: number, note: string): Promise<void> {
  const payment = must(await db().from('payments').select('*').eq('id', paymentId).single()) as PaymentRow;
  if (payment.status !== 'SUCCEEDED' && payment.status !== 'REFUNDED') throw new Error('Only confirmed payments can be refunded');
  const total = Number(payment.refunded_amount) + amount;
  if (amount <= 0 || total > Number(payment.amount)) throw new Error('The refund is larger than the payment');
  must(
    await db()
      .from('payments')
      .update({ refunded_amount: total, refunded_at: new Date().toISOString(), status: total >= Number(payment.amount) ? 'REFUNDED' : 'SUCCEEDED', review_note: note })
      .eq('id', paymentId)
      .select('id')
      .single()
  );
  await logPlatform({ admin, tenantId: payment.tenant_id, action: 'PAYMENT_REFUNDED', targetType: 'payment', targetId: paymentId, details: { amount, note } });
}

export async function voidInvoice(invoiceId: string, admin: PlatformAdmin): Promise<void> {
  const { data, error } = await db()
    .from('invoices')
    .update({ status: 'VOID', voided_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('status', 'OPEN')
    .select('tenant_id, invoice_no')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Only open invoices can be voided');
  await db().from('payments').update({ status: 'CANCELED' }).eq('invoice_id', invoiceId).eq('status', 'PENDING');
  await logPlatform({ admin, tenantId: data.tenant_id as string, action: 'INVOICE_VOIDED', targetType: 'invoice', targetId: invoiceId, details: { invoice_no: data.invoice_no } });
}

/** Invoice paid → its plan and period apply. A renewal paid early continues after the current period. */
async function markInvoicePaid(invoiceId: string, actor: Actor): Promise<void> {
  const { data, error } = await db()
    .from('invoices')
    .update({ status: 'PAID', paid_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .in('status', ['OPEN', 'DRAFT'])
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return; // already paid
  const invoice = data as InvoiceRow;
  const sub = await subscriptionOf(invoice.tenant_id);
  if (!sub) throw new Error('This Sunday school has no subscription');

  const now = new Date();
  const runningEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const continues = invoice.kind === 'RENEWAL' && sub.plan_id === invoice.plan_id && runningEnd !== null && runningEnd > now && sub.status === 'ACTIVE';
  const start = continues ? (runningEnd as Date) : now;
  const end = addPeriod(start, invoice.billing_cycle) as Date;
  await db().from('invoices').update({ period_start: start.toISOString(), period_end: end.toISOString() }).eq('id', invoice.id);
  await updateSubscription(
    invoice.tenant_id,
    {
      plan_id: invoice.plan_id,
      status: 'ACTIVE',
      billing_cycle: invoice.billing_cycle,
      trial_ends_at: null,
      current_period_start: continues ? sub.current_period_start : start.toISOString(),
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
      ended_at: null,
      suspended_at: null,
      pending_plan_id: null,
      pending_billing_cycle: null,
    },
    continues ? 'RENEWED' : 'PLAN_ACTIVATED',
    actor,
    { invoice_no: invoice.invoice_no, period_end: end.toISOString() }
  );
}

/** Sunday-school administrators: stop at the end of the paid period, or keep going. */
export async function setCancelAtPeriodEnd(tenantId: string, cancel: boolean, actor: Actor): Promise<void> {
  const sub = await subscriptionOf(tenantId);
  if (!sub) throw new Error('This Sunday school has no subscription');
  if (sub.billing_cycle === 'NONE' || !sub.current_period_end) throw new Error('There is no paid period to cancel');
  await updateSubscription(
    tenantId,
    { cancel_at_period_end: cancel, canceled_at: cancel ? new Date().toISOString() : null },
    cancel ? 'CANCEL_SCHEDULED' : 'CANCEL_UNDONE',
    actor
  );
}

// ── Platform administrators ──────────────────────────────────────────────────

export interface SubscriptionEdit {
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_days: number;
  limit_overrides: Record<string, number>;
  feature_overrides: { add?: string[]; remove?: string[] };
  notes: string | null;
}

/** Platform admin sets a Sunday school's subscription directly (complimentary plans, corrections). */
export async function setSubscription(tenantId: string, edit: SubscriptionEdit, admin: PlatformAdmin): Promise<void> {
  const changes: Partial<SubscriptionRow> = {
    ...edit,
    suspended_at: edit.status === 'SUSPENDED' ? new Date().toISOString() : null,
    ended_at: edit.status === 'EXPIRED' || edit.status === 'CANCELED' ? new Date().toISOString() : null,
    pending_plan_id: null,
    pending_billing_cycle: null,
  };
  const existing = await subscriptionOf(tenantId);
  if (!existing) {
    const row = must(await db().from('subscriptions').insert({ tenant_id: tenantId, ...changes }).select('*').single()) as SubscriptionRow;
    await record(tenantId, null, row, 'CREATED', { type: 'PLATFORM_ADMIN', admin });
    return;
  }
  await updateSubscription(tenantId, changes, 'SET_BY_PLATFORM', { type: 'PLATFORM_ADMIN', admin }, { notes: edit.notes });
}

// ── Daily lifecycle (called by /api/cron) ────────────────────────────────────

export interface BillingRunResult {
  trials_ended: number;
  periods_ended: number;
  expired: number;
  renewal_invoices: number;
  usage_snapshots: number;
}

/**
 * Brings stored statuses in line with the clock (access itself never waits for
 * this — lib/billing/access.ts), makes renewal invoices a week ahead, keeps a
 * daily usage snapshot and clears old rate-limit counters.
 */
export async function runBillingDaily(now = new Date()): Promise<BillingRunResult> {
  const settings = await billingSettings();
  const system: Actor = { type: 'SYSTEM' };
  const fallback = settings.after_trial_plan_code ? await planByCode(settings.after_trial_plan_code) : null;
  const result: BillingRunResult = { trials_ended: 0, periods_ended: 0, expired: 0, renewal_invoices: 0, usage_snapshots: 0 };
  const iso = now.toISOString();
  const toFree = (planId: string): Partial<SubscriptionRow> => ({
    plan_id: planId, status: 'ACTIVE', billing_cycle: 'NONE', trial_ends_at: null, current_period_start: iso, current_period_end: null,
    cancel_at_period_end: false, pending_plan_id: null, pending_billing_cycle: null,
  });

  // Trials that ended unpaid
  const trials = must(await db().from('subscriptions').select('*').eq('status', 'TRIALING').lte('trial_ends_at', iso)) as SubscriptionRow[];
  for (const s of trials) {
    if (fallback?.is_free && fallback.is_active) await updateSubscription(s.tenant_id, toFree(fallback.id), 'TRIAL_ENDED', system, { now_on: fallback.code });
    else await updateSubscription(s.tenant_id, { status: 'EXPIRED', ended_at: iso }, 'TRIAL_ENDED', system);
    result.trials_ended += 1;
  }

  // Paid periods that ended
  const ended = must(await db().from('subscriptions').select('*').in('status', ['ACTIVE', 'CANCELED']).lte('current_period_end', iso)) as SubscriptionRow[];
  for (const s of ended) {
    if (s.status === 'CANCELED' || s.cancel_at_period_end) {
      if (s.status !== 'CANCELED' || !s.ended_at) {
        await updateSubscription(s.tenant_id, { status: 'CANCELED', ended_at: iso }, 'ENDED_CANCELED', system);
        result.periods_ended += 1;
      }
      continue;
    }
    if (s.pending_plan_id) {
      const next = await planById(s.pending_plan_id);
      if (next.is_free) {
        await updateSubscription(s.tenant_id, toFree(next.id), 'DOWNGRADED', system, { plan: next.code });
        result.periods_ended += 1;
        continue;
      }
    }
    await updateSubscription(s.tenant_id, { status: 'PAST_DUE' }, 'PAST_DUE', system);
    result.periods_ended += 1;
  }

  // Unpaid after the grace days
  const pastDue = must(await db().from('subscriptions').select('*').eq('status', 'PAST_DUE')) as SubscriptionRow[];
  for (const s of pastDue) {
    const end = s.current_period_end ? Date.parse(s.current_period_end) : now.getTime();
    if (end + s.grace_days * DAY > now.getTime()) continue;
    if (settings.expired_mode === 'free_plan' && fallback?.is_free && fallback.is_active) {
      await updateSubscription(s.tenant_id, toFree(fallback.id), 'EXPIRED_TO_FREE', system, { now_on: fallback.code });
    } else {
      await updateSubscription(s.tenant_id, { status: 'EXPIRED', ended_at: iso }, 'EXPIRED', system);
    }
    await db().from('invoices').update({ status: 'UNCOLLECTIBLE' }).eq('tenant_id', s.tenant_id).eq('status', 'OPEN').lte('due_at', iso);
    result.expired += 1;
  }

  // Renewal invoices a week before the period ends
  const soon = new Date(now.getTime() + Math.max(settings.invoice_due_days, 1) * DAY).toISOString();
  const renewing = must(
    await db().from('subscriptions').select('*').eq('status', 'ACTIVE').neq('billing_cycle', 'NONE').eq('cancel_at_period_end', false).gt('current_period_end', iso).lte('current_period_end', soon)
  ) as SubscriptionRow[];
  for (const s of renewing) {
    const planId = s.pending_plan_id ?? s.plan_id;
    const cycle = s.pending_billing_cycle && s.pending_billing_cycle !== 'NONE' ? s.pending_billing_cycle : s.billing_cycle;
    const { data: open } = await db().from('invoices').select('id').eq('tenant_id', s.tenant_id).eq('status', 'OPEN').limit(1);
    if (open?.length) continue;
    const plan = await planById(planId);
    if (plan.is_free || priceOf(plan, cycle) === null) continue;
    await createInvoice(s.tenant_id, plan, cycle, 'RENEWAL', system, new Date(s.current_period_end as string));
    result.renewal_invoices += 1;
  }

  // One usage snapshot a day per Sunday school (for the platform's charts)
  const tenants = must(await db().from('tenants').select('id').in('status', ['ACTIVE', 'SUSPENDED'])) as { id: string }[];
  const today = iso.slice(0, 10);
  for (const t of tenants) {
    try {
      const metrics = await tenantUsage(t.id);
      await db().from('usage_snapshots').upsert({ tenant_id: t.id, taken_on: today, metrics }, { onConflict: 'tenant_id,taken_on' });
      result.usage_snapshots += 1;
    } catch (e) {
      console.error('usage snapshot failed', t.id, e);
    }
  }

  await db().from('rate_limits').delete().lt('window_start', new Date(now.getTime() - DAY).toISOString());
  return result;
}
