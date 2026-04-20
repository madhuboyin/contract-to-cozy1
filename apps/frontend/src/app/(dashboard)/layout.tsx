'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { PRIMARY_JOBS } from '@/lib/navigation/jobsNavigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  LogOut,
  Menu,
  Settings,
  BarChart2,
  Cpu,
  BookOpen,
  Globe,
  ChevronDown,
} from 'lucide-react';
import { User } from '@/types';
import { PropertySetupBanner } from '@/components/PropertySetupBanner';
import { api } from '@/lib/api/client';
import { AIChat } from '@/components/AIChat';
import { PropertyProvider, usePropertyContext } from '@/lib/property/PropertyContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BottomNav } from '@/components/mobile/BottomNav';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import DashboardCommandPalette from '@/components/navigation/DashboardCommandPalette';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;
const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

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

// ─────────────────────────────────────────────────────────────────────────────
// Persistent sidebar nav (desktop)
// ─────────────────────────────────────────────────────────────────────────────

function PersistentSidebarNav({ user }: { user: User | null }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { selectedPropertyId } = usePropertyContext();
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  const coreJobs = PRIMARY_JOBS.filter(j => j.key !== 'home-lab');
  const labJob = PRIMARY_JOBS.find(j => j.key === 'home-lab');

  return (
    <div className="flex h-full flex-col bg-white/75 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-[74px] flex-shrink-0 items-center border-b border-slate-200/80 px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
          <Image
            src="/favicon.svg"
            alt="ContractToCozy"
            width={28}
            height={28}
            className="h-7 w-7 flex-shrink-0"
          />
          <span className="truncate text-[15px] font-semibold tracking-tight text-slate-900">ContractToCozy</span>
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3.5 py-4">
        {coreJobs.map((job) => {
          const Icon = job.icon;
          const href =
            job.href === '/dashboard' || job.href === '/dashboard/properties'
              ? job.href
              : buildPropertyAwareHref(
                  resolvedPropertyId,
                  job.href.replace('/dashboard/', ''),
                  job.key
                );

          const isActive =
            job.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname
                ? pathname.startsWith(job.href) ||
                  job.engines.some((e) => (pathname ?? '').includes(e))
                : false;

          return (
            <Link
              key={job.key}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-teal-50/90 font-semibold text-teal-800 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.18)]'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
                  isActive
                    ? 'border-teal-200/80 bg-white text-teal-700'
                    : 'border-slate-200 bg-white text-slate-400 group-hover:text-slate-600'
                )}
              >
                <Icon className="h-[16px] w-[16px]" />
              </span>
              <span>{job.name}</span>
            </Link>
          );
        })}

        {/* Home Lab Section */}
        {labJob && (
          <div className="pt-2">
            <Link
              href={buildPropertyAwareHref(resolvedPropertyId, 'home-lab', labJob.key)}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                pathname?.startsWith('/dashboard/home-lab')
                  ? 'bg-teal-50/90 font-semibold text-teal-800 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.18)]'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
                  pathname?.startsWith('/dashboard/home-lab')
                    ? 'border-teal-200/80 bg-white text-teal-700'
                    : 'border-slate-200 bg-white text-slate-400 group-hover:text-slate-600'
                )}
              >
                <labJob.icon className="h-[16px] w-[16px]" />
              </span>
              <span>{labJob.name}</span>
            </Link>
          </div>
        )}

        {/* Divider + secondary links */}
        <div className="mt-3 border-t border-slate-200/80 pt-3">
          <Link
            href={resolvedPropertyId ? `/knowledge?propertyId=${encodeURIComponent(resolvedPropertyId)}` : '/knowledge'}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-slate-100/80 hover:text-slate-800'
            )}
          >
            <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 group-hover:text-slate-600">
              <BookOpen className="h-4 w-4 flex-shrink-0" />
            </span>
            Knowledge
          </Link>
          <Link
            href="/dashboard/community-events"
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-slate-100/80 hover:text-slate-800'
            )}
          >
            <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 group-hover:text-slate-600">
              <Globe className="h-4 w-4 flex-shrink-0" />
            </span>
            Community
          </Link>
        </div>

        {/* Admin links (ADMIN role only) */}
        {user?.role === 'ADMIN' && (
          <div className="pt-2 border-t border-gray-100 space-y-0.5">
            <p className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Admin
            </p>
            <Link
              href="/dashboard/analytics-admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            >
              <BarChart2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
              Analytics
            </Link>
            <Link
              href="/dashboard/knowledge-admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4 text-gray-400 flex-shrink-0" />
              Knowledge Admin
            </Link>
            <Link
              href="/dashboard/worker-jobs"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            >
              <Cpu className="h-4 w-4 text-gray-400 flex-shrink-0" />
              Worker Jobs
            </Link>
          </div>
        )}
      </nav>

      {/* User actions at bottom */}
      <div className="flex-shrink-0 border-t border-slate-200/80 p-3.5">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mt-1.5 flex w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-white hover:text-slate-900"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-100">
                <span className="text-[11px] font-bold uppercase text-brand-700">
                  {user?.firstName?.[0] ?? 'U'}
                </span>
              </div>
              <span className="flex-1 text-left truncate">{user?.firstName ?? 'Account'}</span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={6} className="w-44">
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); handleLogout(); }}
              className="flex items-center gap-2 text-red-600 focus:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile drawer nav (full nav inside slide-in sheet)
