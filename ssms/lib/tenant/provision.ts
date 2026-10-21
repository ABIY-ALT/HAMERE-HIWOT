// ─────────────────────────────────────────────────────────────────────────────
// A new Sunday school (server only): sign-up at /register, or a platform admin
// on /platform/tenants. Order:
//   1. check everything that can be checked (address free, phone, password);
//   2. the tenant row (ACTIVE, or PENDING when sign-ups need approval);
//   3. the default structure from the template tenant (clone_tenant_config:
//      units, governance bodies, positions, roles and their permissions);
//   4. the trial subscription (platform billing settings);
//   5. its first Super Administrator (a login shared with another Sunday
//      school is linked, its password left as it is).
// If 2–5 fail half-way, the tenant is marked DEACTIVATED with the reason, so
// a platform admin sees it — nothing is left half-working.
// ─────────────────────────────────────────────────────────────────────────────

import { platformClient, tenantClient } from './db';
import { RESERVED_SLUGS } from './context';
import { existingLoginForPhone } from './accounts';
import { provisionSystemUser } from '@/lib/admin/provision';
import { phoneToAuthEmail } from '@/lib/auth/phone';
import { startTrial, type Actor } from '@/lib/billing/service';
import { logPlatform } from '@/lib/platform/auth';

export const TEMPLATE_TENANT_ID = 'a0000000-0000-4000-8000-000000000000';

export interface NewTenantInput {
  name_en: string;
  name_am: string;
  slug: string;
  city: string;
  contact_phone: string;
  contact_email: string;
  admin: {
    phone: string;
    password: string;
    nameEn: string;
    nameAm: string;
    gender: 'MALE' | 'FEMALE';
  };
}

export interface NewTenantResult {
  tenantId: string;
  slug: string;
  status: 'ACTIVE' | 'PENDING';
  /** The admin's phone already had a login: they sign in with their existing password */
  linkedLogin: boolean;
}

/** "Hamere Hiwot Sunday School" → "hamere-hiwot-sunday-school" (3–40 characters) */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return 'The address may use a–z, 0–9 and dashes (3–40 characters)';
  if (RESERVED_SLUGS.has(slug)) return 'That address is reserved — choose another';
  return null;
}

export async function slugTaken(slug: string): Promise<boolean> {
  const { data } = await platformClient().from('tenants').select('id').eq('slug', slug).maybeSingle();
  return Boolean(data);
}

/** A free student-number prefix from the address: "debre-selam" → "DS", then "DSE", "DS2"… */
async function freePrefix(slug: string): Promise<string> {
  const words = slug.split('-').filter(Boolean);
  const letters = slug.replace(/[^a-z]/g, '').toUpperCase();
  const initials = words.map((w) => w[0]).join('').replace(/[^a-z]/gi, '').toUpperCase();
  const candidates = [initials.slice(0, 4), letters.slice(0, 3), letters.slice(0, 4), letters.slice(0, 5), letters.slice(0, 6)]
    .filter((c) => c.length >= 2 && c !== 'REG' && c !== 'TPL');
  const db = platformClient();
  for (const c of [...new Set(candidates)]) {
    const { data } = await db.from('tenants').select('id').eq('reg_prefix', c).maybeSingle();
    if (!data) return c;
  }
  for (let i = 0; i < 26 * 26; i++) {
    const c = `S${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
    const { data } = await db.from('tenants').select('id').eq('reg_prefix', c).maybeSingle();
    if (!data) return c;
  }
  throw new Error('Could not find a free student-number prefix');
}

export async function createTenant(
  input: NewTenantInput,
  how: { createdVia: 'SELF_SIGNUP' | 'PLATFORM'; actor: Actor; requireApproval: boolean }
): Promise<NewTenantResult> {
  const problem = slugProblem(input.slug);
  if (problem) throw new Error(problem);
  if (await slugTaken(input.slug)) throw new Error('That address is already used by another Sunday school');

  const db = platformClient();
  const status = how.requireApproval ? 'PENDING' : 'ACTIVE';
  const { data: tenant, error } = await db
    .from('tenants')
    .insert({
      slug: input.slug,
      name_en: input.name_en,
      name_am: input.name_am || null,
      status,
      reg_prefix: await freePrefix(input.slug),
      city: input.city || null,
      contact_name: input.admin.nameEn,
      contact_phone: input.contact_phone || input.admin.phone,
      contact_email: input.contact_email || null,
      created_via: how.createdVia,
      activated_at: status === 'ACTIVE' ? new Date().toISOString() : null,
    })
    .select('id, slug')
    .single();
  if (error?.code === '23505') throw new Error('That address is already used by another Sunday school');
  if (error || !tenant) throw new Error(error?.message ?? 'Could not create the Sunday school');
  const tenantId = tenant.id as string;

  try {
    const { error: cloneError } = await db.rpc('clone_tenant_config', { p_src: TEMPLATE_TENANT_ID, p_dst: tenantId });
    if (cloneError) throw new Error(cloneError.message);

    // The parish profile starts with the Sunday school's own name
    const scoped = tenantClient(tenantId);
    await scoped.from('system_settings').upsert(
      { key: 'parish_profile', value: { parish_name_en: input.name_en, parish_name_am: input.name_am || input.name_en, diocese: '', foundation_year: '', motto: '' } },
      { onConflict: 'key' }
    );

    await startTrial(tenantId, how.actor);

    const [{ data: role }, { data: unit }] = await Promise.all([
      scoped.from('roles').select('id').eq('code', 'SUPER_ADMIN').maybeSingle(),
      scoped.from('organization_units').select('id').order('sort_order').limit(1).maybeSingle(),
    ]);
    if (!role || !unit) throw new Error('The default structure is missing (template tenant)');

    const admin = await provisionSystemUser(scoped, {
      phone: input.admin.phone,
      email: phoneToAuthEmail(input.admin.phone),
      password: input.admin.password,
      nameEn: input.admin.nameEn,
      nameAm: input.admin.nameAm,
      gender: input.admin.gender,
      roleId: role.id as string,
      unitId: unit.id as string,
      assignedBy: null,
      existingLogin: existingLoginForPhone,
    });

    await logPlatform({
      admin: how.actor.type === 'PLATFORM_ADMIN' ? how.actor.admin : null,
      actorLabel: how.actor.type === 'PLATFORM_ADMIN' ? undefined : `signup:${input.admin.phone}`,
      tenantId,
      action: 'TENANT_CREATED',
      targetType: 'tenant',
      targetId: tenantId,
      details: { slug: input.slug, name: input.name_en, via: how.createdVia, status },
    });
    return { tenantId, slug: tenant.slug as string, status, linkedLogin: admin.linked };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    await db.from('tenants').update({ status: 'DEACTIVATED', status_reason: `Sign-up did not finish: ${reason}`.slice(0, 500), deactivated_at: new Date().toISOString() }).eq('id', tenantId);
    await logPlatform({ tenantId, actorLabel: 'system', action: 'TENANT_CREATE_FAILED', targetType: 'tenant', targetId: tenantId, details: { reason } });
    throw e;
  }
}
