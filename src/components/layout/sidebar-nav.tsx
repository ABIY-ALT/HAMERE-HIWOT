
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

const navConfig: { permission: Permission, href: string, icon: React.ElementType }[] = [
    { permission: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { permission: 'Students', href: '/students', icon: Users },
    { permission: 'Classes', href: '/classes', icon: BookCopy },
    { permission: 'Finance', href: '/finance', icon: Banknote },
    { permission: 'Departments', href: '/departments', icon: Building2 },
    { permission: 'About', href: '/about', icon: Info },
    { permission: 'Settings', href: '/settings', icon: Settings },
];

export function SidebarNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = rolesData.find(role => role.name === user?.role);
  const userPermissions = userRole?.permissions || [];

  const navItems = React.useMemo(() => {
    return navConfig
      .filter(item => userPermissions.includes(item.permission))
      .map(item => ({
        ...item,
        label: t(item.permission === 'About' ? 'aboutUs' : (item.permission.toLowerCase() as any)),
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