// ─────────────────────────────────────────────────────────────────────────────

function MobileDrawerNav({ user }: { user: User | null }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { selectedPropertyId } = usePropertyContext();
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  const coreJobs = PRIMARY_JOBS.filter(j => j.key !== 'home-lab');
  const labJob = PRIMARY_JOBS.find(j => j.key === 'home-lab');

  return (
    <div className="flex flex-col h-full py-4 px-3">
      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {coreJobs.map((job) => {
          const Icon = job.icon;
          const href =
            job.href === '/dashboard' || job.href === '/dashboard/properties'
              ? job.href
              : buildPropertyAwareHref(
                  resolvedPropertyId,
                  job.href.replace('/dashboard/', ''),
                  job.key
                );

          const isActive =
            job.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname
                ? pathname.startsWith(job.href) ||
                  job.engines.some((e) => (pathname ?? '').includes(e))
                : false;

          return (
            <SheetClose key={job.key} asChild>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal-50 text-brand-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-brand-600' : 'text-gray-400')} />
                <div>
                  <div>{job.name}</div>
                  <div className="text-[11px] font-normal text-gray-400">{job.description}</div>
                </div>
              </Link>
            </SheetClose>
          );
        })}

        {labJob && (
          <div className="pt-2">
            <SheetClose asChild>
              <Link
                href={buildPropertyAwareHref(resolvedPropertyId, 'home-lab', labJob.key)}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                  pathname?.startsWith('/dashboard/home-lab')
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <labJob.icon className={cn('h-5 w-5 flex-shrink-0', pathname?.startsWith('/dashboard/home-lab') ? 'text-brand-600' : 'text-gray-400')} />
                <div>
                  <div>{labJob.name}</div>
                  <div className="text-[11px] font-normal text-gray-400">{labJob.description}</div>
                </div>
              </Link>
            </SheetClose>
          </div>
        )}

        <div className="pt-3 border-t border-gray-100 space-y-0.5">
          <SheetClose asChild>
            <Link
              href={resolvedPropertyId ? `/knowledge?propertyId=${encodeURIComponent(resolvedPropertyId)}` : '/knowledge'}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <BookOpen className="h-4 w-4 text-gray-400 flex-shrink-0" />
              Knowledge
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              href="/dashboard/community-events"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
              Community
            </Link>
          </SheetClose>
        </div>
      </nav>

      {/* User section at bottom of drawer */}
      <div className="border-t border-gray-100 pt-4 space-y-1">
        <div className="px-3 pb-2">
          <div className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</div>
          <div className="text-xs text-gray-400">{user?.email}</div>
        </div>
        <SheetClose asChild>
          <Link
            href="/dashboard/profile"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Profile
          </Link>
        </SheetClose>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root layout
// ─────────────────────────────────────────────────────────────────────────────

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null; loading: boolean };
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const bannerFetchedRef = React.useRef(false);

  useEffect(() => {
    if (bannerFetchedRef.current) return;

    const fetchPropertyCount = async () => {
      if (!user) { setShowBanner(false); return; }
      if (user.segment !== 'EXISTING_OWNER') { setShowBanner(false); return; }

      bannerFetchedRef.current = true;

      try {
        const response = await api.getProperties();
        if (response.success) {
          const count = response.data.properties.length;
          const hasSkipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY) === 'true';
          setShowBanner(count === 0 && !hasSkipped);
        } else {
          setShowBanner(false);
        }
      } catch {
        setShowBanner(false);
      }
    };

    if (!loading && user) fetchPropertyCount();
  }, [user, loading]);

  useEffect(() => {
    if (!loading && user?.role === 'PROVIDER') {
      router.replace('/providers/dashboard');
    }
  }, [loading, user, router]);

  // Mobile bottom padding for bottom nav
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const applyPadding = () => {
      document.body.style.paddingBottom = media.matches
        ? 'calc(4rem + env(safe-area-inset-bottom))'
        : '0px';
    };
    applyPadding();
    media.addEventListener('change', applyPadding);
    return () => {
      media.removeEventListener('change', applyPadding);
      document.body.style.paddingBottom = '';
    };
  }, []);

  const handleDismissBanner = () => {
    localStorage.setItem(PROPERTY_SETUP_SKIPPED_KEY, 'true');
    setShowBanner(false);
  };

  const handleRefresh = async () => {
    setRefreshKey((prev) => prev + 1);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading your home...</p>
        </div>
      </div>
    );
  }

  if (user?.role === 'PROVIDER') return null;

  return (
    <NotificationProvider>
      <PropertyProvider>
        {/* ── Outer shell ────────────────────────────────────────────────── */}
        <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-teal-50/35">

          {/* ── Desktop persistent left sidebar ──────────────────────────── */}
          <aside className="hidden md:fixed md:inset-y-0 md:z-50 md:flex md:w-64 md:flex-col border-r border-slate-200/80 bg-white/80 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.55)]">
            <PersistentSidebarNav user={user} />
          </aside>

          {/* ── Content area (offset by sidebar on desktop) ──────────────── */}
          <div className="flex min-w-0 flex-1 flex-col md:pl-64">

            {/* Mobile sticky header */}
            <header className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-100 safe-area-inset-top">
              <div
                className="flex h-14 items-center justify-between px-4"
                style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
              >
                <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
                  <Image
                    src="/favicon.svg"
                    alt="ContractToCozy"
                    width={24}
                    height={24}
                    className="h-6 w-6 flex-shrink-0"
                  />
                  <span className="text-[15px] font-bold text-gray-900 truncate">ContractToCozy</span>
                </Link>

                <div className="flex items-center gap-2">
                  <NotificationBell />

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-gray-600"
                        aria-label="Open menu"
                      >
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
                      <div className="h-14 flex items-center px-5 border-b border-gray-100">
                        <Link href="/dashboard" className="flex items-center gap-2.5">
                          <Image src="/favicon.svg" alt="CtC" width={24} height={24} className="h-6 w-6" />
                          <span className="font-bold text-gray-900">ContractToCozy</span>
                        </Link>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <MobileDrawerNav user={user} />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            </header>

            {/* Property setup banner */}
            {showBanner && (
              <PropertySetupBanner show={showBanner} onDismiss={handleDismissBanner} />
            )}

            {/* Main content */}
            <main className="flex-1 pb-20 md:pb-8">
              <PullToRefresh onRefresh={handleRefresh}>
                <div
                  className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-8 md:py-8 xl:px-10"
                  key={refreshKey}
                >
                  {children}
                </div>
              </PullToRefresh>
            </main>
          </div>
        </div>

        {/* Mobile bottom nav (fixed, above all content) */}
        <BottomNav />

        {/* Global overlays */}
        <DashboardCommandPalette />
        <AIChat />
      </PropertyProvider>
    </NotificationProvider>
  );
}

export default DashboardLayout;
