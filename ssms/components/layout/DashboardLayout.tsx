'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '@/lib/utils';

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

  return (
    <div className="min-h-screen bg-[var(--surface-2)]">
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
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          onToggleMobileSidebar={() => setMobileOpenOn(mobileOpen ? null : pathname)}
          breadcrumbs={breadcrumbs}
        />
        <main className="page-container">
          {children}
        </main>
      </div>
    </div>
  );
}
