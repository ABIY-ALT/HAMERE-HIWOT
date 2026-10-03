// ─────────────────────────────────────────────────────────────────────────────
// Supabase mode switch
//
// The app runs against Supabase only when a real project URL + anon key are set
// and NEXT_PUBLIC_USE_MOCK_DATA is "false". Otherwise it stays in demo mode
// (hardcoded demo logins, mock data, nothing saved).
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '@/lib/env';

export function isSupabaseEnabled(): boolean {
  const url = env.supabaseUrl();
  return Boolean(
    url &&
      !url.includes('placeholder') &&
      !url.includes('your-project-ref') &&
      env.supabaseAnonKey() &&
      env.useMockData()?.toLowerCase() === 'false'
  );
}
