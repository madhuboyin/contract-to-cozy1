// apps/frontend/src/components/mobile/BottomNav.tsx

'use client';

import React from 'react';
import { PRIMARY_JOBS } from '@/lib/navigation/jobsNavigation';
import {
  Home,
  AlertTriangle,
  LayoutGrid,
  Search,
  Ellipsis,
  Box,
  Shield,
  FileText,
  Globe,
  Radar,
  CalendarClock,
  Building,
  Calendar,
  Wrench,
  Settings,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { resolveHomeownerNavigationIcon, resolveIcon, resolveIconByConcept, resolveToolIcon } from '@/lib/icons';
import { getHomeToolIcon } from '@/lib/config/iconMapping';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import {
  MOBILE_AI_TOOL_CATALOG,
  MOBILE_HOME_TOOL_LINKS,
} from '@/components/mobile/dashboard/mobileToolCatalog';

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

function buildAIToolHref(propertyId: string | undefined, toolHref: string): string {
  return buildPropertyAwareDashboardHref(propertyId, toolHref);
}

function buildInsightHref(propertyId: string | undefined, hrefBase: string): string {
  if (!propertyId) return hrefBase;
  const separator = hrefBase.includes('?') ? '&' : '?';
  return `${hrefBase}${separator}propertyId=${encodeURIComponent(propertyId)}`;
}

function buildRiskInsightHref(propertyId: string | undefined): string {
  return buildPropertyAwareDashboardHref(propertyId, '/dashboard/risk-radar');
}

export function BottomNav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { selectedPropertyId } = usePropertyContext();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');

  const handleLogout = React.useCallback(() => {
    setMoreOpen(false);
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, [logout]);

  // Select 4 primary jobs for the bottom bar
  const primaryJobKeys = ['today', 'protect', 'fix', 'vault'];
  const navItems = PRIMARY_JOBS
    .filter(job => primaryJobKeys.includes(job.key))
    .map(job => ({
      href: job.href === '/dashboard' || job.href === '/dashboard/properties' 
        ? job.href 
        : buildPropertyAwareHref(resolvedPropertyId, job.href.replace('/dashboard/', ''), job.key),
      icon: job.icon,
      label: job.name,
      match: (path: string) => {
        if (job.href === '/dashboard') return path === '/dashboard';
        return path.startsWith(job.href) || job.engines.some(e => path.includes(e));
      },
    }));

  type MoreItem = {
    label: string;
    href: string;
    icon: React.ElementType;
    isActive: (path: string) => boolean;
  };

  const secondaryJobKeys = ['my-home', 'save'];
  const jobItems: MoreItem[] = PRIMARY_JOBS
    .filter(job => secondaryJobKeys.includes(job.key))
    .map(job => ({
      label: job.name,
      href: job.href === '/dashboard' || job.href === '/dashboard/properties' 
        ? job.href 
        : buildPropertyAwareHref(resolvedPropertyId, job.href.replace('/dashboard/', ''), job.key),
      icon: job.icon,
      isActive: (path: string) => path.startsWith(job.href) || job.engines.some(e => path.includes(e)),
    }));

  const moreItems = [
    {
      group: 'Home Jobs',
      buckets: [
        { label: 'Secondary Jobs', items: jobItems },
      ],
    },
    {
      group: 'Discovery',
      buckets: [
        { 
          label: 'Engines', 
          items: [
            {
              label: 'Explore All Engines',
              href: buildAIToolHref(resolvedPropertyId, '/dashboard/ai-tools'),
              icon: LayoutGrid,
              isActive: (path: string) => path === '/dashboard/ai-tools',
            }
          ] 
        },
      ],
    },
    {
      group: 'Community & Knowledge',
      buckets: [
        {
          label: 'Resources',
          items: [
            {
              label: 'Community Events',
              href: '/dashboard/community-events',
              icon: resolveHomeownerNavigationIcon('community', 'events', Globe),
              isActive: (path: string) => path.startsWith('/dashboard/community-events'),
            },
            {
              label: 'Knowledge Hub',
              href: resolvedPropertyId ? `/knowledge?propertyId=${encodeURIComponent(resolvedPropertyId)}` : '/knowledge',
              icon: BookOpen,
              isActive: (path: string) => path.startsWith('/knowledge'),
            },
          ],
        },
      ],
    },
  ] as const;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMoreItems = moreItems
    .map((section) => ({
      ...section,
      buckets: section.buckets
        .map((bucket) => {
          if (!normalizedQuery) return bucket;

          const bucketMatch =
            bucket.label.toLowerCase().includes(normalizedQuery) ||
            section.group.toLowerCase().includes(normalizedQuery);

          return {
            ...bucket,
            items: bucketMatch
              ? bucket.items
              : bucket.items.filter((item) =>
                  item.label.toLowerCase().includes(normalizedQuery)
                ),
          };
        })
        .filter((bucket) => bucket.items.length > 0),
    }))
    .filter((section) => section.buckets.length > 0);

  const moreActive = moreItems.some((section) =>
    section.buckets.some((bucket) =>
      bucket.items.some((item) => item.isActive(pathname || ''))
    )
  );

  React.useEffect(() => {
    setMoreOpen(false);
    setQuery('');
  }, [pathname]);

  React.useEffect(() => {
    if (!moreOpen) {
      setQuery('');
    }
  }, [moreOpen]);

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

          <Sheet
            open={moreOpen}
            onOpenChange={(open) => {
              setMoreOpen(open);
              if (!open) setQuery('');
            }}
          >
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
            <SheetContent side="bottom" className="flex h-[82vh] max-h-[82vh] flex-col rounded-t-2xl">
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
              <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
                {filteredMoreItems.map((section) => {
                  if (!section.buckets.length) return null;
                  return (
                    <div key={section.group}>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {section.group}
                      </p>
                      <div className="space-y-2.5">
                        {section.buckets.map((bucket) => (
                          <div key={bucket.label}>
                            <p className="mb-1 text-[11px] font-medium text-gray-500">
                              {bucket.label}
                            </p>
                            <div className="space-y-1.5">
                              {bucket.items.map((item) => {
                                const Icon = item.icon;
                                const active = item.isActive(pathname || '');
                                return (
                                  <Link
                                    key={`${bucket.label}-${item.label}`}
                                    href={item.href}
                                    onClick={() => setMoreOpen(false)}
                                    className={cn(
                                      'flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-700',
                                      active && 'border-brand-200 bg-brand-50 text-brand-700'
                                    )}
                                  >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!filteredMoreItems.length && (
                  <p className="text-sm text-gray-500">No results found.</p>
                )}
                <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                  Tip: Press <span className="font-medium">⌘K</span> to jump anywhere
                </p>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMoreOpen(false)}
                  className="mb-2 flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Settings className="h-4 w-4" />
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
