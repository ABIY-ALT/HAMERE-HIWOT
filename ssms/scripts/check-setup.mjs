// ─────────────────────────────────────────────────────────────────────────────
// Check the Supabase setup: connection, tables, seed data, first admin, sign-ups.
// Prints counts and yes/no checks only — never keys or personal data.
//   npm run check-setup
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => console.log(`  ✖ ${msg}`);
let problems = 0;
const problem = (msg) => {
  problems++;
  bad(msg);
};

console.log('\nEnvironment (.env.local)');
if (!url || url.includes('placeholder')) problem('NEXT_PUBLIC_SUPABASE_URL is not set');
else ok(`Project URL ${url}`);
if (!anonKey || anonKey.includes('your-')) problem('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
else ok('Publishable/anon key is set');
if (!serviceKey || serviceKey.includes('your-')) problem('SUPABASE_SERVICE_ROLE_KEY is not set');
else ok('Secret/service-role key is set');
if (process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false') problem('NEXT_PUBLIC_USE_MOCK_DATA must be false');
else ok('Demo mode is off');
if (problems) process.exit(1);

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function count(table, filter) {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

console.log('\nDatabase tables');
const tables = [
  'organization_units', 'persons', 'system_users', 'roles', 'permissions',
  'role_permissions', 'user_unit_assignments', 'system_audit_logs', 'system_settings',
  'academic_years', 'classes', 'students', 'attendance_sessions', 'grades',
];
const counts = {};
for (const table of tables) {
  try {
    counts[table] = await count(table);
    ok(`${table.padEnd(22)} ${counts[table]} rows`);
  } catch (e) {
    problem(`${table}: ${e.message}`);
  }
}

console.log('\nSeed data & first administrator');
try {
  const { data: superAdmin } = await db.from('roles').select('id').eq('code', 'SUPER_ADMIN').maybeSingle();
  if (!superAdmin) problem('SUPER_ADMIN role missing — run migration 006');
  else {
    const granted = await count('role_permissions', (q) => q.eq('role_id', superAdmin.id));
    const total = counts.permissions ?? (await count('permissions'));
    if (granted >= total && total > 0) ok(`SUPER_ADMIN has all ${total} permissions`);
    else problem(`SUPER_ADMIN has ${granted} of ${total} permissions — re-run migration 006`);

    const admins = await count('user_unit_assignments', (q) =>
      q.eq('role_id', superAdmin.id).eq('is_active', true)
    );
    if (admins > 0) ok(`${admins} active Super Administrator account(s)`);
    else problem('No Super Administrator yet — run: npm run create-admin -- <phone> "<password>" "<name>"');
  }
  if ((counts.organization_units ?? 0) === 0) problem('No organization units — migration 004 did not run');
  const { error: subjectCols } = await db.from('subjects').select('instructor, syllabus').limit(1);
  if (subjectCols) problem('Subject instructor/syllabus columns missing — run migration 007_subject_details.sql');
  else ok('Migration 007 (subject details) applied');
} catch (e) {
  problem(e.message);
}

console.log('\nAuthentication');
try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
  const settings = await res.json();
  if (!res.ok) problem(`Could not read auth settings (HTTP ${res.status})`);
  else {
    if (settings.disable_signup) ok('Public sign-ups are off');
    else problem('Public sign-ups are ON — turn off "Allow new users to sign up" in Authentication settings');
    if (settings.external?.email) ok('Email/password provider is enabled');
    else problem('Email provider is disabled — enable it (phone logins use it internally)');
  }
} catch (e) {
  problem(`Auth settings: ${e.message}`);
}

console.log(problems ? `\n${problems} problem(s) found.\n` : '\nEverything looks good.\n');
process.exit(problems ? 1 : 0);
