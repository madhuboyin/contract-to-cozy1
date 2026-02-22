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
  ShieldCheck,
  TrendingUp,
  Info,
  Calculator,
  Scale,
  Activity,
  Target,
  ChevronDown,
  Sparkles,
  Zap,
  Cloud,
  Camera,
  PauseCircle,
  PiggyBank,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import DashboardCommandPalette from '@/components/navigation/DashboardCommandPalette';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

interface AIToolLink {
  key: string;
  name: string;
  href: string;
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
  {
    key: 'capital-timeline',
    name: 'Home Capital Timeline',
    hrefSuffix: 'tools/capital-timeline',
    navTarget: 'tool:capital-timeline',
    icon: Calendar,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(\/|$)/.test(pathname),
  },
  {
    key: 'seller-prep',
    name: 'Seller Prep',
    hrefSuffix: 'seller-prep',
    navTarget: 'seller-prep',
    icon: TrendingUp,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/seller-prep(\/|$)/.test(pathname),
  },
  {
    key: 'home-timeline',
    name: 'Home Timeline',
    hrefSuffix: 'timeline',
    navTarget: 'home-timeline',
    icon: Calendar,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/timeline(\/|$)/.test(pathname),
  },
  {
    key: 'status-board',
    name: 'Status Board',
    hrefSuffix: 'status-board',
    navTarget: 'status-board',
    icon: LayoutGrid,
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/status-board(\/|$)/.test(pathname),
  },
];

