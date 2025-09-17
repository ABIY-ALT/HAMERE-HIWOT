
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '../ui/button';
import { User } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import type { TranslationKey } from '@/lib/i18n';
import { rolesData } from '@/lib/mock-data';
import React from 'react';

export function UserMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };
  
  const roleTranslationKey = (user?.role.toLowerCase().replace(' ', '') || 'user') as TranslationKey;
  const translatedRole = t(roleTranslationKey);

  const userRole = React.useMemo(() => rolesData.find(role => role.name === user?.role), [user]);
  const hasSettingsPermission = userRole?.permissions.includes('Settings');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground group-data-[collapsible=icon]:size-6">
             {user?.name ? <span>{user.name.charAt(0).toUpperCase()}</span> : <User className="size-4" />}
          </div>
          <div className="flex flex-col items-start truncate group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium text-sidebar-foreground">
              {user?.name || t('adminAccount')}
            </span>
            <span className="text-xs text-sidebar-foreground/70">
              {translatedRole}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="mb-2">
        <DropdownMenuLabel>{user?.name || t('adminAccount')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasSettingsPermission && (
          <DropdownMenuItem onClick={() => router.push('/settings')}>{t('settings')}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>{t('logout')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
