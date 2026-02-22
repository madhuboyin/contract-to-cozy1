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

function buildAIToolHref(propertyId: string | undefined, toolHref: string): string {
  if (!propertyId) return toolHref;
  const separator = toolHref.includes('?') ? '&' : '?';
  return `${toolHref}${separator}propertyId=${encodeURIComponent(propertyId)}`;
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

  type MoreItem = {
    label: string;
    href: string;
    icon: React.ElementType;
    isActive: (path: string) => boolean;
  };

  const aiToolItems: MoreItem[] = [
    {
      label: 'Coverage Intelligence',
      href: buildAIToolHref(resolvedPropertyId, '/dashboard/coverage-intelligence'),
      icon: Sparkles,
      isActive: (path) => path.startsWith('/dashboard/coverage-intelligence'),
    },
    {
      label: 'Risk-to-Premium Optimizer',
      href: buildAIToolHref(resolvedPropertyId, '/dashboard/risk-premium-optimizer'),
      icon: Sparkles,
      isActive: (path) => path.startsWith('/dashboard/risk-premium-optimizer'),
    },
    {
      label: 'Replace or Repair',
      href: buildAIToolHref(resolvedPropertyId, '/dashboard/replace-repair'),
      icon: Sparkles,
      isActive: (path) => path.startsWith('/dashboard/replace-repair'),
    },
    {
      label: 'Do-Nothing Simulator',
      href: buildAIToolHref(resolvedPropertyId, '/dashboard/do-nothing-simulator'),
      icon: Sparkles,
      isActive: (path) => path.startsWith('/dashboard/do-nothing-simulator'),
    },
    {
      label: 'Home Savings Check',
      href: buildAIToolHref(resolvedPropertyId, '/dashboard/home-savings'),
      icon: Sparkles,
      isActive: (path) => path.startsWith('/dashboard/home-savings'),
    },
  ];

  const homeToolItems: MoreItem[] = [
    { label: 'Property Tax', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/property-tax', 'tool:property-tax'), icon: TrendingUp, isActive: (path) => /\/tools\/property-tax(\/|$)/.test(path) },
    { label: 'Cost Growth', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/cost-growth', 'tool:cost-growth'), icon: TrendingUp, isActive: (path) => /\/tools\/cost-growth(\/|$)/.test(path) },
    { label: 'Insurance Trend', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/insurance-trend', 'tool:insurance-trend'), icon: TrendingUp, isActive: (path) => /\/tools\/insurance-trend(\/|$)/.test(path) },
    { label: 'Cost Explainer', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/cost-explainer', 'tool:cost-explainer'), icon: TrendingUp, isActive: (path) => /\/tools\/cost-explainer(\/|$)/.test(path) },
    { label: 'True Cost', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/true-cost', 'tool:true-cost'), icon: TrendingUp, isActive: (path) => /\/tools\/true-cost(\/|$)/.test(path) },
    { label: 'Sell / Hold / Rent', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/sell-hold-rent', 'tool:sell-hold-rent'), icon: TrendingUp, isActive: (path) => /\/tools\/sell-hold-rent(\/|$)/.test(path) },
    { label: 'Volatility', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/cost-volatility', 'tool:cost-volatility'), icon: TrendingUp, isActive: (path) => /\/tools\/cost-volatility(\/|$)/.test(path) },
    { label: 'Break-Even', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/break-even', 'tool:break-even'), icon: TrendingUp, isActive: (path) => /\/tools\/break-even(\/|$)/.test(path) },
    { label: 'Home Capital Timeline', href: buildPropertyAwareHref(resolvedPropertyId, 'tools/capital-timeline', 'tool:capital-timeline'), icon: TrendingUp, isActive: (path) => /\/tools\/capital-timeline(\/|$)/.test(path) },
    { label: 'Seller Prep', href: buildPropertyAwareHref(resolvedPropertyId, 'seller-prep', 'seller-prep'), icon: TrendingUp, isActive: (path) => /\/seller-prep(\/|$)/.test(path) },
    { label: 'Home Timeline', href: buildPropertyAwareHref(resolvedPropertyId, 'timeline', 'home-timeline'), icon: TrendingUp, isActive: (path) => /\/timeline(\/|$)/.test(path) },
    { label: 'Status Board', href: buildPropertyAwareHref(resolvedPropertyId, 'status-board', 'status-board'), icon: TrendingUp, isActive: (path) => /\/status-board(\/|$)/.test(path) },
  ];

  const protectionItems: MoreItem[] = [
    {
      label: 'Incidents',
      href: buildPropertyAwareHref(resolvedPropertyId, 'incidents', 'incidents'),
      icon: Shield,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/incidents(\/|$)/.test(path),
    },
    {
      label: 'Claims',
      href: buildPropertyAwareHref(resolvedPropertyId, 'claims', 'claims'),
      icon: Shield,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/claims(\/|$)/.test(path),
    },
    {
      label: 'Recalls',
      href: buildPropertyAwareHref(resolvedPropertyId, 'recalls', 'recalls'),
      icon: Shield,
      isActive: (path) => /^\/dashboard\/properties\/[^/]+\/recalls(\/|$)/.test(path),
    },
  ];

  const homeAdminItems: MoreItem[] = [
    { label: 'Reports', href: buildPropertyAwareHref(resolvedPropertyId, 'reports', 'reports'), icon: FileText, isActive: (path) => /^\/dashboard\/properties\/[^/]+\/reports(\/|$)/.test(path) },
    { label: 'Warranties', href: '/dashboard/warranties', icon: FileText, isActive: (path) => path.startsWith('/dashboard/warranties') },
    { label: 'Insurance', href: '/dashboard/insurance', icon: FileText, isActive: (path) => path.startsWith('/dashboard/insurance') },
    { label: 'Expenses', href: '/dashboard/expenses', icon: FileText, isActive: (path) => path.startsWith('/dashboard/expenses') },
    { label: 'Documents', href: '/dashboard/documents', icon: FileText, isActive: (path) => path.startsWith('/dashboard/documents') },
  ];

  const moreItems = [
    {
      group: 'Intelligence',
      buckets: [
        { label: 'AI Tools', items: aiToolItems },
        { label: 'Home Tools', items: homeToolItems },
      ],
    },
    {
      group: 'Management',
      buckets: [
        {
          label: 'Inventory',
          items: [
            {
              label: 'Inventory',
              href: '/dashboard/inventory',
              icon: Box,
              isActive: (path: string) => path.startsWith('/dashboard/inventory'),
            },
          ],
        },
        { label: 'Home Admin', items: homeAdminItems },
      ],
    },
    {
      group: 'Community',
      buckets: [
        { label: 'Protection', items: protectionItems },
        {
          label: 'Community Events',
          items: [
            {
              label: 'Community Events',
              href: '/dashboard/community-events',
              icon: Globe,
              isActive: (path: string) => path.startsWith('/dashboard/community-events'),
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
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
