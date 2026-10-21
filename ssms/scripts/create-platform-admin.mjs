// ─────────────────────────────────────────────────────────────────────────────
// Create a platform administrator — the SaaS owner's account for /platform
// (all Sunday schools, plans, payments). Separate from every Sunday-school
// role: nothing inside a Sunday school can grant this.
//
// Run from the ssms folder after applying migrations 040 and 041:
//   npm run create-platform-admin -- <phone> <password> "<Full Name>"
// If the phone already signs in to a Sunday school, the same login is used and
// the password given here is not applied.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { isValidPhone, normalizePhone, phoneToAuthEmail } from '../lib/auth/phone.ts';

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const [phoneArg, password, fullName] = process.argv.slice(2);
if (!phoneArg || !password || !fullName) {
  fail('Usage: npm run create-platform-admin -- <phone> <password> "<Full Name>"');
}
const phone = normalizePhone(phoneArg);
if (!isValidPhone(phone)) fail(`"${phoneArg}" is not a valid phone number (e.g. 0912345678)`);
if (password.length < 12) fail('Platform admin passwords must be at least 12 characters');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || url.includes('placeholder') || !serviceKey) {
  fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first');
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: already, error: checkError } = await db.from('platform_admins').select('id').eq('phone', phone).maybeSingle();
if (checkError) fail(`${checkError.message} — apply database/migrations/041_billing_and_platform.sql first`);
if (already) fail('This phone is already a platform administrator');

const { data: account } = await db.from('system_users').select('auth_user_id').eq('username', phone).limit(1).maybeSingle();
let authUserId = account?.auth_user_id ?? null;
let created = false;
if (!authUserId) {
  const { data, error } = await db.auth.admin.createUser({
    email: phoneToAuthEmail(phone),
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: fullName, platform_admin: true },
  });
  if (error || !data.user) fail(error?.message ?? 'Could not create the login');
  authUserId = data.user.id;
  created = true;
}

const { error } = await db.from('platform_admins').insert({ auth_user_id: authUserId, full_name: fullName, phone });
if (error) {
  if (created) await db.auth.admin.deleteUser(authUserId);
  fail(error.message);
}
await db.from('platform_audit_logs').insert({ actor_label: 'setup script', action: 'PLATFORM_ADMIN_CREATED', target_type: 'platform_admin', target_id: authUserId, details: { phone, full_name: fullName } });

console.log(`\n✔ Platform administrator ${fullName} created.`);
console.log(created
  ? `  Sign in with phone ${phone} and the password you chose; you will land on /platform.\n`
  : `  ${phone} already had a login: sign in with the existing password, then open /platform.\n`);
