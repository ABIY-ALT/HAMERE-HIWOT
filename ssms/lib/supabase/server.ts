// ─────────────────────────────────────────────────────────────────────────────
// Supabase clients — SERVER ONLY (uses cookies and the service-role key)
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';


/** Client bound to the visitor's session cookies. */
export async function createSessionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv('supabaseUrl', 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('supabaseAnonKey', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // Server Components can't write cookies; proxy.ts refreshes the session there.
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* read-only context */
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. Only use after the caller's permissions
 * have been checked (see getCurrentUser / authorize in admin actions).
 *
 * `actorId` (a system_users id) is sent as the x-ssms-actor header; the audit
 * trigger (migration 011) records it as the person who made each change.
 */
export function createAdminClient(actorId?: string): SupabaseClient {
  return createClient(
    requireEnv('supabaseUrl', 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('supabaseServiceKey', 'SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: actorId ? { headers: { 'x-ssms-actor': actorId } } : undefined,
    }
  );
}
