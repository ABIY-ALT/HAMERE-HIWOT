'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Sign-up of a new Sunday school (no sign-in needed). Open only while the
// platform's registration setting is on; limited per address. The work is in
// lib/tenant/provision.ts (tenant, default structure, trial, first admin).
// Afterwards the new administrator is signed in and lands on Getting started —
// unless their phone already had a login (then they sign in with it), or
// sign-ups wait for a platform admin's approval.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { z } from 'zod';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createSessionClient } from '@/lib/supabase/server';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '@/lib/auth/phone';
import { TENANT_COOKIE } from '@/lib/auth/session';
import { platformClient } from '@/lib/tenant/db';
import { createTenant, slugProblem, slugTaken, slugify } from '@/lib/tenant/provision';
import { rateLimit, requestIp } from '@/lib/security/rate-limit';
import { errorMessage } from '@/lib/auth/authorize';

export type RegisterResult =
  | { ok: true; to: string; note: 'SIGNED_IN' | 'USE_EXISTING_PASSWORD' | 'PENDING_APPROVAL' }
  | { ok: false; error: string };

const Schema = z.object({
  name_en: z.string().trim().min(3, 'Enter the Sunday school’s name').max(120),
  name_am: z.string().trim().max(120),
  slug: z.string().trim().toLowerCase(),
  city: z.string().trim().max(80),
  contact_email: z.union([z.literal(''), z.string().trim().email('Enter a valid e-mail or leave it empty')]),
  admin_name_en: z.string().trim().min(2, 'Enter your full name').max(120),
  admin_name_am: z.string().trim().max(120),
  gender: z.enum(['MALE', 'FEMALE']),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, 'Enter a valid phone number, e.g. 0912345678'),
  password: z.string().min(8, 'The password must be at least 8 characters').max(72),
});

async function registration(): Promise<{ open: boolean; require_approval: boolean }> {
  const { data } = await platformClient().from('platform_settings').select('value').eq('key', 'registration').maybeSingle();
  const v = (data?.value ?? {}) as { open?: boolean; require_approval?: boolean };
  return { open: v.open !== false, require_approval: v.require_approval === true };
}

/** Is this address free? (for the form, as people type) */
export async function checkSlug(slug: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseEnabled()) return { ok: false, message: 'Sign-up needs the database' };
  const problem = slugProblem(slug);
  if (problem) return { ok: false, message: problem };
  if (!(await rateLimit(`slug-check:${await requestIp()}`, 120, 3600))) return { ok: false, message: 'Too many checks — wait a little' };
  return (await slugTaken(slug)) ? { ok: false, message: 'Already used by another Sunday school' } : { ok: true };
}

export async function registerSundaySchool(form: FormData): Promise<RegisterResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Sign-up needs the database (demo mode)' };
  try {
    const settings = await registration();
    if (!settings.open) throw new Error('New sign-ups are closed for now. Please contact us.');
    if (!(await rateLimit(`register-ip:${await requestIp()}`, 5, 3600))) throw new Error('Too many sign-ups from this address — try again in an hour');
    if (String(form.get('website') ?? '') !== '') return { ok: true, to: '/login', note: 'PENDING_APPROVAL' }; // robots

    const raw = Object.fromEntries(['name_en', 'name_am', 'slug', 'city', 'contact_email', 'admin_name_en', 'admin_name_am', 'gender', 'phone', 'password'].map((k) => [k, String(form.get(k) ?? '')]));
    const input = Schema.parse({ ...raw, slug: raw.slug || slugify(raw.name_en) });
    if (!(await rateLimit(`register-phone:${input.phone}`, 3, 86400))) throw new Error('Too many sign-ups with this phone today');

    const result = await createTenant(
      {
        name_en: input.name_en,
        name_am: input.name_am,
        slug: input.slug,
        city: input.city,
        contact_phone: input.phone,
        contact_email: input.contact_email,
        admin: { phone: input.phone, password: input.password, nameEn: input.admin_name_en, nameAm: input.admin_name_am, gender: input.gender },
      },
      { createdVia: 'SELF_SIGNUP', actor: { type: 'SYSTEM' }, requireApproval: settings.require_approval }
    );

    const jar = await cookies();
    jar.set(TENANT_COOKIE, result.tenantId, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    if (result.status === 'PENDING') return { ok: true, to: '/login', note: 'PENDING_APPROVAL' };
    if (result.linkedLogin) return { ok: true, to: '/login', note: 'USE_EXISTING_PASSWORD' };

    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithPassword({ email: phoneToAuthEmail(input.phone), password: input.password });
    if (error) return { ok: true, to: '/login', note: 'USE_EXISTING_PASSWORD' };
    return { ok: true, to: '/dashboard/welcome', note: 'SIGNED_IN' };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
