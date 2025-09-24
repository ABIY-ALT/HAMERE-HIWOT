
'use client';

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useTranslation } from '@/hooks/use-translation';
import {
  LayoutDashboard,
  Users,
  BookCopy,
  Banknote,
  Building2,
  Settings,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { rolesData } from '@/lib/mock-data';
import type { Permission } from '@/types';
import React from 'react';

const navConfig: { permission: Permission, href: string, icon: React.ElementType, labelKey: any }[] = [
    { permission: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
    { permission: 'Members', href: '/members', icon: Users, labelKey: 'members' },
    { permission: 'Classes', href: '/classes', icon: BookCopy, labelKey: 'classes' },
    { permission: 'Finance', href: '/finance', icon: Banknote, labelKey: 'finance' },
    { permission: 'Departments', href: '/departments', icon: Building2, labelKey: 'departments' },
    { permission: 'About', href: '/about', icon: Info, labelKey: 'about' },
    { permission: 'Settings', href: '/settings', icon: Settings, labelKey: 'settings' },
];

export function SidebarNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = React.useMemo(() => {
    if (!user) return null;
    return rolesData.find(role => role.name === user.role);
  }, [user]);

  const userPermissions = userRole?.permissions || [];

  const navItems = React.useMemo(() => {
    return navConfig
      .filter(item => userPermissions.includes(item.permission as Permission))
      .map(item => ({
        ...item,
        label: t(item.labelKey),
      }));
  }, [userPermissions, t]);


  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={pathname.startsWith(item.href)}
            tooltip={{ children: item.label, side: 'right' }}
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
