// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Layout — wraps all /dashboard/* routes
// Provides AuthContext + LangContext with mock user in dev mode
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { LangProvider } from '@/contexts/LangContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { MOCK_CURRENT_USER } from '@/lib/mock/data';


export const metadata: Metadata = {
  title: {
    template: '%s | SSMS Dashboard',
    default: 'Dashboard | SSMS',
  },
};

async function getCurrentUser() {
  const hasRealSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
    process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'false';

  if (!hasRealSupabase) {
    return {
      ...MOCK_CURRENT_USER,
      // Serialize Set → Array for server→client boundary
      permissions: Array.from(MOCK_CURRENT_USER.permissions),
    };
  }
  // TODO: implement real Supabase session loading here (Phase 4)
  return null;
}

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

  return (
    <LangProvider defaultLocale="en">
      <AuthProvider initialUser={user as Parameters<typeof AuthProvider>[0]['initialUser']}>
        <DashboardLayout>
          {children}
        </DashboardLayout>
      </AuthProvider>
    </LangProvider>
  );
}
