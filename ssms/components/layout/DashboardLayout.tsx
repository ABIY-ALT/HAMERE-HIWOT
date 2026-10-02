'use client';

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export default function DashboardLayout({ children, breadcrumbs }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--surface-2)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
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
          onToggleMobileSidebar={() => setMobileOpen((o) => !o)}
          breadcrumbs={breadcrumbs}
        />
        <main className="page-container">
          {children}
        </main>
      </div>
    </div>
  );
}
