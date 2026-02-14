// apps/frontend/src/app/(dashboard)/layout.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
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
  Home,
  Calendar,
  Building,
  Search,
  ListChecks,
  LogOut,
  PanelLeft,
  Settings,
  Shield,
  Wrench,
  DollarSign,
  FileText,
  Globe,
  AlertTriangle,
  Box,
  ClipboardCheck,
  LayoutGrid,
  ShieldAlert,
  TrendingUp,
  Info,
  Calculator,
  Scale,
  Activity,
  Target,
  ChevronDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { User } from '@/types';
import { PropertySetupBanner } from '@/components/PropertySetupBanner';
import { api } from '@/lib/api/client';
import { AIChat } from '@/components/AIChat';
import { PropertyProvider, usePropertyContext } from '@/lib/property/PropertyContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
// Mobile-first imports
import { BottomNav } from '@/components/mobile/BottomNav';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface PropertyToolLink {
  key: string;
  name: string;
  hrefSuffix: string;
  navTarget: string;
  icon: React.ElementType;
  isActive: (pathname: string) => boolean;
}

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;

const HOME_TOOL_LINKS: PropertyToolLink[] = [
  {
    key: 'property-tax',
    name: 'Property Tax',
    hrefSuffix: 'tools/property-tax',
    navTarget: 'tool:property-tax',
    icon: DollarSign,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/property-tax(\/|$)/.test(pathname),
  },
  {
    key: 'cost-growth',
    name: 'Cost Growth',
    hrefSuffix: 'tools/cost-growth',
    navTarget: 'tool:cost-growth',
    icon: TrendingUp,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-growth(\/|$)/.test(pathname),
  },
  {
    key: 'insurance-trend',
    name: 'Insurance Trend',
    hrefSuffix: 'tools/insurance-trend',
    navTarget: 'tool:insurance-trend',
    icon: Shield,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/insurance-trend(\/|$)/.test(pathname),
  },
  {
    key: 'cost-explainer',
    name: 'Cost Explainer',
    hrefSuffix: 'tools/cost-explainer',
    navTarget: 'tool:cost-explainer',
    icon: Info,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-explainer(\/|$)/.test(pathname),
  },
  {
    key: 'true-cost',
    name: 'True Cost',
    hrefSuffix: 'tools/true-cost',
    navTarget: 'tool:true-cost',
    icon: Calculator,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/true-cost(\/|$)/.test(pathname),
  },
  {
    key: 'sell-hold-rent',
    name: 'Sell / Hold / Rent',
    hrefSuffix: 'tools/sell-hold-rent',
    navTarget: 'tool:sell-hold-rent',
    icon: Scale,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/sell-hold-rent(\/|$)/.test(pathname),
  },
  {
    key: 'cost-volatility',
    name: 'Volatility',
    hrefSuffix: 'tools/cost-volatility',
    navTarget: 'tool:cost-volatility',
    icon: Activity,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-volatility(\/|$)/.test(pathname),
  },
  {
    key: 'break-even',
    name: 'Break-Even',
    hrefSuffix: 'tools/break-even',
    navTarget: 'tool:break-even',
    icon: Target,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/break-even(\/|$)/.test(pathname),
  },
];

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

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

