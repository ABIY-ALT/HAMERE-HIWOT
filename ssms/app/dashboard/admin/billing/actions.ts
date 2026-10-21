'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Billing & plan (SYSTEM_CONFIGURE — kept while the system is read-only, so an
// unpaid Sunday school can still pay). Everything is for the signed-in user's
// own Sunday school; prices and amounts come from the plans on the server.
// The work is in lib/billing/service.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { authorize, errorMessage } from '@/lib/auth/authorize';
import type { ActionResult, Loaded } from '@/lib/admin/types';
import type { PlanRow, SubscriptionRow, TenantAccess } from '@/lib/billing/access';
import {
  billingSettings,
  choosePlan,
  invoicesOf,
  loadPlans,
  manualPaymentSettings,
  paymentsOf,
  setCancelAtPeriodEnd,
  submitManualPayment,
  subscriptionOf,
  tenantUsage,
  uploadPaymentProof,
  type InvoiceRow,
  type ManualPaymentSettings,
  type PaymentRow,
} from '@/lib/billing/service';
import { rateLimit } from '@/lib/security/rate-limit';
import { isValidPhone, normalizePhone } from '@/lib/auth/phone';

export interface BillingPage {
  tenant: { name_en: string; name_am: string | null; slug: string };
  access: TenantAccess;
  subscription: Pick<SubscriptionRow, 'status' | 'billing_cycle' | 'trial_ends_at' | 'current_period_end' | 'cancel_at_period_end' | 'grace_days'> | null;
  currentPlanId: string | null;
  pendingPlan: string | null;
  plans: PlanRow[];
  usage: Record<string, number>;
  warnPct: number;
  invoices: InvoiceRow[];
  payments: Omit<PaymentRow, 'proof_path'>[];
  manual: ManualPaymentSettings;
}

export async function loadBilling(): Promise<Loaded<BillingPage>> {
  if (!isSupabaseEnabled()) return { mode: 'demo' };
  try {
    const { me } = await authorize('SYSTEM_CONFIGURE');
    const tenantId = me.tenant.id;
    const [sub, plans, usage, settings, invoices, payments, manual] = await Promise.all([
      subscriptionOf(tenantId),
      loadPlans({ publicOnly: true }),
      tenantUsage(tenantId),
      billingSettings(),
      invoicesOf(tenantId),
      paymentsOf(tenantId),
      manualPaymentSettings(),
    ]);
    const pending = sub?.pending_plan_id ? plans.find((p) => p.id === sub.pending_plan_id) : null;
    return {
      mode: 'live',
      data: {
        tenant: { name_en: me.tenant.name_en, name_am: me.tenant.name_am, slug: me.tenant.slug },
        access: me.tenant.access,
        subscription: sub
          ? {
              status: sub.status,
              billing_cycle: sub.billing_cycle,
              trial_ends_at: sub.trial_ends_at,
              current_period_end: sub.current_period_end,
              cancel_at_period_end: sub.cancel_at_period_end,
              grace_days: sub.grace_days,
            }
          : null,
        currentPlanId: sub?.plan_id ?? null,
        pendingPlan: pending?.name_en ?? null,
        plans,
        usage,
        warnPct: settings.warn_usage_pct,
        invoices,
        payments: payments.map(({ proof_path: _p, ...p }) => (void _p, p)),
        manual,
      },
    };
  } catch (e) {
    return { mode: 'error', error: errorMessage(e) };
  }
}

const ChooseSchema = z.object({
  plan: z.string().regex(/^[A-Z0-9_]{2,30}$/, 'Choose a plan'),
  cycle: z.enum(['MONTHLY', 'ANNUAL', 'NONE']),
});

/** Choose a plan: free ones switch now (or after the paid period); paid ones give an invoice to pay. */
export async function choosePlanAction(plan: string, cycle: string): Promise<{ ok: true; invoiceId: string | null } | { ok: false; error: string }> {
  try {
    const { me } = await authorize('SYSTEM_CONFIGURE');
    const input = ChooseSchema.parse({ plan, cycle });
    if (!(await rateLimit(`billing-plan:${me.tenant.id}`, 20, 3600))) throw new Error('Too many changes — try again in an hour');
    const invoice = await choosePlan(me.tenant.id, input.plan, input.cycle, {
      type: 'TENANT_USER',
      systemUserId: me.systemUser.id,
      label: me.person.full_name_en,
    });
    return { ok: true, invoiceId: invoice?.id ?? null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const PaymentSchema = z.object({
  invoice_id: z.string().uuid('Choose the invoice'),
  method: z.enum(['BANK_TRANSFER', 'MOBILE_MONEY', 'CASH', 'OTHER']),
  reference_no: z.string().trim().min(4, 'Enter the transaction reference from the receipt').max(80),
  payer_name: z.string().trim().min(2, 'Enter who paid').max(120),
  payer_phone: z.string().trim().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number'),
});

/** Report a payment made by bank or mobile money (with the receipt) for a platform admin to confirm. */
export async function submitPaymentAction(form: FormData): Promise<ActionResult> {
  try {
    const { me } = await authorize('SYSTEM_CONFIGURE');
    if (!(await rateLimit(`billing-pay:${me.tenant.id}`, 10, 3600))) throw new Error('Too many payments reported — try again in an hour');
    const input = PaymentSchema.parse({
      invoice_id: form.get('invoice_id'),
      method: form.get('method'),
      reference_no: form.get('reference_no'),
      payer_name: form.get('payer_name'),
      payer_phone: form.get('payer_phone'),
    });
    const file = form.get('receipt');
    const proof = file instanceof File && file.size > 0 ? await uploadPaymentProof(me.tenant.id, input.invoice_id, file) : null;
    await submitManualPayment(
      me.tenant.id,
      input.invoice_id,
      { method: input.method, reference_no: input.reference_no, payer_name: input.payer_name, payer_phone: input.payer_phone, proof_path: proof },
      { systemUserId: me.systemUser.id, label: me.person.full_name_en }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Stop at the end of the paid period (or undo that). */
export async function setCancelAction(cancel: boolean): Promise<ActionResult> {
  try {
    const { me } = await authorize('SYSTEM_CONFIGURE');
    await setCancelAtPeriodEnd(me.tenant.id, cancel, { type: 'TENANT_USER', systemUserId: me.systemUser.id, label: me.person.full_name_en });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
