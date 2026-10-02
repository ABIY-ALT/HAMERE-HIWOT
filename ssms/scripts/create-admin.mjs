// ─────────────────────────────────────────────────────────────────────────────
// Create the first Super Administrator account in Supabase.
//
// Run from the ssms folder after applying migrations 001–006:
//   npm run create-admin -- <phone> <password> "<Full Name>"
// e.g.
//   npm run create-admin -- 0912345678 "a-strong-password" "Yohannes Tesfaye"
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

const [phoneArg, password, fullName = 'System Administrator', genderArg = 'MALE'] =
  process.argv.slice(2);
if (!phoneArg || !password) {
  fail('Usage: npm run create-admin -- <phone> <password> "<Full Name>" [MALE|FEMALE]');
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

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: role, error: roleError } = await db
  .from('roles')
  .select('id')
  .eq('code', 'SUPER_ADMIN')
  .maybeSingle();
if (roleError) fail(roleError.message);
if (!role) fail('SUPER_ADMIN role not found — run database/migrations/006_admin_settings.sql first');

let { data: unit } = await db
  .from('organization_units')
  .select('id')
  .eq('code', 'GENERAL_ASSEMBLY')
  .maybeSingle();
if (!unit) {
  ({ data: unit } = await db
    .from('organization_units')
    .select('id')
    .order('sort_order')
    .limit(1)
    .maybeSingle());
}
if (!unit) fail('No organization units found — run database/migrations/004_seed_data.sql first');

try {
  const id = await provisionSystemUser(db, {
    phone,
    email: phoneToAuthEmail(phone),
    password,
    nameEn: fullName,
    nameAm: '',
    gender,
    roleId: role.id,
    unitId: unit.id,
    assignedBy: null,
  });
  console.log(`\n✔ Super Administrator created (system user ${id}).`);
  console.log(`  Sign in with phone ${phone} and the password you chose.\n`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