const AI_TOOL_LINKS: AIToolLink[] = [
  {
    key: 'coverage-intelligence',
    name: 'Coverage Intelligence',
    href: '/dashboard/coverage-intelligence',
    icon: ShieldCheck,
    isActive: (pathname) =>
      /^\/dashboard\/coverage-intelligence(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/coverage-intelligence(\/|$)/.test(pathname),
  },
  {
    key: 'risk-premium-optimizer',
    name: 'Risk-to-Premium Optimizer',
    href: '/dashboard/risk-premium-optimizer',
    icon: ShieldAlert,
    isActive: (pathname) =>
      /^\/dashboard\/risk-premium-optimizer(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/risk-premium-optimizer(\/|$)/.test(pathname),
  },
  {
    key: 'replace-repair',
    name: 'Replace or Repair',
    href: '/dashboard/replace-repair',
    icon: Wrench,
    isActive: (pathname) =>
      /^\/dashboard\/replace-repair(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/inventory\/items\/[^/]+\/replace-repair(\/|$)/.test(pathname),
  },
  {
    key: 'do-nothing-simulator',
    name: 'Do-Nothing Simulator',
    href: '/dashboard/do-nothing-simulator',
    icon: PauseCircle,
    isActive: (pathname) =>
      /^\/dashboard\/do-nothing-simulator(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/do-nothing(\/|$)/.test(pathname),
  },
  {
    key: 'home-savings',
    name: 'Home Savings Check',
    href: '/dashboard/home-savings',
    icon: PiggyBank,
    isActive: (pathname) =>
      /^\/dashboard\/home-savings(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/home-savings(\/|$)/.test(pathname),
  },
  {
    key: 'emergency',
    name: 'Emergency Help',
    href: '/dashboard/emergency',
    icon: AlertTriangle,
    isActive: (pathname) => /^\/dashboard\/emergency(\/|$)/.test(pathname),
  },
  {
    key: 'documents',
    name: 'Document Vault',
    href: '/dashboard/documents',
    icon: FileText,
    isActive: (pathname) => /^\/dashboard\/documents(\/|$)/.test(pathname),
  },
  {
    key: 'oracle',
    name: 'Appliance Oracle',
    href: '/dashboard/oracle',
    icon: Zap,
    isActive: (pathname) => /^\/dashboard\/oracle(\/|$)/.test(pathname),
  },
  {
    key: 'budget',
    name: 'Budget Planner',
    href: '/dashboard/budget',
    icon: DollarSign,
    isActive: (pathname) => /^\/dashboard\/budget(\/|$)/.test(pathname),
  },
  {
    key: 'climate',
    name: 'Climate Risk',
    href: '/dashboard/climate',
    icon: Cloud,
    isActive: (pathname) => /^\/dashboard\/climate(\/|$)/.test(pathname),
  },
  {
    key: 'modifications',
    name: 'Home Upgrades',
    href: '/dashboard/modifications',
    icon: Home,
    isActive: (pathname) => /^\/dashboard\/modifications(\/|$)/.test(pathname),
  },
  {
    key: 'appreciation',
    name: 'Value Tracker',
    href: '/dashboard/appreciation',
    icon: TrendingUp,
    isActive: (pathname) => /^\/dashboard\/appreciation(\/|$)/.test(pathname),
  },
  {
    key: 'energy',
    name: 'Energy Audit',
    href: '/dashboard/energy',
    icon: Activity,
    isActive: (pathname) => /^\/dashboard\/energy(\/|$)/.test(pathname),
  },
  {
    key: 'visual-inspector',
    name: 'Visual Inspector',
    href: '/dashboard/visual-inspector',
    icon: Camera,
    isActive: (pathname) => /^\/dashboard\/visual-inspector(\/|$)/.test(pathname),
  },
  {
    key: 'tax-appeal',
    name: 'Tax Appeals',
    href: '/dashboard/tax-appeal',
    icon: Scale,
    isActive: (pathname) => /^\/dashboard\/tax-appeal(\/|$)/.test(pathname),
  },
];

function buildAIToolHref(propertyId: string | undefined, toolHref: string): string {
  if (!propertyId) return toolHref;
  const separator = toolHref.includes('?') ? '&' : '?';
  return `${toolHref}${separator}propertyId=${encodeURIComponent(propertyId)}`;
}

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

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null, loading: boolean };
  const router = useRouter();
  const pathname = usePathname();
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
          <header className="sticky top-0 z-10 hidden border-b bg-white md:block">
            <div className="border-b border-teal-700/50 bg-gradient-to-r from-brand-900 to-brand-700 px-8 text-white lg:px-14">
              <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center gap-4">
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
                  <span className="text-xl font-bold text-white">Contract to Cozy</span>
                </Link>

                <div className="flex-1 min-w-0" />
                <DesktopUserNav user={user} inverted />
              </div>
            </div>
            <div className="border-t border-gray-100 px-8 lg:px-14">
              <div className="mx-auto w-full max-w-[1360px]">
                <DesktopNav user={user} />
              </div>
            </div>
          </header>

          {/* Mobile Header - Shown only on mobile */}
          <header className="hidden">
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
          <main className="dashboard-bg flex-1 pb-16 md:pb-0">
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

          <DashboardCommandPalette />

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSearch, setMoreSearch] = useState('');
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBuyer = user?.segment === 'HOME_BUYER';

  const roomsHref = isBuyer
    ? '/dashboard/properties'
    : buildPropertyAwareHref(resolvedPropertyId, 'rooms', 'rooms');

  const primaryLinks: Array<NavLink & { isActive: (path: string) => boolean }> = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      isActive: (path) => path === '/dashboard',
    },
    {
      name: 'Actions',
      href: '/dashboard/actions',
      icon: AlertTriangle,
      isActive: (path) => path.startsWith('/dashboard/actions'),
    },
    {
      name: 'Rooms',
      href: roomsHref,
      icon: LayoutGrid,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/rooms(\/|$)/.test(path),
    },
    {
      name: 'Find Services',
      href: '/dashboard/providers',
      icon: Search,
      isActive: (path) => path.startsWith('/dashboard/providers'),
    },
  ];

  type MoreMenuItem = {
    key: string;
    name: string;
    href: string;
    icon: React.ElementType;
    isActive: (path: string) => boolean;
  };

  type MoreMenuBucket = {
    key: string;
    label: string;
    items: MoreMenuItem[];
  };

  const aiToolItems: MoreMenuItem[] = AI_TOOL_LINKS.map((tool) => ({
    key: `ai-${tool.key}`,
    name: tool.name,
    href: buildAIToolHref(resolvedPropertyId, tool.href),
    icon: tool.icon,
    isActive: tool.isActive,
  }));

  const homeToolItems: MoreMenuItem[] = HOME_TOOL_LINKS.map((tool) => ({
    key: `home-tool-${tool.key}`,
    name: tool.name,
    href: buildPropertyAwareHref(resolvedPropertyId, tool.hrefSuffix, tool.navTarget),
    icon: tool.icon,
    isActive: tool.isActive,
  }));

  const homeAdminItems: MoreMenuItem[] = [
    {
      key: 'home-admin-reports',
      name: 'Reports',
      href: buildPropertyAwareHref(resolvedPropertyId, 'reports', 'reports'),
      icon: FileText,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/reports(\/|$)/.test(path),
    },
    {
      key: 'home-admin-warranties',
      name: 'Warranties',
      href: '/dashboard/warranties',
      icon: Wrench,
      isActive: (path) => path.startsWith('/dashboard/warranties'),
    },
    {
      key: 'home-admin-insurance',
      name: 'Insurance',
      href: '/dashboard/insurance',
      icon: Shield,
      isActive: (path) => path.startsWith('/dashboard/insurance'),
    },
    {
      key: 'home-admin-expenses',
      name: 'Expenses',
      href: '/dashboard/expenses',
      icon: DollarSign,
      isActive: (path) => path.startsWith('/dashboard/expenses'),
    },
    {
      key: 'home-admin-documents',
      name: 'Documents',
      href: '/dashboard/documents',
      icon: FileText,
      isActive: (path) => path.startsWith('/dashboard/documents'),
    },
  ];

  const protectionItems: MoreMenuItem[] = [
    {
      key: 'protection-incidents',
      name: 'Incidents',
      href: buildPropertyAwareHref(resolvedPropertyId, 'incidents', 'incidents'),
      icon: ShieldAlert,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/incidents(\/|$)/.test(path),
    },
    {
      key: 'protection-claims',
      name: 'Claims',
      href: buildPropertyAwareHref(resolvedPropertyId, 'claims', 'claims'),
      icon: ClipboardCheck,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/claims(\/|$)/.test(path),
    },
    {
      key: 'protection-recalls',
      name: 'Recalls',
      href: buildPropertyAwareHref(resolvedPropertyId, 'recalls', 'recalls'),
      icon: ShieldCheck,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/recalls(\/|$)/.test(path),
    },
  ];

  const moreGroups = [
    {
      key: 'group-intelligence',
      label: 'Intelligence',
      buckets: [
        { key: 'bucket-ai-tools', label: 'AI Tools', items: aiToolItems },
        { key: 'bucket-home-tools', label: 'Home Tools', items: homeToolItems },
      ],
    },
    {
      key: 'group-management',
      label: 'Management',
      buckets: [
        {
          key: 'bucket-inventory',
          label: 'Inventory',
          items: [
            {
              key: 'inventory-main',
              name: 'Inventory',
              href: '/dashboard/inventory',
              icon: Box,
              isActive: (path: string) => path.startsWith('/dashboard/inventory'),
            },
          ],
        },
        { key: 'bucket-home-admin', label: 'Home Admin', items: homeAdminItems },
      ] satisfies MoreMenuBucket[],
    },
    {
      key: 'group-community',
      label: 'Community',
      buckets: [
        { key: 'bucket-protection', label: 'Protection', items: protectionItems },
        {
          key: 'bucket-community-events',
          label: 'Community Events',
          items: [
            {
              key: 'community-events-main',
              name: 'Community Events',
              href: '/dashboard/community-events',
              icon: Globe,
              isActive: (path: string) => path.startsWith('/dashboard/community-events'),
            },
          ],
        },
      ] satisfies MoreMenuBucket[],
    },
  ] as const;

  const normalizedQuery = moreSearch.trim().toLowerCase();
  const filteredMoreGroups = moreGroups
    .map((group) => ({
      ...group,
      buckets: group.buckets
        .map((bucket) => {
          if (!normalizedQuery) return bucket;

          const bucketMatched =
            bucket.label.toLowerCase().includes(normalizedQuery) ||
            group.label.toLowerCase().includes(normalizedQuery);

          return {
            ...bucket,
            items: bucketMatched
              ? bucket.items
              : bucket.items.filter((item) =>
                  item.name.toLowerCase().includes(normalizedQuery)
                ),
          };
        })
        .filter((bucket) => bucket.items.length > 0),
    }))
    .filter((group) => group.buckets.length > 0);

  const moreActive = moreGroups.some((group) =>
    group.buckets.some((bucket) =>
      bucket.items.some((item) => item.isActive(pathname || ''))
    )
  );

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openMenu = () => {
    clearCloseTimer();
    setMoreOpen(true);
  };

  const scheduleCloseMenu = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setMoreOpen(false), 120);
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  useEffect(() => {
    setMoreOpen(false);
    setMoreSearch('');
  }, [pathname]);

  const topNavClass = (isActive: boolean) =>
    cn(
      'inline-flex min-h-[44px] items-center gap-2 border-b-2 px-1 py-3 text-sm transition-colors duration-150',
      isActive
        ? 'border-brand-600 text-brand-600 font-semibold'
        : 'border-transparent text-gray-700 font-medium hover:text-brand-600'
    );

  return (
    <nav className="w-full">
      <div className="flex items-center gap-6">
        {primaryLinks.map((link) => {
          const Icon = link.icon;
          const isActive = link.isActive(pathname || '');
          return (
            <Link key={link.name} href={link.href} className={topNavClass(isActive)}>
              <Icon className="h-4 w-4" />
              {link.name}
            </Link>
          );
        })}

        <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(topNavClass(moreActive), 'h-auto rounded-none px-1')}
              onMouseEnter={openMenu}
              onMouseLeave={scheduleCloseMenu}
            >
              More
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-80 p-0"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleCloseMenu}
            onInteractOutside={() => setMoreOpen(false)}
            onPointerDownOutside={() => setMoreOpen(false)}
            onEscapeKeyDown={() => setMoreOpen(false)}
          >
            <div className="border-b border-gray-100 p-3">
              <Input
                value={moreSearch}
                onChange={(event) => setMoreSearch(event.target.value)}
                placeholder="Search tools and pages..."
                className="h-9"
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-1.5">
              {filteredMoreGroups.map((group) => (
                <div key={group.key} className="mb-2">
                  <DropdownMenuLabel className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-gray-400">
                    {group.label}
                  </DropdownMenuLabel>
                  <div className="space-y-1">
                    {group.buckets.map((bucket) => (
                      <div key={bucket.key}>
                        <div className="px-2 pt-1 text-[11px] font-medium text-gray-500">
                          {bucket.label}
                        </div>
                        {bucket.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <DropdownMenuItem
                              key={item.key}
                              asChild
                              className={cn(
                                'cursor-pointer',
                                item.isActive(pathname || '') && 'bg-brand-50 text-brand-700'
                              )}
                            >
                              <Link href={item.href} className="flex items-center gap-2 pl-5">
                                <Icon className="h-4 w-4" />
                                {item.name}
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!filteredMoreGroups.length && (
                <p className="px-2 py-4 text-sm text-gray-500">No results found.</p>
              )}
            </div>

            <DropdownMenuSeparator />
            <div className="px-3 py-2 text-xs text-gray-500">
              Tip: Press <span className="font-medium">⌘K</span> to jump anywhere
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
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
  const ownerPropertyAdminLinks: Array<NavLink & { isActive: (path: string) => boolean; navTarget: string }> = [
    {
      name: 'Reports',
      href: buildPropertyAwareHref(resolvedPropertyId, 'reports', 'reports'),
      icon: FileText,
      navTarget: 'reports',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/reports(\/|$)/.test(path),
    },
  ];

  const propertyFeatureLinks: Array<NavLink & { isActive: (path: string) => boolean; navTarget: string }> = [
    {
      name: 'Rooms',
      href: buildPropertyAwareHref(resolvedPropertyId, 'rooms', 'rooms'),
      icon: LayoutGrid,
      navTarget: 'rooms',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/rooms(\/|$)/.test(path),
    },
  ];

  const protectionLinks: Array<NavLink & { isActive: (path: string) => boolean; navTarget: string }> = [
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
    {
      name: 'Recalls',
      href: buildPropertyAwareHref(resolvedPropertyId, 'recalls', 'recalls'),
      icon: ShieldCheck,
      navTarget: 'recalls',
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/recalls(\/|$)/.test(path),
    },
  ];
  const protectionActive = protectionLinks.some((link) => link.isActive(pathname || ''));

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

      <details className="group rounded-lg">
        <summary
          className={cn(
            navLinkClass(AI_TOOL_LINKS.some((tool) => tool.isActive(pathname || ''))),
            'list-none cursor-pointer justify-between'
          )}
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4" />
            AI Tools
          </div>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1 ml-3 border-l border-gray-200 pl-2 space-y-1">
          {AI_TOOL_LINKS.map((tool) => {
            const ToolIcon = tool.icon;
            const isActive = tool.isActive(pathname || '');
            return (
              <SheetClose key={tool.key} asChild>
                <Link href={buildAIToolHref(resolvedPropertyId, tool.href)} className={navLinkClass(isActive)}>
                  <ToolIcon className="h-4 w-4" />
                  {tool.name}
                </Link>
              </SheetClose>
            );
          })}
        </div>
      </details>

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

          <details className="group rounded-lg" open={protectionActive}>
            <summary
              className={cn(
                navLinkClass(protectionActive),
                'list-none cursor-pointer justify-between'
              )}
            >
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4" />
                Protection
              </div>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1 ml-3 border-l border-gray-200 pl-2 space-y-1">
              {protectionLinks.map((link) => {
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
            </div>
          </details>

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
              {ownerPropertyAdminLinks.map((link) => {
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

function DesktopUserNav({ user, inverted = false }: { user: User | null; inverted?: boolean }) {
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'font-body flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200',
              inverted
                ? 'text-white/90 hover:bg-white/18 hover:text-white data-[state=open]:bg-white/22 data-[state=open]:text-white'
                : 'text-gray-700 hover:bg-teal-50 hover:text-brand-primary data-[state=open]:bg-teal-50 data-[state=open]:text-brand-primary'
            )}
          >
            <Settings className="h-4 w-4" />
            <span>{user?.firstName || 'Account'}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-44">
          <DropdownMenuItem asChild>
            <Link href="/dashboard/profile" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              handleLogout();
            }}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
