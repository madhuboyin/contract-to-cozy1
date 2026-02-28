'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import type { User } from '@/types';
import AppSidebar from '@/components/navigation/AppSidebar';
import AppTopBar from '@/components/navigation/AppTopBar';
import { getPropertyIdFromPathname } from '@/components/navigation/appNavConfig';

type AppShellProps = {
  user: User | null;
  banner?: React.ReactNode;
  children: React.ReactNode;
};

export default function AppShell({ user, banner, children }: AppShellProps) {
  const pathname = usePathname() || '';
  const { selectedPropertyId } = usePropertyContext();
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen w-full bg-gray-50">
      <div className="hidden h-screen md:sticky md:top-0 md:block">
        <AppSidebar pathname={pathname} propertyId={resolvedPropertyId} />
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {banner}
        <AppTopBar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="dashboard-bg flex-1">{children}</main>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation menu</SheetTitle>
          </SheetHeader>
          <AppSidebar
            mobile
            pathname={pathname}
            propertyId={resolvedPropertyId}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
