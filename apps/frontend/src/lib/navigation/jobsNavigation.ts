import {
  Home,
  Shield,
  DollarSign,
  Wrench,
  Box,
  Building,
  Activity,
  AlertTriangle,
  LayoutGrid,
  Search,
  FileText,
  PieChart,
  LifeBuoy,
  Users,
  Sparkles,
} from 'lucide-react';
import { ElementType } from 'react';
import { ADMIN_NAV } from './adminNavigation';

export interface NavJob {
  key: string;
  name: string;
  href: string;
  icon: ElementType;
  description: string;
  engines: string[]; // Keys of tools/engines that belong to this job
  globalHref?: boolean; // true = href is not property-scoped; use as-is regardless of selected property
}

export const PRIMARY_JOBS: NavJob[] = [
  {
    key: 'today',
    name: 'Today',
    href: '/dashboard',
    icon: Home,
    description: 'What matters right now',
    engines: ['daily-snapshot', 'home-event-radar', 'home-gazette', 'status-board'],
  },
  {
    key: 'my-home',
    name: 'My Home',
    href: '/dashboard/properties',
    icon: Building,
    description: 'Your home at a glance',
    engines: ['appreciation', 'home-timeline', 'home-digital-twin', 'neighborhood-change-radar'],
  },
  {
    key: 'protect',
    name: 'Protect',
    href: '/dashboard/protect',
    icon: Shield,
    description: 'Defend your home and wealth',
    engines: [
      'maintenance', 
      'checklist', 
      'seasonal', 
      'risk-radar', 
      'insurance', 
      'warranties', 
      'coverage-intelligence', 
      'risk-premium-optimizer',
      'incidents',
      'claims',
      'recalls',
      'insurance-trend',
      'home-habit-coach',
      'hoa-compliance'
    ],
  },
  {
    key: 'save',
    name: 'Save',
    href: '/dashboard/save',
    icon: DollarSign,
    description: 'Optimize your home finances',
    engines: [
      'savings', 
      'home-savings', 
      'tax-appeal', 
      'energy', 
      'budget', 
      'property-tax', 
      'cost-growth', 
      'cost-explainer', 
      'true-cost', 
      'break-even',
      'mortgage-refinance-radar',
      'hidden-asset-finder',
      'sell-hold-rent'
    ],
  },
  {
    key: 'fix',
    name: 'Fix',
    href: '/dashboard/fix', // Redirects to property-specific /dashboard/properties/[id]/fix
    icon: Wrench,
    description: 'Resolve issues and get things done',
    engines: [
      'resolution-hub',
      'decision-engine',
      'provider-search',
      'booking-management',
      'replace-repair',
      'emergency',
      'visual-inspector',
      'oracle',
      'service-price-radar',
      'negotiation-shield',
      'quote-comparison',
      'price-finalization',
      'maintenance',
      'seasonal',
    ],
  },
  {
    key: 'vault',
    name: 'Vault',
    href: '/dashboard/vault',
    icon: Box,
    description: 'Your home’s memory layer',
    engines: ['inventory', 'documents', 'rooms', 'inspection-report', 'home-digital-will'],
  },
  {
    key: 'neighbourhood-trust',
    name: 'Neighbours',
    href: '/dashboard/neighbourhood-trust',
    icon: Users,
    description: 'Trusted contractors in your neighbourhood',
    engines: ['neighbourhood-trust', 'neighbourhood-feed', 'endorsements'],
    globalHref: true,
  },
  {
    key: 'personalization',
    name: 'Personalized Guidance',
    href: '/dashboard/personalization',
    icon: Sparkles,
    description: 'Suggestions based on your home',
    engines: ['personalization'],
    globalHref: true,
  },
  {
    key: 'home-lab',
    name: 'Home Lab',
    href: '/dashboard/home-lab',
    icon: LayoutGrid,
    description: 'Expert tools and specialized insights',
    engines: [
      'coverage-intelligence',
      'risk-premium-optimizer',
      'do-nothing',
      'home-savings',
      'home-event-radar',
      'home-renovation-risk-advisor',
      'property-tax',
      'insurance-trend',
      'cost-growth',
      'sell-hold-rent',
      'true-cost',
      'cost-explainer',
      'mortgage-refinance-radar',
      'neighborhood-change-radar',
      'hidden-asset-finder',
      'home-habit-coach',
      'break-even',
      'capital-timeline',
      'cost-volatility',
      'plant-advisor',
      'home-gazette',
      'price-finalization',
    ],
  },
];

export interface NavSections {
  coreJobs: NavJob[];
  labJob: NavJob | undefined;
  isAdminNav: boolean;
}

/**
 * Derives the nav sections a role should see. ADMIN gets a dedicated,
 * lightweight nav (see adminNavigation.ts) instead of the homeowner
 * PRIMARY_JOBS list — the two must never be merged.
 */
export function getNavSectionsForRole(role: string | undefined): NavSections {
  if (role === 'ADMIN') {
    return { coreJobs: ADMIN_NAV, labJob: undefined, isAdminNav: true };
  }
  return {
    coreJobs: PRIMARY_JOBS.filter((j) => j.key !== 'home-lab'),
    labJob: PRIMARY_JOBS.find((j) => j.key === 'home-lab'),
    isAdminNav: false,
  };
}
