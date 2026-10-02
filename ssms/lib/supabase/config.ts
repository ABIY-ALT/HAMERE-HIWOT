// ─────────────────────────────────────────────────────────────────────────────
// Supabase mode switch
//
// The app runs against Supabase only when a real project URL + anon key are set
// and NEXT_PUBLIC_USE_MOCK_DATA is "false". Otherwise it stays in demo mode
// (hardcoded demo logins, mock data, nothing saved).
// ─────────────────────────────────────────────────────────────────────────────

export function isSupabaseEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(
    url &&
      !url.includes('placeholder') &&
      !url.includes('your-project-ref') &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'false'
  );
}
