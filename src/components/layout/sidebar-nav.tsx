
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
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { rolesData } from '@/lib/mock-data';
import type { Permission } from '@/types';
import React from 'react';

const navConfig: { permission: Permission, href: string, icon: React.ElementType, labelKey: any }[] = [
    { permission: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
    { permission: 'Students', href: '/students', icon: Users, labelKey: 'students' },
    { permission: 'Members', href: '/members', icon: UserPlus, labelKey: 'members' },
    { permission: 'Classes', href: '/classes', icon: BookCopy, labelKey: 'classes' },
    { permission: 'Finance', href: '/finance', icon: Banknote, labelKey: 'finance' },
    { permission: 'Departments', href: '/departments', icon: Building2, labelKey: 'departments' },
    { permission: 'About', href: '/about', icon: Info, labelKey: 'aboutUs' },
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
    // Add 'Members' permission for Admin and Chief Officer for display
    let permissions = [...userPermissions];
    if (user?.role === 'Admin' || user?.role === 'Chief Officer') {
      if (!permissions.includes('Members')) {
        permissions.push('Members');
      }
    }


    return navConfig
      .filter(item => permissions.includes(item.permission as Permission))
      .map(item => ({
        ...item,
        label: t(item.labelKey),
      }));
  }, [userPermissions, user?.role, t]);


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
