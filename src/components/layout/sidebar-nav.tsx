
"use client";

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { useTranslation } from "@/hooks/use-translation";
import {
  LayoutDashboard,
  Users,
  BookCopy,
  Banknote,
  Building2,
  Settings,
  Info,
  UserPlus,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { rolesData } from "@/lib/mock-data";
import type { Permission } from "@/types";
import React from "react";

const navConfig: {
  permission: Permission;
  href: string;
  icon: React.ElementType;
  labelKey: any;
  subItems?: { href: string; labelKey: any }[];
}[] = [
  { permission: "Dashboard", href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { 
    permission: "Members", 
    href: "/members", 
    icon: UserPlus, 
    labelKey: "members",
    subItems: [
        { href: "/members", labelKey: "allStudents" },
        { href: "/members/register", labelKey: "registerStudent" },
        { href: "/members/transfers", labelKey: "studentTransfers" },
    ]
  },
  { permission: "Classes", href: "/classes", icon: BookCopy, labelKey: "classes" },
  { permission: "Finance", href: "/finance", icon: Banknote, labelKey: "finance" },
  { permission: "Departments", href: "/departments", icon: Building2, labelKey: "departments" },
  { permission: "About", href: "/about", icon: Info, labelKey: "aboutUs" },
  { permission: "Settings", href: "/settings", icon: Settings, labelKey: "settings" },
];

export function SidebarNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = React.useMemo(() => {
    if (!user) return null;
    return rolesData.find((role) => role.name === user.role);
  }, [user]);

  const userPermissions = userRole?.permissions || [];

  const navItems = React.useMemo(() => {
    return navConfig
      .filter((item) => userPermissions.includes(item.permission as Permission))
  }, [userPermissions]);

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const label = t(item.labelKey);
        const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
        return (
            <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={{ children: label, side: "right" }}
                >
                    <Link href={item.href}>
                    <item.icon />
                    <span>{label}</span>
                    </Link>
                </SidebarMenuButton>
                 {item.subItems && isActive && (
                    <SidebarMenuSub>
                        {item.subItems.map(subItem => {
                           const subLabel = t(subItem.labelKey);
                           const isSubActive = pathname === subItem.href;
                           return (
                             <SidebarMenuItem key={subItem.href}>
                               <SidebarMenuSubButton asChild isActive={isSubActive}>
                                 <Link href={subItem.href}>
                                   <span>{subLabel}</span>
                                 </Link>
                               </SidebarMenuSubButton>
                             </SidebarMenuItem>
                           )
                        })}
                    </SidebarMenuSub>
                 )}
            </SidebarMenuItem>
        )
    })}
    </SidebarMenu>
  );
}