function getUserTypeLabel(user: User | null): string {
  if (!user) return 'Guest';
  if (user.segment === 'HOME_BUYER') return 'Home Buyer';
  if (user.segment === 'EXISTING_OWNER') return 'Homeowner';
  return 'Homeowner';
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null, loading: boolean };
  const router = useRouter();
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const bannerFetchedRef = React.useRef(false);

  useEffect(() => {
    // Guard against duplicate fetches on re-renders
    if (bannerFetchedRef.current) return;

    const fetchPropertyCount = async () => {
      if (!user) {
        setShowBanner(false);
        return;
      }

      if (user.segment !== 'EXISTING_OWNER') {
        setShowBanner(false);
        return;
      }

      bannerFetchedRef.current = true;

      try {
        const response = await api.getProperties();

        if (response.success) {
          const count = response.data.properties.length;
          setPropertyCount(count);

          const hasSkipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY) === 'true';

          const shouldShowBanner = count === 0 && !hasSkipped;
          setShowBanner(shouldShowBanner);
        } else {
          setShowBanner(false);
        }
      } catch (error) {
        setShowBanner(false);
      }
    };

    if (!loading && user) {
      fetchPropertyCount();
    }
  }, [user, loading]);

  useEffect(() => {
    if (!loading && user?.role === 'PROVIDER') {
      router.replace('/providers/dashboard');
    }
  }, [loading, user, router]);

  const handleDismissBanner = () => {
    localStorage.setItem(PROPERTY_SETUP_SKIPPED_KEY, 'true');
    setShowBanner(false);
  };

  const handleRefresh = async () => {
    setRefreshKey(prev => prev + 1);
    // Optionally refetch property count or other data
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user && user.role === 'PROVIDER') {
    return null;
  }

  return (
    <NotificationProvider>
      <PropertyProvider>
        <div className="flex min-h-screen w-full flex-col">
          {/* Property Setup Banner - Shows at top */}
          {showBanner && (
            <PropertySetupBanner show={showBanner} onDismiss={handleDismissBanner} />
          )}

          {/* Desktop Header - Split into utility row + primary nav row */}
          <header className="sticky top-0 z-10 hidden lg:block border-b bg-white">
            <div className="px-6 lg:px-10">
              <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 font-semibold shrink-0"
                >
                  <Image
                    src="/favicon.svg"
                    alt="Cozy Logo"
                    width={24}
                    height={24}
                    className="h-6 w-6"
                  />
                  <span className="text-xl font-bold text-blue-600">Contract to Cozy</span>
                </Link>

                <div className="flex-1" />
                <DesktopUserNav user={user} />
              </div>
            </div>
            <div className="border-t border-gray-100 px-6 lg:px-10">
              <div className="mx-auto w-full max-w-[1440px]">
                <DesktopNav user={user} />
              </div>
            </div>
          </header>

          {/* Mobile Header - Shown only on mobile */}
          <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200">
            <div className="px-4 py-3 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Image
                  src="/favicon.svg"
                  alt="Cozy Logo"
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                <span className="font-bold text-blue-600 text-lg">C2C</span>
              </Link>
              
              <div className="flex items-center gap-3">
                <NotificationBell />
                
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                    >
                      <PanelLeft className="h-5 w-5" />
                      <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
                    <div className="flex h-16 items-center border-b px-6">
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2 font-semibold"
                      >
                        <Image
                          src="/favicon.svg"
                          alt="Cozy Logo"
                          width={24}
                          height={24}
                          className="h-6 w-6"
                        />
                        <span className="text-xl font-bold text-blue-600">Contract to Cozy</span>
                      </Link>
                    </div>
                    
                    <div className="py-2 flex-1 overflow-auto">
                      <SidebarNav user={user} />
                    </div>

                    <MobileUserNav user={user} />
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </header>

          {/* Main content with pull-to-refresh */}
          <main className="flex-1 bg-gray-50 pb-20 lg:pb-0">
            <PullToRefresh onRefresh={handleRefresh}>
              <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
                <div key={refreshKey}>
                  {children}
                </div>
              </div>
            </PullToRefresh>
          </main>

          {/* Mobile Bottom Navigation - Hidden on desktop */}
          <BottomNav />

          {/* AI Chat Widget - Available on all screen sizes */}
          <AIChat />
        </div>
      </PropertyProvider>
    </NotificationProvider>
  );
}

