// ─────────────────────────────────────────────────────────────────────────────
// /platform — the SaaS owner's area: every Sunday school, plans, payments,
// settings and the platform audit log. Platform administrators only
// (platform_admins); a Sunday-school role never opens it. Each page and
// action checks the admin again on the server.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformAdmin } from '@/lib/platform/auth';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { createSessionClient } from '@/lib/supabase/server';
import { PlatformSignOut } from '@/components/platform/PlatformSignOut';

export const metadata: Metadata = { title: 'Platform administration' };
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/platform', label: 'Overview' },
  { href: '/platform/tenants', label: 'Sunday schools' },
  { href: '/platform/payments', label: 'Payments' },
  { href: '/platform/plans', label: 'Plans' },
  { href: '/platform/settings', label: 'Settings' },
  { href: '/platform/audit', label: 'Audit log' },
  { href: '/platform/admins', label: 'Administrators' },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) {
    // Not signed in: sign in and come back here. Signed in but not a platform admin: their own dashboard.
    const signedIn = isSupabaseEnabled() && Boolean((await (await createSessionClient()).auth.getUser()).data.user);
    redirect(signedIn ? '/dashboard' : '/login?next=/platform');
  }

  return (
    <div className="min-h-screen bg-[var(--surface-2)]">
      <header className="bg-[#0c2248] text-white">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-4">
          <span className="font-bold tracking-tight">SSMS Platform</span>
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="px-3 py-1.5 rounded-lg text-indigo-100 hover:bg-white/10 whitespace-nowrap">
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="hidden sm:block text-xs text-indigo-200 truncate max-w-[10rem]">{admin.full_name}</span>
          <PlatformSignOut />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
