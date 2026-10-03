// ─────────────────────────────────────────────────────────────────────────────
// Proxy — keeps the Supabase session cookie fresh so Server Components always
// see a valid session. Does nothing in demo mode.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { env } from '@/lib/env';

export async function proxy(request: NextRequest) {
  if (!isSupabaseEnabled()) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    env.supabaseUrl()!,
    env.supabaseAnonKey()!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the access token if it has expired.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
