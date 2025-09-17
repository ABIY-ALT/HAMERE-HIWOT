
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { ForcePasswordChangeDialog } from '@/components/layout/force-password-change-dialog';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-2">
               <div className="p-1 rounded-lg bg-white flex items-center justify-center w-8 h-8">
                 <Logo className="w-8 h-8" />
               </div>
              <span className="font-headline text-lg font-bold text-primary group-data-[collapsible=icon]:hidden">
                Hamere Hiwot
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarNav />
          </SidebarContent>
          <SidebarFooter>
            <UserMenu />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <div className="flex-1 transition-all duration-300">{children}</div>
        </SidebarInset>
        <ForcePasswordChangeDialog />
      </SidebarProvider>
  );
}
