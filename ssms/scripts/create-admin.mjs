// ─────────────────────────────────────────────────────────────────────────────
// Create a Super Administrator account for a Sunday school in Supabase.
//
// Run from the ssms folder after applying the migrations:
//   npm run create-admin -- <phone> <password> "<Full Name>" [MALE|FEMALE] [sunday-school-slug]
// e.g.
//   npm run create-admin -- 0912345678 "a-strong-password" "Yohannes Tesfaye"
// Without a slug the account is made in the default Sunday school (Hamere Hiwot).
// If the phone already signs in somewhere else, the account is linked to that
// login and the password given here is not used.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '../lib/auth/phone.ts';
import { provisionSystemUser } from '../lib/admin/provision.ts';

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const [phoneArg, password, fullName = 'System Administrator', genderArg = 'MALE', slug = ''] =
  process.argv.slice(2);
if (!phoneArg || !password) {
  fail('Usage: npm run create-admin -- <phone> <password> "<Full Name>" [MALE|FEMALE] [sunday-school-slug]');
}
const gender = genderArg.toUpperCase();
if (gender !== 'MALE' && gender !== 'FEMALE') fail('Gender must be MALE or FEMALE');

const phone = normalizePhone(phoneArg);
if (!isValidPhone(phone)) fail(`"${phoneArg}" is not a valid phone number (e.g. 0912345678)`);
if (password.length < 8) fail('Password must be at least 8 characters');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || url.includes('placeholder') || !serviceKey) {
  fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first');
}

const platform = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const tenantQuery = platform.from('tenants').select('id, name_en');
const { data: tenant, error: tenantError } = await (slug ? tenantQuery.eq('slug', slug) : tenantQuery.eq('is_default', true)).maybeSingle();
if (tenantError) fail(`${tenantError.message} — apply database/migrations/040_multi_tenancy.sql first`);
if (!tenant) fail(slug ? `No Sunday school with the address "${slug}"` : 'No default Sunday school found');

// Everything below is written as this Sunday school (the database checks every row)
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-ssms-tenant': tenant.id } },
});

const { data: role, error: roleError } = await db
  .from('roles')
  .select('id')
  .eq('tenant_id', tenant.id)
  .eq('code', 'SUPER_ADMIN')
  .maybeSingle();
if (roleError) fail(roleError.message);
if (!role) fail('SUPER_ADMIN role not found for this Sunday school');

let { data: unit } = await db
  .from('organization_units')
  .select('id')
  .eq('tenant_id', tenant.id)
  .eq('code', 'GENERAL_ASSEMBLY')
  .maybeSingle();
if (!unit) {
  ({ data: unit } = await db
    .from('organization_units')
    .select('id')
    .eq('tenant_id', tenant.id)
    .order('sort_order')
    .limit(1)
    .maybeSingle());
}
if (!unit) fail('No organization units found for this Sunday school');

try {
  const result = await provisionSystemUser(db, {
    phone,
    email: phoneToAuthEmail(phone),
    password,
    nameEn: fullName,
    nameAm: '',
    gender,
    roleId: role.id,
    unitId: unit.id,
    assignedBy: null,
    existingLogin: async (p) => {
      const { data } = await platform.from('system_users').select('auth_user_id').eq('username', p).limit(1).maybeSingle();
      return data?.auth_user_id ?? null;
    },
  });
  console.log(`\n✔ Super Administrator created in ${tenant.name_en} (system user ${result.id}).`);
  console.log(result.linked
    ? `  ${phone} already had a login: they sign in with their existing password.\n`
    : `  Sign in with phone ${phone} and the password you chose.\n`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
