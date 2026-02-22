// apps/frontend/src/components/mobile/BottomNav.tsx

'use client';

import React from 'react';
import { Home, AlertTriangle, LayoutGrid, Search, Ellipsis, Box, Sparkles, TrendingUp, Shield, FileText, Globe } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { usePropertyContext } from '@/lib/property/PropertyContext';

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;

function getPropertyIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(PROPERTY_ID_IN_PATH);
  return match?.[1];
}

function buildPropertyAwareHref(
  propertyId: string | undefined,
  hrefSuffix: string,
  navTarget: string
): string {
  if (propertyId) {
    return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  }

  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

export function BottomNav() {
  const pathname = usePathname();
  const { selectedPropertyId } = usePropertyContext();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');
  const roomsHref = buildPropertyAwareHref(resolvedPropertyId, 'rooms', 'rooms');

  const navItems = [
    {
      href: '/dashboard',
      icon: Home,
      label: 'Home',
      match: (path: string) => path === '/dashboard',
    },
    {
      href: '/dashboard/actions',
      icon: AlertTriangle,
      label: 'Actions',
      match: (path: string) => path.startsWith('/dashboard/actions'),
    },
    {
      href: roomsHref,
      icon: LayoutGrid,
      label: 'Rooms',
      match: (path: string) => /^\/dashboard\/properties\/[^/]+\/rooms(\/|$)/.test(path),
    },
    {
      href: '/dashboard/providers',
      icon: Search,
      label: 'Services',
      match: (path: string) => path.startsWith('/dashboard/providers'),
    },
  ];

  const moreItems = [
    {
      group: 'Intelligence',
      items: [
        { href: '/dashboard/coverage-intelligence', label: 'AI Tools', icon: Sparkles },
        {
          href: buildPropertyAwareHref(resolvedPropertyId, 'status-board', 'status-board'),
          label: 'Home Tools',
          icon: TrendingUp,
        },
      ],
    },
    {
      group: 'Management',
      items: [
        { href: '/dashboard/inventory', label: 'Inventory', icon: Box },
        { href: '/dashboard/warranties', label: 'Home Admin', icon: FileText },
      ],
    },
    {
      group: 'Community',
      items: [
        {
          href: buildPropertyAwareHref(resolvedPropertyId, 'incidents', 'incidents'),
          label: 'Protection',
          icon: Shield,
        },
        { href: '/dashboard/community-events', label: 'Community Events', icon: Globe },
      ],
    },
  ] as const;

  const filteredMoreItems = moreItems.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.label.toLowerCase().includes(query.trim().toLowerCase())
    ),
  }));

  const moreActive =
    pathname.startsWith('/dashboard/inventory') ||
    pathname.startsWith('/dashboard/coverage-intelligence') ||
    pathname.startsWith('/dashboard/community-events') ||
    pathname.startsWith('/dashboard/warranties') ||
    /^\/dashboard\/properties\/[^/]+\/(status-board|incidents|claims|recalls)(\/|$)/.test(pathname || '');

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.match(pathname || '');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-0.5 border-t-2 pt-1 text-[10px] transition-colors duration-150',
                  isActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500'
                )}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-brand-600')} />
                <span className={cn('font-medium', isActive && 'font-semibold')}>{item.label}</span>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-0.5 border-t-2 pt-1 text-[10px] transition-colors duration-150',
                  moreActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500'
                )}
              >
                <Ellipsis className="h-6 w-6" />
                <span className={cn('font-medium', moreActive && 'font-semibold')}>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="mt-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tools and pages..."
                  className="h-10"
                />
              </div>
              <div className="mt-4 space-y-4 overflow-y-auto pb-4">
                {filteredMoreItems.map((section) => {
                  if (!section.items.length) return null;
                  return (
                    <div key={section.group}>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {section.group}
                      </p>
                      <div className="space-y-1.5">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.label}
                              href={item.href}
                              onClick={() => setMoreOpen(false)}
                              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-700"
                            >
                              <Icon className="h-4 w-4" />
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                  Tip: Press <span className="font-medium">⌘K</span> to jump anywhere
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
