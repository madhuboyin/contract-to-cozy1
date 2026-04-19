'use client';

import React from 'react';
import { PRIMARY_JOBS } from '@/lib/navigation/jobsNavigation';
import {
  Camera,
  Ellipsis,
  BookOpen,
  Globe,
  Settings,
  LogOut,
  BarChart2,
  Cpu,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';

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
  if (propertyId) return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

// Primary bar: Today | Vault | [Camera FAB] | Fix | More
const PRIMARY_BAR_KEYS = ['today', 'vault'] as const;
const SECONDARY_BAR_KEYS = ['fix'] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { selectedPropertyId } = usePropertyContext();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');

  const handleLogout = React.useCallback(() => {
    setMoreOpen(false);
    logout();
    if (typeof window !== 'undefined') window.location.href = '/login';
  }, [logout]);

  const handleCameraCapture = React.useCallback(() => {
    const href = buildPropertyAwareDashboardHref(resolvedPropertyId, '/dashboard/visual-inspector');
    router.push(href);
  }, [resolvedPropertyId, router]);

  // Left two items (Today, Vault)
  const leftItems = PRIMARY_JOBS.filter((j) => (PRIMARY_BAR_KEYS as readonly string[]).includes(j.key)).map((job) => ({
    href:
      job.href === '/dashboard' || job.href === '/dashboard/properties'
        ? job.href
        : buildPropertyAwareHref(resolvedPropertyId, job.href.replace('/dashboard/', ''), job.key),
    icon: job.icon,
    label: job.name,
    match: (path: string) => {
      if (job.href === '/dashboard') return path === '/dashboard';
      return path.startsWith(job.href) || job.engines.some((e) => path.includes(e));
    },
  }));

  // Right item before More (Fix)
  const rightItems = PRIMARY_JOBS.filter((j) => (SECONDARY_BAR_KEYS as readonly string[]).includes(j.key)).map((job) => ({
    href: buildPropertyAwareHref(resolvedPropertyId, job.href.replace('/dashboard/', ''), job.key),
    icon: job.icon,
    label: job.name,
    match: (path: string) => path.startsWith(job.href) || job.engines.some((e) => path.includes(e)),
  }));

  // More drawer: remaining jobs + secondary links
  const moreJobKeys = ['my-home', 'protect', 'save'];
  const moreJobs = PRIMARY_JOBS.filter((j) => moreJobKeys.includes(j.key)).map((job) => ({
    label: job.name,
    href:
      job.href === '/dashboard/properties'
        ? job.href
        : buildPropertyAwareHref(resolvedPropertyId, job.href.replace('/dashboard/', ''), job.key),
    icon: job.icon,
    isActive: (path: string) => path.startsWith(job.href) || job.engines.some((e) => path.includes(e)),
  }));

  const moreStaticLinks = [
    {
      label: 'Knowledge',
      href: resolvedPropertyId ? `/knowledge?propertyId=${encodeURIComponent(resolvedPropertyId)}` : '/knowledge',
      icon: BookOpen,
      isActive: (path: string) => path.startsWith('/knowledge'),
    },
    {
      label: 'Community',
      href: '/dashboard/community-events',
      icon: Globe,
      isActive: (path: string) => path.startsWith('/dashboard/community-events'),
    },
  ];

  type MoreItem = {
    label: string;
    href: string;
    icon: React.ElementType;
    isActive: (path: string) => boolean;
  };

  const moreSections: { group: string; items: MoreItem[] }[] = [
    { group: 'More sections', items: moreJobs },
    { group: 'Resources', items: moreStaticLinks },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = moreSections
    .map((s) => ({
      ...s,
      items: normalizedQuery
        ? s.items.filter((i) => i.label.toLowerCase().includes(normalizedQuery))
        : s.items,
    }))
    .filter((s) => s.items.length > 0);

  const moreActive = moreSections.some((s) => s.items.some((i) => i.isActive(pathname || '')));

  React.useEffect(() => { setMoreOpen(false); setQuery(''); }, [pathname]);
  React.useEffect(() => { if (!moreOpen) setQuery(''); }, [moreOpen]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="relative flex h-16 items-end">
        {/* Left two items */}
        <div className="flex flex-1">
          {leftItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.match(pathname || '');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 min-h-[44px] flex-col items-center justify-center gap-0.5 border-t-2 pb-1 text-[10px] transition-colors',
                  isActive ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'
                )}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-brand-600')} />
                <span className={cn('font-medium', isActive && 'font-semibold')}>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Center camera FAB — raised above nav bar */}
        <div className="flex w-16 items-end justify-center pb-1">
          <button
            type="button"
            onClick={handleCameraCapture}
            className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-brand-600 shadow-lg shadow-brand-200/60 active:scale-95 transition-transform"
            aria-label="Capture photo"
          >
            <Camera className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Right item + More */}
        <div className="flex flex-1">
          {rightItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.match(pathname || '');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 min-h-[44px] flex-col items-center justify-center gap-0.5 border-t-2 pb-1 text-[10px] transition-colors',
                  isActive ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'
                )}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-brand-600')} />
                <span className={cn('font-medium', isActive && 'font-semibold')}>{item.label}</span>
              </Link>
            );
          })}

          {/* More drawer */}
          <Sheet
            open={moreOpen}
            onOpenChange={(open) => { setMoreOpen(open); if (!open) setQuery(''); }}
          >
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex flex-1 min-h-[44px] flex-col items-center justify-center gap-0.5 border-t-2 pb-1 text-[10px] transition-colors',
                  moreActive ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'
                )}
              >
                <Ellipsis className="h-6 w-6" />
                <span className={cn('font-medium', moreActive && 'font-semibold')}>More</span>
              </button>
            </SheetTrigger>

            <SheetContent side="bottom" className="flex h-[80vh] max-h-[80vh] flex-col rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="mt-3">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sections..."
                  className="h-10"
                />
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
                {filteredSections.map((section) => (
                  <div key={section.group}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {section.group}
                    </p>
                    <div className="space-y-1.5">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const active = item.isActive(pathname || '');
                        return (
                          <Link
                            key={item.label}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={cn(
                              'flex min-h-[48px] items-center gap-3 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-teal-50 hover:text-brand-700 transition-colors',
                              active && 'border-brand-200 bg-teal-50 text-brand-700'
                            )}
                          >
                            <Icon className="h-5 w-5 flex-shrink-0" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!filteredSections.length && (
                  <p className="text-sm text-gray-400">No results.</p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-1">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Settings className="h-4 w-4" />
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
