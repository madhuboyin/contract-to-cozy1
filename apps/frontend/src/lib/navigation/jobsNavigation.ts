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
  LifeBuoy
} from 'lucide-react';
import { ElementType } from 'react';

export interface NavJob {
  key: string;
  name: string;
  href: string;
  icon: ElementType;
  description: string;
  engines: string[]; // Keys of tools/engines that belong to this job
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
    href: '/dashboard/maintenance', // For now, points here
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
      'home-habit-coach'
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
    href: '/dashboard/fix',
    icon: Wrench,
    description: 'Solve problems and repairs',
    engines: [
      'replace-repair', 
      'emergency', 
      'providers', 
      'bookings', 
      'visual-inspector', 
      'oracle', 
      'service-price-radar', 
      'negotiation-shield', 
      'quote-comparison', 
      'price-finalization'
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
];
