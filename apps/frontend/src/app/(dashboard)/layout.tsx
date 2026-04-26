'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { PRIMARY_JOBS } from '@/lib/navigation/jobsNavigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';
import PostLoginTransition from '@/components/system/PostLoginTransition';
import { APP_CONFIG } from '@/lib/config/appConfig';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { User } from '@/types';
import { PropertySetupBanner } from '@/components/PropertySetupBanner';
import { api } from '@/lib/api/client';
import { AIChat } from '@/components/AIChat';
import { PropertyProvider, usePropertyContext } from '@/lib/property/PropertyContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { BottomNav } from '@/components/mobile/BottomNav';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import DashboardCommandPalette from '@/components/navigation/DashboardCommandPalette';
import DashboardBreadcrumbs from '@/components/navigation/DashboardBreadcrumbs';
import { AppShell } from '@/components/layout/AppShell';
import { CtcTopCommandBar } from '@/components/layout/CtcTopCommandBar';
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
  if (navTarget === 'fix') {
    if (propertyId) {
      return `/dashboard/resolution-center?propertyId=${encodeURIComponent(propertyId)}`;
    }
    return '/dashboard/resolution-center';
  }

  if (propertyId) {
    return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  }
  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent sidebar nav (desktop)
// ─────────────────────────────────────────────────────────────────────────────

