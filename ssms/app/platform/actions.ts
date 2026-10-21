'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Platform owner actions (/platform). Each one checks the platform admin
// (authorizePlatform), validates its input and is written to
// platform_audit_logs. Sunday-school roles never reach here.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authorizePlatform, logPlatform } from '@/lib/platform/auth';
import { errorMessage } from '@/lib/auth/authorize';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { LIMIT_METRICS } from '@/lib/billing/access';
import { MODULE_CODES } from '@/lib/billing/modules';
import {
  confirmPayment,
  createInvoice,
  refundPayment,
  rejectPayment,
  setSubscription,
  voidInvoice,
} from '@/lib/billing/service';
import { createTenant, slugify } from '@/lib/tenant/provision';
import { existingLoginForPhone } from '@/lib/tenant/accounts';
import { DEFAULT_TENANT_ID } from '@/lib/tenant/db';

type Result = { ok: true } | { ok: false; error: string };
const done = (path: string): Result => {
  revalidatePath(path, 'layout');
  return { ok: true };
};
const uuid = z.string().uuid('Not found — reload the page');

// ── Sunday schools ───────────────────────────────────────────────────────────

const StatusSchema = z.object({
  id: uuid,
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING']),
  reason: z.string().trim().max(500),
});

/** Approve, suspend (everyone is locked out, data kept), reactivate or deactivate a Sunday school. */
export async function setTenantStatus(id: string, status: string, reason: string): Promise<Result> {
  try {
    const { admin, db } = await authorizePlatform();
    const input = StatusSchema.parse({ id, status, reason });
    if (input.id === DEFAULT_TENANT_ID && input.status !== 'ACTIVE') throw new Error('The default Sunday school cannot be suspended here');
    if (input.status !== 'ACTIVE' && !input.reason) throw new Error('Give a reason — the Sunday school sees it');
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('tenants')
      .update({
        status: input.status,
        status_reason: input.reason || null,
        ...(input.status === 'ACTIVE' ? { activated_at: now, suspended_at: null, deactivated_at: null } : {}),
        ...(input.status === 'SUSPENDED' ? { suspended_at: now } : {}),
        ...(input.status === 'DEACTIVATED' ? { deactivated_at: now } : {}),
      })
      .eq('id', input.id)
      .neq('status', 'TEMPLATE')
      .select('slug')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Not found');
    await logPlatform({ admin, tenantId: input.id, action: `TENANT_${input.status}`, targetType: 'tenant', targetId: input.id, details: { reason: input.reason } });
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const NewTenantSchema = z.object({
  name_en: z.string().trim().min(3).max(120),
  name_am: z.string().trim().max(120),
  slug: z.string().trim().toLowerCase(),
  city: z.string().trim().max(80),
  admin_name: z.string().trim().min(2).max(120),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number'),
  password: z.string().min(8, 'The first password must be at least 8 characters'),
  gender: z.enum(['MALE', 'FEMALE']),
});

/** A platform admin registers a Sunday school (it starts on the trial plan, ACTIVE). */
export async function createTenantAction(form: FormData): Promise<{ ok: true; id: string; linked: boolean } | { ok: false; error: string }> {
  try {
    const { admin } = await authorizePlatform();
    const raw = Object.fromEntries(['name_en', 'name_am', 'slug', 'city', 'admin_name', 'phone', 'password', 'gender'].map((k) => [k, String(form.get(k) ?? '')]));
    const input = NewTenantSchema.parse({ ...raw, slug: raw.slug || slugify(raw.name_en) });
    const result = await createTenant(
      {
        name_en: input.name_en,
        name_am: input.name_am,
        slug: input.slug,
        city: input.city,
        contact_phone: input.phone,
        contact_email: '',
        admin: { phone: input.phone, password: input.password, nameEn: input.admin_name, nameAm: '', gender: input.gender },
      },
      { createdVia: 'PLATFORM', actor: { type: 'PLATFORM_ADMIN', admin }, requireApproval: false }
    );
    revalidatePath('/platform', 'layout');
    return { ok: true, id: result.tenantId, linked: result.linkedLogin };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Subscriptions and invoices ───────────────────────────────────────────────

const limitShape = Object.fromEntries(LIMIT_METRICS.map((m) => [m, z.number().int().min(0).max(10_000_000).optional()]));
const SubscriptionSchema = z.object({
  plan_id: uuid,
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'SUSPENDED']),
  billing_cycle: z.enum(['MONTHLY', 'ANNUAL', 'NONE']),
  trial_ends_at: z.string().datetime({ offset: true }).nullable(),
  current_period_end: z.string().datetime({ offset: true }).nullable(),
  grace_days: z.number().int().min(0).max(90),
  limit_overrides: z.object(limitShape).strict(),
  feature_overrides: z.object({ add: z.array(z.enum(MODULE_CODES)).optional(), remove: z.array(z.enum(MODULE_CODES)).optional() }).strict(),
  notes: z.string().trim().max(1000).nullable(),
});

/** Set a Sunday school's subscription directly (complimentary plans, extensions, corrections, custom limits). */
export async function saveSubscription(tenantId: string, edit: z.input<typeof SubscriptionSchema>): Promise<Result> {
  try {
    const { admin } = await authorizePlatform();
    const input = SubscriptionSchema.parse(edit);
    await setSubscription(uuid.parse(tenantId), { ...input, limit_overrides: input.limit_overrides as Record<string, number> }, admin);
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** An invoice for a plan (the price comes from the plan). */
export async function createInvoiceAction(tenantId: string, planId: string, cycle: string): Promise<Result> {
  try {
    const { admin, db } = await authorizePlatform();
    const c = z.enum(['MONTHLY', 'ANNUAL']).parse(cycle);
    const { data: plan, error } = await db.from('plans').select('*').eq('id', uuid.parse(planId)).single();
    if (error) throw new Error(error.message);
    await createInvoice(uuid.parse(tenantId), { ...plan, price_monthly: plan.price_monthly === null ? null : Number(plan.price_monthly), price_annual: plan.price_annual === null ? null : Number(plan.price_annual) }, c, 'MANUAL', { type: 'PLATFORM_ADMIN', admin });
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function voidInvoiceAction(invoiceId: string): Promise<Result> {
  try {
    const { admin } = await authorizePlatform();
    await voidInvoice(uuid.parse(invoiceId), admin);
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Payments ─────────────────────────────────────────────────────────────────

/** The money is in the account: the invoice is paid and its plan applies. */
export async function confirmPaymentAction(paymentId: string, note: string): Promise<Result> {
  try {
    const { admin } = await authorizePlatform();
    await confirmPayment(uuid.parse(paymentId), admin, z.string().trim().max(500).parse(note) || undefined);
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function rejectPaymentAction(paymentId: string, note: string): Promise<Result> {
  try {
    const { admin } = await authorizePlatform();
    await rejectPayment(uuid.parse(paymentId), admin, z.string().trim().min(3, 'Say why — the Sunday school sees it').max(500).parse(note));
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function refundPaymentAction(paymentId: string, amount: number, note: string): Promise<Result> {
  try {
    const { admin } = await authorizePlatform();
    await refundPayment(uuid.parse(paymentId), admin, z.number().positive().parse(amount), z.string().trim().min(3).max(500).parse(note));
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Plans ────────────────────────────────────────────────────────────────────

const money = z.number().min(0).max(100_000_000).nullable();
const PlanSchema = z.object({
  id: uuid.nullable(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, 'Code: 2–30 capital letters, digits or _'),
  name_en: z.string().trim().min(2).max(60),
  name_am: z.string().trim().max(60),
  description_en: z.string().trim().max(500),
  description_am: z.string().trim().max(500),
  price_monthly: money,
  price_annual: money,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  is_free: z.boolean(),
  is_public: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(1000),
  features: z.array(z.enum(MODULE_CODES)),
  limits: z.object(limitShape).strict(),
  overage_pct: z.number().int().min(0).max(100),
});

export async function savePlan(plan: z.input<typeof PlanSchema>): Promise<Result> {
  try {
    const { admin, db } = await authorizePlatform();
    const { id, ...p } = PlanSchema.parse(plan);
    const row = { ...p, name_am: p.name_am || null, description_en: p.description_en || null, description_am: p.description_am || null, updated_at: new Date().toISOString() };
    const res = id ? await db.from('plans').update(row).eq('id', id).select('id').single() : await db.from('plans').insert(row).select('id').single();
    if (res.error?.code === '23505') throw new Error('Another plan already has this code');
    if (res.error) throw new Error(res.error.message);
    await logPlatform({ admin, action: id ? 'PLAN_UPDATED' : 'PLAN_CREATED', targetType: 'plan', targetId: res.data.id as string, details: row });
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

const BillingSettingsSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  trial_days: z.number().int().min(0).max(180),
  trial_plan_code: z.string().trim().toUpperCase(),
  after_trial_plan_code: z.string().trim().toUpperCase(),
  grace_days: z.number().int().min(0).max(90),
  invoice_due_days: z.number().int().min(1).max(60),
  warn_usage_pct: z.number().int().min(10).max(100),
  expired_mode: z.enum(['read_only', 'free_plan']),
});
const RegistrationSchema = z.object({ open: z.boolean(), require_approval: z.boolean() });
const ManualSchema = z.object({
  instructions_en: z.string().trim().max(2000),
  instructions_am: z.string().trim().max(2000),
  accounts: z.array(z.object({ bank: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(120), number: z.string().trim().min(3).max(60) })).max(10),
});

export async function savePlatformSettings(input: {
  billing: z.input<typeof BillingSettingsSchema>;
  registration: z.input<typeof RegistrationSchema>;
  manual: z.input<typeof ManualSchema>;
}): Promise<Result> {
  try {
    const { admin, db } = await authorizePlatform();
    const values = {
      billing: BillingSettingsSchema.parse(input.billing),
      registration: RegistrationSchema.parse(input.registration),
      manual_payment: ManualSchema.parse(input.manual),
    };
    const now = new Date().toISOString();
    const { error } = await db
      .from('platform_settings')
      .upsert(Object.entries(values).map(([key, value]) => ({ key, value, updated_by: admin.id, updated_at: now })), { onConflict: 'key' });
    if (error) throw new Error(error.message);
    await logPlatform({ admin, action: 'SETTINGS_UPDATED', targetType: 'platform_settings', details: values });
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Switch a module off (not offered on any plan, its pages close everywhere) or on again. */
export async function setModuleActive(code: string, active: boolean): Promise<Result> {
  try {
    const { admin, db } = await authorizePlatform();
    const c = z.enum(MODULE_CODES).parse(code);
    const { error } = await db.from('platform_modules').update({ is_active: active }).eq('code', c);
    if (error) throw new Error(error.message);
    await logPlatform({ admin, action: active ? 'MODULE_ENABLED' : 'MODULE_DISABLED', targetType: 'module', targetId: c });
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ── Platform administrators ──────────────────────────────────────────────────

const AdminSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number'),
  password: z.string().min(12, 'Platform passwords need at least 12 characters'),
});

/** Another platform administrator. A phone that already signs in keeps its login (and password). */
export async function addPlatformAdmin(input: z.input<typeof AdminSchema>): Promise<{ ok: true; linked: boolean } | { ok: false; error: string }> {
  try {
    const { admin, db } = await authorizePlatform();
    const a = AdminSchema.parse(input);
    let authUserId = await existingLoginForPhone(a.phone);
    const linked = Boolean(authUserId);
    if (!authUserId) {
      const { data, error } = await db.auth.admin.createUser({ email: phoneToAuthEmail(a.phone), password: a.password, email_confirm: true, user_metadata: { phone: a.phone, full_name: a.full_name, platform_admin: true } });
      if (error || !data.user) throw new Error(error?.message ?? 'Could not create the login');
      authUserId = data.user.id;
    }
    const { data: row, error } = await db.from('platform_admins').insert({ auth_user_id: authUserId, full_name: a.full_name, phone: a.phone, created_by: admin.id }).select('id').single();
    if (error) {
      if (!linked) await db.auth.admin.deleteUser(authUserId);
      throw new Error(error.code === '23505' ? 'Already a platform administrator' : error.message);
    }
    await logPlatform({ admin, action: 'PLATFORM_ADMIN_ADDED', targetType: 'platform_admin', targetId: row.id as string, details: { phone: a.phone, full_name: a.full_name } });
    revalidatePath('/platform', 'layout');
    return { ok: true, linked };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setPlatformAdminActive(id: string, active: boolean): Promise<Result> {
  try {
    const { admin, db } = await authorizePlatform();
    if (uuid.parse(id) === admin.id) throw new Error('You cannot switch off your own access');
    const { error } = await db.from('platform_admins').update({ is_active: active }).eq('id', id);
    if (error) throw new Error(error.message);
    await logPlatform({ admin, action: active ? 'PLATFORM_ADMIN_ENABLED' : 'PLATFORM_ADMIN_DISABLED', targetType: 'platform_admin', targetId: id });
    return done('/platform');
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