function DesktopNav({ user }: { user: User | null }) {
  const pathname = usePathname();
  const { selectedPropertyId } = usePropertyContext();
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');
  const isOwner = user?.segment === 'EXISTING_OWNER';
  const isBuyer = user?.segment === 'HOME_BUYER';
  const [homeToolsOpen, setHomeToolsOpen] = useState(false);
  const homeToolsCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const coreLinks: Array<NavLink & { isActive: (path: string) => boolean }> = [
    { name: 'Dashboard', href: '/dashboard', icon: Home, isActive: (path) => path === '/dashboard' },
    { name: 'Actions', href: '/dashboard/actions', icon: AlertTriangle, isActive: (path) => path.startsWith('/dashboard/actions') },
    { name: 'Properties', href: '/dashboard/properties', icon: Building, isActive: (path) => path.startsWith('/dashboard/properties') },
    { name: 'Inventory', href: '/dashboard/inventory', icon: Box, isActive: (path) => path.startsWith('/dashboard/inventory') },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar, isActive: (path) => path.startsWith('/dashboard/bookings') },
    { name: 'Find Services', href: '/dashboard/providers', icon: Search, isActive: (path) => path.startsWith('/dashboard/providers') },
  ];

  const ownerGlobalLinks: Array<NavLink & { isActive: (path: string) => boolean }> = [
    { name: 'Warranties', href: '/dashboard/warranties', icon: Wrench, isActive: (path) => path.startsWith('/dashboard/warranties') },
    { name: 'Insurance', href: '/dashboard/insurance', icon: Shield, isActive: (path) => path.startsWith('/dashboard/insurance') },
    { name: 'Expenses', href: '/dashboard/expenses', icon: DollarSign, isActive: (path) => path.startsWith('/dashboard/expenses') },
    { name: 'Documents', href: '/dashboard/documents', icon: FileText, isActive: (path) => path.startsWith('/dashboard/documents') },
  ];

  const propertyFeatureLinks: Array<NavLink & { isActive: (path: string) => boolean; navTarget: string }> = [
    {
      name: 'Rooms',
      href: buildPropertyAwareHref(resolvedPropertyId, 'rooms', 'rooms'),
      icon: LayoutGrid,
      navTarget: 'rooms',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/rooms(\/|$)/.test(path),
    },
    {
      name: 'Incidents',
      href: buildPropertyAwareHref(resolvedPropertyId, 'incidents', 'incidents'),
      icon: ShieldAlert,
      navTarget: 'incidents',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/incidents(\/|$)/.test(path),
    },
    {
      name: 'Claims',
      href: buildPropertyAwareHref(resolvedPropertyId, 'claims', 'claims'),
      icon: ClipboardCheck,
      navTarget: 'claims',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/claims(\/|$)/.test(path),
    },
  ];

  const sharedLinkClass = (isActive: boolean) =>
    cn(
      'font-body font-medium text-sm flex items-center gap-2 px-3 py-2 rounded-md transition-colors duration-200 whitespace-nowrap',
      isActive
        ? 'text-brand-primary bg-teal-50 font-semibold'
        : 'text-gray-700 hover:text-brand-primary hover:bg-teal-50'
    );

  const clearHomeToolsCloseTimer = () => {
    if (homeToolsCloseTimerRef.current) {
      clearTimeout(homeToolsCloseTimerRef.current);
      homeToolsCloseTimerRef.current = null;
    }
  };

  const openHomeToolsMenu = () => {
    clearHomeToolsCloseTimer();
    setHomeToolsOpen(true);
  };

  const scheduleCloseHomeToolsMenu = () => {
    clearHomeToolsCloseTimer();
    homeToolsCloseTimerRef.current = setTimeout(() => {
      setHomeToolsOpen(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      clearHomeToolsCloseTimer();
    };
  }, []);

  const homeToolsActive = HOME_TOOL_LINKS.some((tool) => tool.isActive(pathname || ''));
  const homeAdminActive = ownerGlobalLinks.some((link) => link.isActive(pathname || ''));

  return (
    <nav className="w-full overflow-x-auto">
      <div className="flex min-w-max items-center gap-1 py-2">
        {coreLinks.map((link) => {
          const Icon = link.icon;
          const isActive = link.isActive(pathname || '');
          return (
            <Link key={link.href} href={link.href} className={sharedLinkClass(isActive)}>
              <Icon className="h-4 w-4" />
              {link.name}
            </Link>
          );
        })}

        {isBuyer && (
          <Link
            href="/dashboard/checklist"
            className={sharedLinkClass((pathname || '').startsWith('/dashboard/checklist'))}
          >
            <ListChecks className="h-4 w-4" />
            Checklist
          </Link>
        )}

        {isOwner && (
          <>
            <div className="mx-2 h-5 w-px bg-gray-200" />

            <DropdownMenu open={homeToolsOpen} onOpenChange={setHomeToolsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={sharedLinkClass(homeToolsActive)}
                  onMouseEnter={openHomeToolsMenu}
                  onMouseLeave={scheduleCloseHomeToolsMenu}
                  onFocus={openHomeToolsMenu}
                  onBlur={scheduleCloseHomeToolsMenu}
                >
                  <TrendingUp className="h-4 w-4" />
                  Home Tools
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="w-64"
                onMouseEnter={openHomeToolsMenu}
                onMouseLeave={scheduleCloseHomeToolsMenu}
                onFocusCapture={openHomeToolsMenu}
                onBlurCapture={scheduleCloseHomeToolsMenu}
              >
                {HOME_TOOL_LINKS.map((tool) => {
                  const ToolIcon = tool.icon;
                  const href = buildPropertyAwareHref(resolvedPropertyId, tool.hrefSuffix, tool.navTarget);
                  return (
                    <DropdownMenuItem key={tool.key} asChild>
                      <Link href={href} className="flex items-center gap-2">
                        <ToolIcon className="h-4 w-4" />
                        {tool.name}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {propertyFeatureLinks.map((link) => {
              const Icon = link.icon;
              const isActive = link.isActive(pathname || '');
              return (
                <Link key={link.navTarget} href={link.href} className={sharedLinkClass(isActive)}>
                  <Icon className="h-4 w-4" />
                  {link.name}
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={sharedLinkClass(homeAdminActive)}>
                  <FileText className="h-4 w-4" />
                  Home Admin
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-56">
                {ownerGlobalLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link href={link.href} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {link.name}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <Link
          href="/dashboard/community-events"
          className={sharedLinkClass((pathname || '').startsWith('/dashboard/community-events'))}
        >
          <Globe className="h-4 w-4" />
          Community Events
        </Link>
      </div>
    </nav>
  );
}

function SidebarNav({ user }: { user: User | null }) {
  const pathname = usePathname();
  const { selectedPropertyId } = usePropertyContext();
  const resolvedPropertyId = selectedPropertyId || getPropertyIdFromPathname(pathname || '');
  const isOwner = user?.segment === 'EXISTING_OWNER';
  const isBuyer = user?.segment === 'HOME_BUYER';

  const navLinkClass = (isActive: boolean) =>
    cn(
      'font-body font-medium flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200',
      isActive
        ? 'bg-teal-50 text-brand-primary font-semibold'
        : 'text-gray-700 hover:text-brand-primary hover:bg-teal-50'
    );

  const mainLinks: Array<NavLink & { isActive: (path: string) => boolean }> = [
    { name: 'Dashboard', href: '/dashboard', icon: Home, isActive: (path) => path === '/dashboard' },
    { name: 'Actions', href: '/dashboard/actions', icon: AlertTriangle, isActive: (path) => path.startsWith('/dashboard/actions') },
    { name: 'Properties', href: '/dashboard/properties', icon: Building, isActive: (path) => path.startsWith('/dashboard/properties') },
    { name: 'Inventory', href: '/dashboard/inventory', icon: Box, isActive: (path) => path.startsWith('/dashboard/inventory') },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar, isActive: (path) => path.startsWith('/dashboard/bookings') },
    { name: 'Find Services', href: '/dashboard/providers', icon: Search, isActive: (path) => path.startsWith('/dashboard/providers') },
  ];

  const ownerGlobalLinks: Array<NavLink & { isActive: (path: string) => boolean }> = [
    { name: 'Warranties', href: '/dashboard/warranties', icon: Wrench, isActive: (path) => path.startsWith('/dashboard/warranties') },
    { name: 'Insurance', href: '/dashboard/insurance', icon: Shield, isActive: (path) => path.startsWith('/dashboard/insurance') },
    { name: 'Expenses', href: '/dashboard/expenses', icon: DollarSign, isActive: (path) => path.startsWith('/dashboard/expenses') },
    { name: 'Documents', href: '/dashboard/documents', icon: FileText, isActive: (path) => path.startsWith('/dashboard/documents') },
  ];

  const propertyFeatureLinks: Array<NavLink & { isActive: (path: string) => boolean; navTarget: string }> = [
    {
      name: 'Rooms',
      href: buildPropertyAwareHref(resolvedPropertyId, 'rooms', 'rooms'),
      icon: LayoutGrid,
      navTarget: 'rooms',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/rooms(\/|$)/.test(path),
    },
    {
      name: 'Incidents',
      href: buildPropertyAwareHref(resolvedPropertyId, 'incidents', 'incidents'),
      icon: ShieldAlert,
      navTarget: 'incidents',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/incidents(\/|$)/.test(path),
    },
    {
      name: 'Claims',
      href: buildPropertyAwareHref(resolvedPropertyId, 'claims', 'claims'),
      icon: ClipboardCheck,
      navTarget: 'claims',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/claims(\/|$)/.test(path),
    },
  ];

  return (
    <nav className="grid gap-1 px-4 text-sm font-medium">
      {mainLinks.map((link) => {
        const Icon = link.icon;
        const isActive = link.isActive(pathname || '');
        return (
          <SheetClose key={link.href} asChild>
            <Link href={link.href} className={navLinkClass(isActive)}>
              <Icon className="h-4 w-4" />
              {link.name}
            </Link>
          </SheetClose>
        );
      })}

      {isBuyer && (
        <SheetClose asChild>
          <Link
            href="/dashboard/checklist"
            className={navLinkClass((pathname || '').startsWith('/dashboard/checklist'))}
          >
            <ListChecks className="h-4 w-4" />
            Checklist
          </Link>
        </SheetClose>
      )}

      {isOwner && (
        <>
          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
            Property Features
          </div>
          {propertyFeatureLinks.map((link) => {
            const Icon = link.icon;
            const isActive = link.isActive(pathname || '');
            return (
              <SheetClose key={link.navTarget} asChild>
                <Link href={link.href} className={navLinkClass(isActive)}>
                  <Icon className="h-4 w-4" />
                  {link.name}
                </Link>
              </SheetClose>
            );
          })}

          <details className="group rounded-lg">
            <summary className={cn(navLinkClass(HOME_TOOL_LINKS.some((tool) => tool.isActive(pathname || ''))), 'list-none cursor-pointer justify-between')}>
              <div className="flex items-center gap-3">
                <TrendingUp className="h-4 w-4" />
                Home Tools
              </div>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1 ml-3 border-l border-gray-200 pl-2 space-y-1">
              {HOME_TOOL_LINKS.map((tool) => {
                const ToolIcon = tool.icon;
                const href = buildPropertyAwareHref(resolvedPropertyId, tool.hrefSuffix, tool.navTarget);
                const isActive = tool.isActive(pathname || '');
                return (
                  <SheetClose key={tool.key} asChild>
                    <Link href={href} className={navLinkClass(isActive)}>
                      <ToolIcon className="h-4 w-4" />
                      {tool.name}
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </details>

          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
            Homeowner
          </div>
          <details className="group rounded-lg">
            <summary
              className={cn(
                navLinkClass(ownerGlobalLinks.some((link) => link.isActive(pathname || ''))),
                'list-none cursor-pointer justify-between'
              )}
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4" />
                Home Admin
              </div>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1 ml-3 border-l border-gray-200 pl-2 space-y-1">
              {ownerGlobalLinks.map((link) => {
                const Icon = link.icon;
                const isActive = link.isActive(pathname || '');
                return (
                  <SheetClose key={link.href} asChild>
                    <Link href={link.href} className={navLinkClass(isActive)}>
                      <Icon className="h-4 w-4" />
                      {link.name}
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </details>
        </>
      )}

      <SheetClose asChild>
        <Link
          href="/dashboard/community-events"
          className={navLinkClass((pathname || '').startsWith('/dashboard/community-events'))}
        >
          <Globe className="h-4 w-4" />
          Community Events
        </Link>
      </SheetClose>
    </nav>
  );
}

function DesktopUserNav({ user }: { user: User | null }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div className="hidden lg:flex items-center gap-4">
      {/* 🔔 Notifications */}
      <NotificationBell />

      {/* 👤 Profile */}
      <Link 
        href="/dashboard/profile"
        className="font-body font-medium flex items-center gap-2 text-sm text-gray-700 hover:text-brand-primary transition-colors duration-200"
      >
        <Settings className="h-4 w-4" />
        <div>
          <div className="font-medium">{user?.firstName}</div>
          <Badge 
            variant="outline" 
            className="font-body text-xs border-brand-primary text-brand-primary"
          >
            {getUserTypeLabel(user)}
          </Badge>
        </div>
      </Link>
      
      {/* 🚪 Logout */}
      <Button 
        onClick={handleLogout} 
        variant="ghost" 
        size="sm"
        className="font-body font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive tracking-wide transition-colors duration-200"
      >
        Logout
      </Button>
    </div>
  );
}

function MobileUserNav({ user }: { user: User | null }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div className="border-t p-4">
      <div className="mb-2">
        <div className="font-body font-medium">{user?.firstName} {user?.lastName}</div>
        <div className="font-body text-xs text-gray-500">{user?.email}</div>
        <Badge 
          variant="outline" 
          className="w-fit mt-1 border-brand-primary text-brand-primary font-body"
        >
          {getUserTypeLabel(user)}
        </Badge>
      </div>
      <nav className="flex flex-col gap-1">
        <SheetClose asChild>
          <Link 
            href="/dashboard/profile"
            className="font-body font-medium flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-colors duration-200 hover:text-brand-primary hover:bg-teal-50 -mx-3"
          >
            <Settings className="h-4 w-4" />
            Profile
          </Link>
        </SheetClose>
        <Button 
          onClick={handleLogout} 
          variant="ghost" 
          className="font-body font-semibold text-destructive justify-start hover:bg-destructive/10 hover:text-destructive tracking-wide transition-colors duration-200 -mx-3"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </Button>
      </nav>
    </div>
  );
}

export default DashboardLayout;