function PersistentSidebarNav({ user, isCollapsed, onToggleCollapse }: { 
  user: User | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
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
    <div className="flex flex-col h-full">
      {/* Collapse/Expand Button */}
      <div className="h-[72px] flex items-center px-3 border-b border-slate-200/70 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <>
              <ChevronRight className="h-4 w-4" />
              <span>Expand</span>
            </>
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
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
              title={isCollapsed ? job.name : undefined}
              className={cn(
                'group relative flex items-center rounded-[14px] text-sm font-semibold transition-all duration-[180ms] ease-out',
                isCollapsed ? 'justify-center px-3 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-teal-50/90 text-teal-800 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.22)]'
                  : 'text-slate-600 hover:-translate-y-px hover:bg-white/80 hover:text-slate-950 hover:shadow-sm'
              )}
            >
              <Icon
                className={cn(
                  'h-[18px] w-[18px] flex-shrink-0 transition-colors',
                  isActive ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'
                )}
              />
              {!isCollapsed && <span>{job.name}</span>}
            </Link>
          );
        })}

        {/* Home Lab Section */}
        {labJob && (
          <div className="pt-2">
            <Link
              href={buildPropertyAwareHref(resolvedPropertyId, 'home-lab', labJob.key)}
              title={isCollapsed ? labJob.name : undefined}
              className={cn(
                'group flex items-center rounded-[14px] text-sm font-semibold transition-all duration-[180ms]',
                isCollapsed ? 'justify-center px-3 py-2.5' : 'gap-3 px-3 py-2.5',
                pathname?.startsWith('/dashboard/home-lab')
                  ? 'bg-teal-50/90 text-teal-800 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.22)]'
                  : 'text-slate-600 hover:-translate-y-px hover:bg-white/80 hover:text-slate-950 hover:shadow-sm'
              )}
            >
              <labJob.icon
                className={cn(
                  'h-[18px] w-[18px] flex-shrink-0 transition-colors',
                  pathname?.startsWith('/dashboard/home-lab') ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'
                )}
              />
              {!isCollapsed && <span>{labJob.name}</span>}
            </Link>
          </div>
        )}

        {/* Divider + secondary links */}
        <div className="pt-4 mt-3 border-t border-slate-200/70">
          <Link
            href={resolvedPropertyId ? `/knowledge?propertyId=${encodeURIComponent(resolvedPropertyId)}` : '/knowledge'}
            title={isCollapsed ? 'Knowledge' : undefined}
            className={cn(
              'flex items-center rounded-[14px] text-sm font-semibold text-slate-500 transition-all hover:bg-white/80 hover:text-slate-800',
              isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 px-3 py-2'
            )}
          >
            <BookOpen className="h-4 w-4 text-slate-400 flex-shrink-0" />
            {!isCollapsed && 'Knowledge'}
          </Link>
          <Link
            href="/dashboard/community-events"
            title={isCollapsed ? 'Community' : undefined}
            className={cn(
              'flex items-center rounded-[14px] text-sm font-semibold text-slate-500 transition-all hover:bg-white/80 hover:text-slate-800',
              isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 px-3 py-2'
            )}
          >
            <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
            {!isCollapsed && 'Community'}
          </Link>
        </div>

        {/* Admin links (ADMIN role only) */}
        {user?.role === 'ADMIN' && (
          <div className="pt-2 border-t border-gray-100 space-y-0.5">
            {!isCollapsed && (
              <p className="px-3 pt-1 pb-0.5 text-[10px] tracking-normal text-gray-400 font-semibold">
                Admin
              </p>
            )}
            <Link
              href="/dashboard/analytics-admin"
              title={isCollapsed ? 'Analytics' : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 px-3 py-2'
              )}
            >
              <BarChart2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
              {!isCollapsed && 'Analytics'}
            </Link>
            <Link
              href="/dashboard/knowledge-admin"
              title={isCollapsed ? 'Knowledge Admin' : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 px-3 py-2'
              )}
            >
              <Settings className="h-4 w-4 text-gray-400 flex-shrink-0" />
              {!isCollapsed && 'Knowledge Admin'}
            </Link>
            <Link
              href="/dashboard/worker-jobs"
              title={isCollapsed ? 'Worker Jobs' : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 px-3 py-2'
              )}
            >
              <Cpu className="h-4 w-4 text-gray-400 flex-shrink-0" />
              {!isCollapsed && 'Worker Jobs'}
            </Link>
          </div>
        )}
      </nav>

      {/* User actions at bottom */}
      <div className="flex-shrink-0 border-t border-slate-200/70 p-3">
        {isCollapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={user?.firstName ?? 'Account'}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 ring-1 ring-teal-200 transition-all hover:bg-teal-100 mx-auto"
              >
                <span className="text-[11px] font-bold text-teal-800">
                  {user?.firstName?.[0] ?? 'U'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" sideOffset={6} className="w-44">
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
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[16px] border border-slate-200/80 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-white hover:text-slate-950"
              >
                <div className="h-8 w-8 rounded-full bg-teal-50 ring-1 ring-teal-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-teal-800 ">
                    {user?.firstName?.[0] ?? 'U'}
                  </span>
                </div>
                <span className="flex-1 text-left truncate">{user?.firstName ?? 'Account'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
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
        )}
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

const MIN_TRANSITION_MS = APP_CONFIG.postLoginTransitionMs;

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null; loading: boolean };
  const router = useRouter();
  const pathname = usePathname();
  const [showBanner, setShowBanner] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const bannerFetchedRef = React.useRef(false);
  
  // Collapsible sidebar state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved === 'true';
    }
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const newValue = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebarCollapsed', String(newValue));
      }
      return newValue;
    });
  };

  // Keep transition visible for a minimum duration regardless of how fast auth resolves.
  const mountTimeRef = React.useRef(Date.now());
  const [transitionVisible, setTransitionVisible] = useState(loading);

  useEffect(() => {
    if (!loading && transitionVisible) {
      const elapsed = Date.now() - mountTimeRef.current;
      const remaining = Math.max(0, MIN_TRANSITION_MS - elapsed);
      const t = setTimeout(() => setTransitionVisible(false), remaining);
      return () => clearTimeout(t);
    }
  }, [loading, transitionVisible]);

  useEffect(() => {
    if (bannerFetchedRef.current) return;
    if (pathname === '/dashboard') {
      setShowBanner(false);
      return;
    }

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
  }, [user, loading, pathname]);

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

  if (user?.role === 'PROVIDER') return null;

  return (
    <>
      {/* Post-login transition overlay — shown for at least MIN_TRANSITION_MS */}
      <AnimatePresence>
        {transitionVisible && <PostLoginTransition key="dashboard-init" />}
      </AnimatePresence>

      {/* Dashboard shell — only rendered once the transition has finished */}
      {!transitionVisible && (
      <NotificationProvider>
      <PropertyProvider>
        <AppShell
          leftNav={
            <aside className={cn(
              "hidden border-r border-slate-200/70 bg-white/82 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl md:fixed md:top-[72px] md:bottom-0 md:z-40 md:flex md:flex-col transition-all duration-300",
              isCollapsed ? "md:w-[64px]" : "md:w-[246px]"
            )}>
              <PersistentSidebarNav user={user} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} />
            </aside>
          }
          sidebarCollapsed={isCollapsed}
          topBar={<CtcTopCommandBar />}
          mobileHeader={
            <header className="md:hidden sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl safe-area-inset-top">
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
          }
          banner={
            showBanner ? (
              <PropertySetupBanner show={showBanner} onDismiss={handleDismissBanner} />
            ) : null
          }
        >
          <main className="min-w-0 flex-1 pb-20 md:pb-8">
            <PullToRefresh onRefresh={handleRefresh}>
              <div
                className="mx-auto w-full max-w-[1180px] px-4 py-5 md:px-8 md:py-8"
                key={refreshKey}
              >
                <DashboardBreadcrumbs />
                {children}
              </div>
            </PullToRefresh>
          </main>
        </AppShell>

        {/* Mobile bottom nav (fixed, above all content) */}
        <BottomNav />

        {/* Global overlays */}
        <DashboardCommandPalette />
        <AIChat />
      </PropertyProvider>
      </NotificationProvider>
      )}
    </>
  );
}

export default DashboardLayout;
