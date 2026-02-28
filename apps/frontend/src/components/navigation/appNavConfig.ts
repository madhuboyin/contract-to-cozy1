'use client';

import {
  Activity,
  AlertTriangle,
  Box,
  Building,
  Calendar,
  ClipboardCheck,
  DollarSign,
  FileText,
  Globe,
  Home,
  LayoutGrid,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type NavItemContext = {
  propertyId?: string;
};

export type AppNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  getHref: (ctx: NavItemContext) => string;
  isActive: (pathname: string) => boolean;
};

export type AppNavSection = {
  key: string;
  label: string;
  items: AppNavItem[];
};

export type AppNavConfig = {
  pinned: AppNavItem[];
  sections: AppNavSection[];
};

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;

export function getPropertyIdFromPathname(pathname: string): string | undefined {
  return pathname.match(PROPERTY_ID_IN_PATH)?.[1];
}

export function buildPropertyAwareHref(
  propertyId: string | undefined,
  hrefSuffix: string,
  navTarget: string
): string {
  if (propertyId) {
    return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  }

  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

const APP_NAV_CONFIG: AppNavConfig = {
  pinned: [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      getHref: () => '/dashboard',
      isActive: (pathname) => pathname === '/dashboard',
    },
    {
      key: 'status-board',
      label: 'Status Board',
      icon: LayoutGrid,
      getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'status-board', 'status-board'),
      isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/status-board(\/|$)/.test(pathname),
    },
    {
      key: 'actions',
      label: 'Actions',
      icon: AlertTriangle,
      getHref: () => '/dashboard/actions',
      isActive: (pathname) => pathname.startsWith('/dashboard/actions'),
    },
    {
      key: 'find-services',
      label: 'Find Services',
      icon: Search,
      getHref: () => '/dashboard/providers',
      isActive: (pathname) => pathname.startsWith('/dashboard/providers'),
    },
  ],
  sections: [
    {
      key: 'intelligence',
      label: 'Intelligence',
      items: [
        {
          key: 'coverage-intelligence',
          label: 'Coverage Intelligence',
          icon: ShieldCheck,
          getHref: () => '/dashboard/coverage-intelligence',
          isActive: (pathname) =>
            /^\/dashboard\/coverage-intelligence(\/|$)/.test(pathname) ||
            /^\/dashboard\/properties\/[^/]+\/tools\/coverage-intelligence(\/|$)/.test(pathname),
        },
        {
          key: 'risk-premium-optimizer',
          label: 'Risk-to-Premium Optimizer',
          icon: ShieldAlert,
          getHref: () => '/dashboard/risk-premium-optimizer',
          isActive: (pathname) =>
            /^\/dashboard\/risk-premium-optimizer(\/|$)/.test(pathname) ||
            /^\/dashboard\/properties\/[^/]+\/tools\/risk-premium-optimizer(\/|$)/.test(pathname),
        },
        {
          key: 'replace-repair',
          label: 'Replace or Repair',
          icon: Wrench,
          getHref: () => '/dashboard/replace-repair',
          isActive: (pathname) =>
            /^\/dashboard\/replace-repair(\/|$)/.test(pathname) ||
            /^\/dashboard\/properties\/[^/]+\/inventory\/items\/[^/]+\/replace-repair(\/|$)/.test(pathname),
        },
        {
          key: 'do-nothing-simulator',
          label: 'Do-Nothing Simulator',
          icon: Activity,
          getHref: () => '/dashboard/do-nothing-simulator',
          isActive: (pathname) =>
            /^\/dashboard\/do-nothing-simulator(\/|$)/.test(pathname) ||
            /^\/dashboard\/properties\/[^/]+\/tools\/do-nothing(\/|$)/.test(pathname),
        },
        {
          key: 'oracle',
          label: 'Appliance Oracle',
          icon: Zap,
          getHref: () => '/dashboard/oracle',
          isActive: (pathname) => /^\/dashboard\/oracle(\/|$)/.test(pathname),
        },
      ],
    },
    {
      key: 'finance',
      label: 'Finance',
      items: [
        {
          key: 'true-cost',
          label: 'True Cost',
          icon: DollarSign,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'tools/true-cost', 'tool:true-cost'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/true-cost(\/|$)/.test(pathname),
        },
        {
          key: 'break-even',
          label: 'Break-Even',
          icon: Target,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'tools/break-even', 'tool:break-even'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/break-even(\/|$)/.test(pathname),
        },
        {
          key: 'volatility',
          label: 'Volatility',
          icon: Activity,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'tools/cost-volatility', 'tool:cost-volatility'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-volatility(\/|$)/.test(pathname),
        },
        {
          key: 'home-capital-timeline',
          label: 'Home Capital Timeline',
          icon: Calendar,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'tools/capital-timeline', 'tool:capital-timeline'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(\/|$)/.test(pathname),
        },
        {
          key: 'cost-growth',
          label: 'Cost Growth',
          icon: TrendingUp,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'tools/cost-growth', 'tool:cost-growth'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-growth(\/|$)/.test(pathname),
        },
      ],
    },
    {
      key: 'home',
      label: 'Home',
      items: [
        {
          key: 'inventory',
          label: 'Inventory',
          icon: Box,
          getHref: () => '/dashboard/inventory',
          isActive: (pathname) =>
            pathname.startsWith('/dashboard/inventory') ||
            /^\/dashboard\/properties\/[^/]+\/inventory(\/|$)/.test(pathname),
        },
        {
          key: 'rooms',
          label: 'Rooms',
          icon: Building,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'rooms', 'rooms'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/rooms(\/|$)/.test(pathname),
        },
        {
          key: 'warranties',
          label: 'Warranties',
          icon: Wrench,
          getHref: () => '/dashboard/warranties',
          isActive: (pathname) => pathname.startsWith('/dashboard/warranties'),
        },
        {
          key: 'documents',
          label: 'Documents',
          icon: FileText,
          getHref: () => '/dashboard/documents',
          isActive: (pathname) => pathname.startsWith('/dashboard/documents'),
        },
        {
          key: 'reports',
          label: 'Reports',
          icon: FileText,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'reports', 'reports'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/reports(\/|$)/.test(pathname),
        },
      ],
    },
    {
      key: 'protection',
      label: 'Protection',
      items: [
        {
          key: 'insurance',
          label: 'Insurance',
          icon: Shield,
          getHref: () => '/dashboard/insurance',
          isActive: (pathname) => pathname.startsWith('/dashboard/insurance'),
        },
        {
          key: 'incidents',
          label: 'Incidents',
          icon: ShieldAlert,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'incidents', 'incidents'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/incidents(\/|$)/.test(pathname),
        },
        {
          key: 'claims',
          label: 'Claims',
          icon: ClipboardCheck,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'claims', 'claims'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/claims(\/|$)/.test(pathname),
        },
        {
          key: 'recalls',
          label: 'Recalls',
          icon: ShieldCheck,
          getHref: ({ propertyId }) => buildPropertyAwareHref(propertyId, 'recalls', 'recalls'),
          isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/recalls(\/|$)/.test(pathname),
        },
      ],
    },
    {
      key: 'community',
      label: 'Community',
      items: [
        {
          key: 'community-events',
          label: 'Community Events',
          icon: Globe,
          getHref: () => '/dashboard/community-events',
          isActive: (pathname) => pathname.startsWith('/dashboard/community-events'),
        },
      ],
    },
  ],
};

export default APP_NAV_CONFIG;
