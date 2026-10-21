'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { NotInPlan, PlanNotice } from '@/components/billing/PlanNotice';
import { MODULE_LABELS, moduleForPath } from '@/lib/billing/modules';
import { sidebarVars } from '@/lib/branding';

interface DashboardLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export default function DashboardLayout({ children, breadcrumbs }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // The mobile drawer is open only on the page where it was opened,
  // so tapping a menu link closes it automatically.
  const [mobileOpenOn, setMobileOpenOn] = useState<string | null>(null);
  const mobileOpen = mobileOpenOn === pathname;
  const { user } = useAuth();
  const { t } = useLang();
  // Pages of a module the plan does not include (the server refuses their actions too)
  const pageModule = moduleForPath(pathname);
  const access = user?.tenant?.access;
  const missing = pageModule && access && !access.modules.includes(pageModule) ? pageModule : null;
  // A suspended Sunday school: only the profile page (to sign out / switch) stays open
  const blocked = access?.mode === 'blocked' && !pathname.startsWith('/dashboard/profile');

  return (
    <div className="min-h-screen bg-[var(--surface-2)]" style={user?.tenant ? (sidebarVars(user.tenant.brand.color) as React.CSSProperties) : undefined}>
      <Sidebar
        collapsed={sidebarCollapsed && !mobileOpen}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onCloseMobile={() => setMobileOpenOn(null)}
      />

      <div
        className={cn(
          'main-content transition-all duration-300',
          sidebarCollapsed && 'sidebar-collapsed'
        )}
      >
        <Header
          onToggleMobileSidebar={() => setMobileOpenOn(mobileOpen ? null : pathname)}
          breadcrumbs={breadcrumbs}
        />
        <main className="page-container">
          <PlanNotice />
          {blocked ? null : missing ? <NotInPlan module={t(...MODULE_LABELS[missing])} /> : children}
        </main>
      </div>
    </div>
  );
}
