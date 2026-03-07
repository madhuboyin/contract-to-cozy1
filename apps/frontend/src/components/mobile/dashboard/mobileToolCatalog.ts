import type { ElementType } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Calculator,
  Camera,
  Cloud,
  DollarSign,
  FileText,
  Home,
  Info,
  LayoutGrid,
  PauseCircle,
  PiggyBank,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  Wrench,
  Zap,
} from 'lucide-react';
import { AI_TOOL_ARTWORK, type AIToolArtworkKey } from './aiToolArtwork';

export type MobileAiToolKey =
  | 'replace-repair'
  | 'coverage-intelligence'
  | 'risk-premium-optimizer'
  | 'do-nothing-simulator'
  | 'home-savings'
  | 'emergency'
  | 'documents'
  | 'oracle'
  | 'budget'
  | 'climate'
  | 'modifications'
  | 'appreciation'
  | 'energy'
  | 'visual-inspector'
  | 'tax-appeal'
  | 'view-all';

export type MobileAiToolGroup = 'core' | 'monitoring' | 'planning';

export type MobileAiToolDefinition = {
  key: MobileAiToolKey;
  title: string;
  description: string;
  href: string;
  icon: ElementType;
  emoji: string;
  group: MobileAiToolGroup;
  artworkKey?: AIToolArtworkKey;
  isActive: (pathname: string) => boolean;
};

type RawAiToolDefinition = Omit<MobileAiToolDefinition, 'artworkKey'> & {
  artworkKey?: AIToolArtworkKey;
};

