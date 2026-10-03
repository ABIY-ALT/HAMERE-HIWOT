// ─────────────────────────────────────────────────────────────────────────────
// GET /api/status — is the site connected to the database, and which settings
// is it missing? Reports only whether each setting is present and looks right;
// it never shows a value.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { cleanEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** 'ok', 'missing', or what looks wrong — never the value itself. */
function inspect(raw: string | undefined, looksRight: (v: string) => boolean): string {
  if (raw === undefined || raw.trim() === '') return 'missing';
  const notes: string[] = [];
  if (raw !== raw.trim()) notes.push('extra spaces (ignored)');
  if (/^['"]|['"]$/.test(raw.trim())) notes.push('quotes around the value (ignored)');
  if (/^[A-Z][A-Z0-9_]*=/.test(raw.trim())) notes.push('the setting name was pasted into the value');
  const value = cleanEnv(raw) ?? '';
  if (!looksRight(value)) notes.push('unexpected format');
  return notes.length ? notes.join('; ') : 'ok';
}

const jwtOr = (prefix: string) => (v: string) => v.startsWith('eyJ') || v.startsWith(prefix);

export function GET() {
  // NEXT_PUBLIC_ settings are fixed into the site when it is built: `built` shows
  // what the last build saw, `running` what the server has now. If they differ,
  // the site needs "Save, rebuild, and deploy" (or "Clear build cache & deploy").
  const runtime = (name: string) => process.env[name];
  const supabaseUrl = (v: string) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v);

  const body = {
    mode: isSupabaseEnabled() ? 'live (connected to the database)' : 'DEMO (sample data, nothing is saved)',
    built: {
      NEXT_PUBLIC_SUPABASE_URL: inspect(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: inspect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, jwtOr('sb_publishable_')),
      NEXT_PUBLIC_USE_MOCK_DATA: inspect(process.env.NEXT_PUBLIC_USE_MOCK_DATA, (v) => v.toLowerCase() === 'false'),
    },
    running: {
      NEXT_PUBLIC_SUPABASE_URL: inspect(runtime('NEXT_PUBLIC_SUPABASE_URL'), supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: inspect(runtime('NEXT_PUBLIC_SUPABASE_ANON_KEY'), jwtOr('sb_publishable_')),
      NEXT_PUBLIC_USE_MOCK_DATA: inspect(runtime('NEXT_PUBLIC_USE_MOCK_DATA'), (v) => v.toLowerCase() === 'false'),
      SUPABASE_SERVICE_ROLE_KEY: inspect(runtime('SUPABASE_SERVICE_ROLE_KEY'), jwtOr('sb_secret_')),
      VAPID_PUBLIC_KEY: inspect(runtime('VAPID_PUBLIC_KEY'), (v) => /^[A-Za-z0-9_-]{80,}$/.test(v)),
      VAPID_PRIVATE_KEY: inspect(runtime('VAPID_PRIVATE_KEY'), (v) => /^[A-Za-z0-9_-]{40,}$/.test(v)),
      VAPID_SUBJECT: inspect(runtime('VAPID_SUBJECT'), (v) => /^(https:|mailto:)/.test(v)),
    },
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
