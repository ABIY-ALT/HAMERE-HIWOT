
'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { LanguageSwitcher } from '../language-switcher';
import { Bell, FileText, UserCheck, ArrowRightLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/use-translation';
import Link from 'next/link';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
    const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <SidebarTrigger />
      <h1 className="font-headline text-xl font-semibold md:text-2xl">{title}</h1>
      <div className="ml-auto flex items-center gap-4">
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 justify-center p-0">3</Badge>
                    <span className="sr-only">{t('notifications')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>{t('notifications')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <FileText className="mr-2 h-4 w-4" />
                    <div>
                        <p className="font-semibold">{t('newReport')}</p>
                        <p className="text-xs text-muted-foreground">{t('newReportDescription')}</p>
                    </div>
                </DropdownMenuItem>
                 <DropdownMenuItem>
                    <UserCheck className="mr-2 h-4 w-4" />
                    <div>
                        <p className="font-semibold">{t('attendanceDue')}</p>
                        <p className="text-xs text-muted-foreground">{t('attendanceDueDescription')}</p>
                    </div>
                </DropdownMenuItem>
                 <DropdownMenuItem>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                     <div>
                        <p className="font-semibold">{t('studentTransferred')}</p>
                        <p className="text-xs text-muted-foreground">{t('studentTransferredDescription')}</p>
                    </div>
                </DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem asChild>
                    <Link href="#" className="flex items-center justify-center text-sm text-primary">
                        {t('viewAllNotifications')}
                    </Link>
                 </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
       
        <LanguageSwitcher />
      </div>
    </header>
  );
}
