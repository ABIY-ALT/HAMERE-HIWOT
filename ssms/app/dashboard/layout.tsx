// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Layout — wraps all /dashboard/* routes
// Provides AuthContext + LangContext for the signed-in user (redirects to /login otherwise)
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { LangProvider } from '@/contexts/LangContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getCurrentUser } from '@/lib/auth/session';


export const metadata: Metadata = {
  title: {
    template: '%s | SSMS Dashboard',
    default: 'Dashboard | SSMS',
  },
};

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
