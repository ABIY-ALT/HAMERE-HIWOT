// ─────────────────────────────────────────────────────────────────────────────
// Environment settings, read in one place. Values pasted into a hosting
// dashboard often pick up surrounding spaces or quotes; those are removed so
// they can't silently switch the site into demo mode.
//
// NEXT_PUBLIC_ values must be read with literal `process.env.NAME` access so
// Next.js can build them into the browser code.
// ─────────────────────────────────────────────────────────────────────────────

/** Trims spaces and one pair of matching surrounding quotes. Empty → undefined. */
export function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  return v || undefined;
}

export const env = {
  supabaseUrl: () => cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceKey: () => cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  useMockData: () => cleanEnv(process.env.NEXT_PUBLIC_USE_MOCK_DATA),
  vapidPublicKey: () => cleanEnv(process.env.VAPID_PUBLIC_KEY),
  vapidPrivateKey: () => cleanEnv(process.env.VAPID_PRIVATE_KEY),
  vapidSubject: () => cleanEnv(process.env.VAPID_SUBJECT),
};

/** Like the getters above, but throws a clear error when the setting is missing. */
export function requireEnv(name: keyof typeof env, label: string): string {
  const value = env[name]();
  if (!value) throw new Error(`Missing environment variable ${label}`);
  return value;
}