const RAW_MOBILE_AI_TOOL_CATALOG: RawAiToolDefinition[] = [
  {
    key: 'replace-repair',
    title: 'Repair vs Replace',
    description: 'Decision support for home fixes',
    href: '/dashboard/replace-repair',
    icon: Wrench,
    emoji: '🛠️',
    group: 'core',
    artworkKey: 'repair-vs-replace',
    isActive: (pathname) =>
      /^\/dashboard\/replace-repair(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/inventory\/items\/[^/]+\/replace-repair(\/|$)/.test(pathname),
  },
  {
    key: 'coverage-intelligence',
    title: 'Coverage Intelligence',
    description: 'Detect and close protection gaps',
    href: '/dashboard/coverage-intelligence',
    icon: ShieldCheck,
    emoji: '🧾',
    group: 'core',
    artworkKey: 'coverage-intelligence',
    isActive: (pathname) =>
      /^\/dashboard\/coverage-intelligence(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/coverage-intelligence(\/|$)/.test(pathname),
  },
  {
    key: 'risk-premium-optimizer',
    title: 'Risk Optimizer',
    description: 'Reduce risk and premium pressure',
    href: '/dashboard/risk-premium-optimizer',
    icon: ShieldAlert,
    emoji: '📉',
    group: 'core',
    artworkKey: 'risk-optimizer',
    isActive: (pathname) =>
      /^\/dashboard\/risk-premium-optimizer(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/risk-premium-optimizer(\/|$)/.test(pathname),
  },
  {
    key: 'do-nothing-simulator',
    title: 'Do-Nothing Simulator',
    description: 'Model the cost of delayed action',
    href: '/dashboard/do-nothing-simulator',
    icon: PauseCircle,
    emoji: '⏳',
    group: 'core',
    artworkKey: 'do-nothing-simulator',
    isActive: (pathname) =>
      /^\/dashboard\/do-nothing-simulator(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/do-nothing(\/|$)/.test(pathname),
  },
  {
    key: 'home-savings',
    title: 'Home Savings Check',
    description: 'Find recurring savings opportunities',
    href: '/dashboard/home-savings',
    icon: PiggyBank,
    emoji: '💸',
    group: 'core',
    artworkKey: 'home-savings-check',
    isActive: (pathname) =>
      /^\/dashboard\/home-savings(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/home-savings(\/|$)/.test(pathname),
  },
  {
    key: 'climate',
    title: 'Climate Risk',
    description: 'Weather and climate exposure trends',
    href: '/dashboard/climate',
    icon: Cloud,
    emoji: '🌧️',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/climate(\/|$)/.test(pathname),
  },
  {
    key: 'energy',
    title: 'Energy Audit',
    description: 'Efficiency and utility optimization',
    href: '/dashboard/energy',
    icon: Activity,
    emoji: '⚡',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/energy(\/|$)/.test(pathname),
  },
  {
    key: 'visual-inspector',
    title: 'Visual Inspector',
    description: 'Scan home conditions from photos',
    href: '/dashboard/visual-inspector',
    icon: Camera,
    emoji: '📷',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/visual-inspector(\/|$)/.test(pathname),
  },
  {
    key: 'appreciation',
    title: 'Value Tracker',
    description: 'Monitor home value and trendlines',
    href: '/dashboard/appreciation',
    icon: TrendingUp,
    emoji: '📈',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/appreciation(\/|$)/.test(pathname),
  },
  {
    key: 'budget',
    title: 'Budget Planner',
    description: 'Plan and track home spending',
    href: '/dashboard/budget',
    icon: DollarSign,
    emoji: '🧮',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/budget(\/|$)/.test(pathname),
  },
  {
    key: 'tax-appeal',
    title: 'Tax Appeals',
    description: 'Evaluate and manage tax appeal options',
    href: '/dashboard/tax-appeal',
    icon: Scale,
    emoji: '⚖️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/tax-appeal(\/|$)/.test(pathname),
  },
  {
    key: 'modifications',
    title: 'Home Upgrades',
    description: 'Track improvements and ROI impact',
    href: '/dashboard/modifications',
    icon: Home,
    emoji: '🏗️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/modifications(\/|$)/.test(pathname),
  },
  {
    key: 'oracle',
    title: 'Appliance Oracle',
    description: 'Care, lifespan, and replacement intelligence',
    href: '/dashboard/oracle',
    icon: Zap,
    emoji: '🔮',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/oracle(\/|$)/.test(pathname),
  },
  {
    key: 'documents',
    title: 'Document Vault',
    description: 'Organize and review home docs with AI',
    href: '/dashboard/documents',
    icon: FileText,
    emoji: '🗂️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/documents(\/|$)/.test(pathname),
  },
  {
    key: 'emergency',
    title: 'Emergency Help',
    description: 'Rapid guidance for urgent home incidents',
    href: '/dashboard/emergency',
    icon: AlertTriangle,
    emoji: '🚨',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/emergency(\/|$)/.test(pathname),
  },
  {
    key: 'view-all',
    title: 'View All',
    description: 'Explore all AI tools',
    href: '/dashboard/ai-tools',
    icon: LayoutGrid,
    emoji: '🧰',
    group: 'core',
    artworkKey: 'view-all',
    isActive: (pathname) => /^\/dashboard\/ai-tools(\/|$)/.test(pathname),
  },
];

export const MOBILE_AI_TOOL_CATALOG: Array<MobileAiToolDefinition & { artworkSrc?: string }> =
  RAW_MOBILE_AI_TOOL_CATALOG.map((tool) => ({
    ...tool,
    artworkSrc: tool.artworkKey ? AI_TOOL_ARTWORK[tool.artworkKey] : undefined,
  }));

export const MOBILE_AI_TOOL_GROUPS: Array<{
  key: MobileAiToolGroup;
  title: string;
  summary: string;
}> = [
  {
    key: 'core',
    title: 'Core Decision Tools',
    summary: 'Repair, coverage, risk, and savings intelligence',
  },
  {
    key: 'monitoring',
    title: 'Monitoring + Risk',
    summary: 'Continuous exposure and value monitoring',
  },
  {
    key: 'planning',
    title: 'Planning + Operations',
    summary: 'Budgeting, upgrades, and emergency readiness',
  },
];

export const MOBILE_HOME_AI_TILE_KEYS: MobileAiToolKey[] = [
  'replace-repair',
  'risk-premium-optimizer',
  'coverage-intelligence',
  'view-all',
];

export type MobilePropertyToolLink = {
  key: string;
  name: string;
  hrefSuffix: string;
  navTarget: string;
  icon: ElementType;
  isActive: (pathname: string) => boolean;
};

export const MOBILE_HOME_TOOL_LINKS: MobilePropertyToolLink[] = [
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
