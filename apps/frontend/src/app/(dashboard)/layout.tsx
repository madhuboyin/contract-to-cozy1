'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { getNavSectionsForRole } from '@/lib/navigation/jobsNavigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';
import PostLoginTransition from '@/components/system/PostLoginTransition';
import { PostLoginTransitionProvider } from '@/components/system/PostLoginTransitionContext';
import { IdleTimeoutWarningDialog } from '@/components/system/IdleTimeoutWarningDialog';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useCoordinatedPostLoginTransition } from '@/hooks/usePostLoginTransition';
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
  BookOpen,
  Globe,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Wrench,
} from 'lucide-react';
import { User } from '@/types';
import { PropertySetupBanner } from '@/components/PropertySetupBanner';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import { AIChat } from '@/components/AIChat';
import { PropertyProvider, usePropertyContext } from '@/lib/property/PropertyContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { BottomNav } from '@/components/mobile/BottomNav';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import DashboardCommandPalette from '@/components/navigation/DashboardCommandPalette';
import DashboardBreadcrumbs from '@/components/navigation/DashboardBreadcrumbs';
import { ActivationHandoffBanner } from '@/components/onboarding/ActivationHandoffBanner';
import { AppShell } from '@/components/layout/AppShell';
import { CtcTopCommandBar } from '@/components/layout/CtcTopCommandBar';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { ToolLaunchContextBoundary } from '@/features/tools/ToolLaunchContextBoundary';
import { isAskWorkspacePath } from '@/lib/routes/isAskWorkspacePath';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;
const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';
const POST_LOGIN_TRANSITION_KEY = 'ctc.postLoginTransition';

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
      return `/dashboard/properties/${encodeURIComponent(propertyId)}/fix`;
    }
    return '/dashboard/fix'; // Will redirect via JobHubRedirectPage to property-specific route
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

  const handleLogout = async () => {
    await logout();
  };

  const { coreJobs, labJob, isAdminNav } = getNavSectionsForRole(user?.role);

  return (
    <div className="relative flex flex-col h-full">
      {/* Floating Collapse/Expand Button - Centered on right edge */}
      <button
        onClick={onToggleCollapse}
        className="absolute top-1/2 -right-3 z-50 flex items-center justify-center h-6 w-6 bg-white border border-slate-200 rounded-full shadow-sm hover:shadow-md transition-all text-slate-600 hover:text-slate-900 -translate-y-1/2"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Primary nav */}
      <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
        {coreJobs.map((job) => {
          const Icon = job.icon;
          const href =
            job.globalHref || job.href === '/dashboard' || job.href === '/dashboard/properties'
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

          const seasonalHref = resolvedPropertyId
            ? `/dashboard/seasonal?propertyId=${resolvedPropertyId}`
            : '/dashboard/seasonal';
          const isSeasonalActive = pathname?.startsWith('/dashboard/seasonal') ?? false;
          const maintenanceHref = resolvedPropertyId
            ? `/dashboard/maintenance?propertyId=${resolvedPropertyId}`
            : '/dashboard/maintenance';
          const isMaintenanceActive =
            (pathname?.startsWith('/dashboard/maintenance') ?? false) &&
            !(pathname?.startsWith('/dashboard/maintenance-setup') ?? false);

          return (
            <React.Fragment key={job.key}>
              <Link
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
              {job.key === 'fix' && (
                <>
                  <Link
                    href={maintenanceHref}
                    title={isCollapsed ? 'Maintenance' : undefined}
                    className={cn(
                      'group flex items-center rounded-[14px] text-sm font-medium transition-all duration-[180ms] ease-out',
                      isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 py-2',
                      !isCollapsed && 'pl-9',
                      isMaintenanceActive
                        ? 'text-teal-700'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <Wrench
                      className={cn(
                        'h-4 w-4 flex-shrink-0 transition-colors',
                        isMaintenanceActive ? 'text-teal-600' : 'text-slate-400 group-hover:text-slate-500'
                      )}
                    />
                    {!isCollapsed && <span>Maintenance</span>}
                  </Link>
                  <Link
                    href={seasonalHref}
                    title={isCollapsed ? 'Seasonal' : undefined}
                    className={cn(
                      'group flex items-center rounded-[14px] text-sm font-medium transition-all duration-[180ms] ease-out',
                      isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 py-2',
                      !isCollapsed && 'pl-9',
                      isSeasonalActive
                        ? 'text-teal-700'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <CalendarRange
                      className={cn(
                        'h-4 w-4 flex-shrink-0 transition-colors',
                        isSeasonalActive ? 'text-teal-600' : 'text-slate-400 group-hover:text-slate-500'
                      )}
                    />
                    {!isCollapsed && <span>Seasonal</span>}
                  </Link>
                </>
              )}
            </React.Fragment>
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

        {/* Divider + secondary links (homeowner nav only — the admin nav is
            already dedicated, so it doesn't get these homeowner content links) */}
        {!isAdminNav && (
          <div className="pt-4 mt-3 border-t border-slate-200/70">
            <Link
              href={resolvedPropertyId ? `/knowledge?propertyId=${encodeURIComponent(resolvedPropertyId)}` : '/knowledge'}
              title={isCollapsed ? 'Knowledge' : undefined}
              className={cn(
                'flex items-center rounded-[14px] text-sm font-semibold text-slate-600 transition-all hover:bg-white/80 hover:text-slate-800',
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
                'flex items-center rounded-[14px] text-sm font-semibold text-slate-600 transition-all hover:bg-white/80 hover:text-slate-800',
                isCollapsed ? 'justify-center px-3 py-2' : 'gap-3 px-3 py-2'
              )}
            >
              <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
              {!isCollapsed && 'Community'}
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

  const handleLogout = async () => {
    await logout();
  };

  const { coreJobs, labJob, isAdminNav } = getNavSectionsForRole(user?.role);

  return (
    <div className="flex flex-col h-full py-4 px-3">
      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {coreJobs.map((job) => {
          const Icon = job.icon;
          const href =
            job.globalHref || job.href === '/dashboard' || job.href === '/dashboard/properties'
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

          const seasonalHref = resolvedPropertyId
            ? `/dashboard/seasonal?propertyId=${resolvedPropertyId}`
            : '/dashboard/seasonal';
          const isSeasonalActive = pathname?.startsWith('/dashboard/seasonal') ?? false;
          const maintenanceHref = resolvedPropertyId
            ? `/dashboard/maintenance?propertyId=${resolvedPropertyId}`
            : '/dashboard/maintenance';
          const isMaintenanceActive =
            (pathname?.startsWith('/dashboard/maintenance') ?? false) &&
            !(pathname?.startsWith('/dashboard/maintenance-setup') ?? false);

          return (
            <React.Fragment key={job.key}>
              <SheetClose asChild>
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
              {job.key === 'fix' && (
                <>
                  <SheetClose asChild>
                    <Link
                      href={maintenanceHref}
                      className={cn(
                        'flex items-center gap-3 pl-11 pr-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isMaintenanceActive
                          ? 'text-teal-700 bg-teal-50/60'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      )}
                    >
                      <Wrench className={cn('h-4 w-4 flex-shrink-0', isMaintenanceActive ? 'text-teal-600' : 'text-gray-400')} />
                      Maintenance
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href={seasonalHref}
                      className={cn(
                        'flex items-center gap-3 pl-11 pr-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isSeasonalActive
                          ? 'text-teal-700 bg-teal-50/60'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      )}
                    >
                      <CalendarRange className={cn('h-4 w-4 flex-shrink-0', isSeasonalActive ? 'text-teal-600' : 'text-gray-400')} />
                      Seasonal
                    </Link>
                  </SheetClose>
                </>
              )}
            </React.Fragment>
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

        {!isAdminNav && (
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
        )}
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
  const pathname = usePathname();
  const isPropertyRecordOverview = /^\/dashboard\/properties\/[0-9a-f-]{36}\/?$/i.test(pathname || '');
  const isAskWorkspace = isAskWorkspacePath(pathname);
  const [showBanner, setShowBanner] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { showWarning: showIdleWarning, secondsRemaining: idleSecondsRemaining, stayActive: stayIdleActive } = useIdleTimeout();
  
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

  // Read (but don't yet consume) the flag during the render phase via a lazy
  // initializer — this is a pure read, so it's safe to run twice under React
  // Strict Mode's dev-only double-invocation.
  const [transitionRequested] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(POST_LOGIN_TRANSITION_KEY) === '1';
  });
  const {
    transitionVisible,
    transitionTimedOut,
    markTransitionReady,
  } = useCoordinatedPostLoginTransition(
    transitionRequested,
    APP_CONFIG.postLoginTransitionMinMs,
    APP_CONFIG.postLoginTransitionMaxMs,
  );
  const [transitionBootstrapped, setTransitionBootstrapped] = useState(false);
  const enablePullToRefresh = pathname === '/dashboard' || Boolean(pathname?.match(/^\/dashboard\/properties\/[^/]+$/));

  // Consuming the one-time flag has no cleanup, so Strict Mode's dev-only
  // mount->cleanup->mount replay just calls removeItem twice harmlessly.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(POST_LOGIN_TRANSITION_KEY);
    setTransitionBootstrapped(true);
  }, []);

  useEffect(() => {
    if (
      pathname === '/dashboard' ||
      pathname === '/dashboard/properties/new'
    ) {
      setShowBanner(false);
      return;
    }

    const fetchPropertyCount = async () => {
      if (!user) { setShowBanner(false); return; }
      if (user.role === 'ADMIN') { setShowBanner(false); return; }
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

    if (!loading && user) {
      void fetchPropertyCount();
    }
  }, [user, loading, pathname]);

  useEffect(() => {
    if (!loading && user?.role === 'PROVIDER') {
      router.replace('/providers/dashboard');
    }
  }, [loading, user, router]);

  // Session/retention tracking — fires once per browser tab session, the
  // first time an authenticated user lands in the dashboard.
  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem('ctc_session_tracked')) return;
    window.sessionStorage.setItem('ctc_session_tracked', '1');

    const LAST_VISIT_KEY = 'ctc_last_visit_at';
    const SESSION_COUNT_KEY = 'ctc_session_count';

    const now = Date.now();
    const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
    const sessionCount = Number(localStorage.getItem(SESSION_COUNT_KEY) || '0') + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(sessionCount));
    localStorage.setItem(LAST_VISIT_KEY, String(now));

    if (lastVisit) {
      const daysSinceLastVisit = Math.max(0, Math.round((now - Number(lastVisit)) / (1000 * 60 * 60 * 24)));
      track('return_visit', { sessionCount, daysSinceLastVisit });
    }

    api
      .getProperties()
      .then((response) => {
        track('session_started', {
          propertyCount: response.success ? response.data.properties.length : 0,
        });
      })
      .catch(() => {
        track('session_started', { propertyCount: 0 });
      });
  }, [loading, user]);

  // Mobile bottom padding for bottom nav
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1023px)');
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

  if (!transitionBootstrapped || (loading && !user && !transitionVisible)) {
    return null;
  }

  if (user?.role === 'PROVIDER') return null;

  return (
    <PostLoginTransitionProvider
      active={transitionVisible}
      onReady={markTransitionReady}
    >
      {/* Home begins loading underneath this one stable post-login surface. */}
      <AnimatePresence>
        {transitionVisible && (
          <PostLoginTransition
            key="dashboard-init"
            timedOut={transitionTimedOut}
            onRetry={() => window.location.reload()}
          />
        )}
      </AnimatePresence>

      {/* Mount as soon as auth resolves so data hydration is not delayed by the transition. */}
      {!loading && user && (
      <NotificationProvider>
      <PropertyProvider>
        <AppShell
          leftNav={
            <aside className={cn(
              "hidden border-r border-slate-200/70 bg-white/82 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl lg:fixed lg:top-[72px] lg:bottom-0 lg:z-40 lg:flex lg:flex-col transition-all duration-300",
              isCollapsed ? "lg:w-[64px]" : "lg:w-[246px]"
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
                    sizes="24px"
                    className="h-6 w-6 flex-shrink-0"
                    priority
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
                    <SheetContent side="left" className="w-[min(300px,85vw)] p-0 flex flex-col">
                      <div className="h-14 flex items-center px-5 border-b border-gray-100">
                        <Link href="/dashboard" className="flex items-center gap-2.5">
                          <Image src="/favicon.svg" alt="CtC" width={24} height={24} className="h-6 w-6" priority />
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
          <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
            <PullToRefresh onRefresh={handleRefresh} disabled={!enablePullToRefresh}>
              <div
                className={cn(
                  'mx-auto w-full px-4 py-5 md:px-8 md:py-8',
                  isPropertyRecordOverview ? 'max-w-[1520px]' : 'max-w-[1180px]',
                )}
                key={refreshKey}
              >
                <DashboardBreadcrumbs />
                <ActivationHandoffBanner />
                <ToolLaunchContextBoundary>{children}</ToolLaunchContextBoundary>
              </div>
            </PullToRefresh>
          </main>
        </AppShell>

        {/* Mobile bottom nav (fixed, above all content) */}
        <BottomNav />

        {/* Global overlays */}
        <DashboardCommandPalette />
        {/* Cozy is a homeowner maintenance/expense concierge — not relevant to admin */}
        {user?.role !== 'ADMIN' && !isAskWorkspace && <AIChat />}
        <FeedbackWidget />
        <IdleTimeoutWarningDialog
          open={showIdleWarning}
          secondsRemaining={idleSecondsRemaining}
          onStayActive={stayIdleActive}
        />
      </PropertyProvider>
      </NotificationProvider>
      )}
    </PostLoginTransitionProvider>
  );
}

export default DashboardLayout;
