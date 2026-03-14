import type { ElementType } from 'react';
import { AI_TOOL_ARTWORK, type AIToolArtworkKey } from './aiToolArtwork';
import { resolveToolIcon } from '@/lib/icons';

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
    icon: resolveToolIcon('ai', 'replace-repair'),
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
    icon: resolveToolIcon('ai', 'coverage-intelligence'),
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
    icon: resolveToolIcon('ai', 'risk-premium-optimizer'),
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
    icon: resolveToolIcon('ai', 'do-nothing-simulator'),
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
    icon: resolveToolIcon('ai', 'home-savings'),
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
    icon: resolveToolIcon('ai', 'climate'),
    emoji: '🌧️',
    group: 'monitoring',
    artworkKey: 'climate-risk',
    isActive: (pathname) => /^\/dashboard\/climate(\/|$)/.test(pathname),
  },
  {
    key: 'energy',
    title: 'Energy Audit',
    description: 'Efficiency and utility optimization',
    href: '/dashboard/energy',
    icon: resolveToolIcon('ai', 'energy'),
    emoji: '⚡',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/energy(\/|$)/.test(pathname),
  },
  {
    key: 'visual-inspector',
    title: 'Visual Inspector',
    description: 'Scan home conditions from photos',
    href: '/dashboard/visual-inspector',
    icon: resolveToolIcon('ai', 'visual-inspector'),
    emoji: '📷',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/visual-inspector(\/|$)/.test(pathname),
  },
  {
    key: 'appreciation',
    title: 'Value Tracker',
    description: 'Monitor home value and trendlines',
    href: '/dashboard/appreciation',
    icon: resolveToolIcon('ai', 'appreciation'),
    emoji: '📈',
    group: 'monitoring',
    artworkKey: 'home-equity',
    isActive: (pathname) => /^\/dashboard\/appreciation(\/|$)/.test(pathname),
  },
  {
    key: 'budget',
    title: 'Budget Planner',
    description: 'Plan and track home spending',
    href: '/dashboard/budget',
    icon: resolveToolIcon('ai', 'budget'),
    emoji: '🧮',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/budget(\/|$)/.test(pathname),
  },
  {
    key: 'tax-appeal',
    title: 'Tax Appeals',
    description: 'Evaluate and manage tax appeal options',
    href: '/dashboard/tax-appeal',
    icon: resolveToolIcon('ai', 'tax-appeal'),
    emoji: '⚖️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/tax-appeal(\/|$)/.test(pathname),
  },
  {
    key: 'modifications',
    title: 'Home Upgrades',
    description: 'Track improvements and ROI impact',
    href: '/dashboard/modifications',
    icon: resolveToolIcon('ai', 'modifications'),
    emoji: '🏗️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/modifications(\/|$)/.test(pathname),
  },
  {
    key: 'oracle',
    title: 'Appliance Oracle',
    description: 'Care, lifespan, and replacement intelligence',
    href: '/dashboard/oracle',
    icon: resolveToolIcon('ai', 'oracle'),
    emoji: '🔮',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/oracle(\/|$)/.test(pathname),
  },
  {
    key: 'documents',
    title: 'Document Vault',
    description: 'Organize and review home docs with AI',
    href: '/dashboard/documents',
    icon: resolveToolIcon('ai', 'documents'),
    emoji: '🗂️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/documents(\/|$)/.test(pathname),
  },
  {
    key: 'emergency',
    title: 'Emergency Help',
    description: 'Rapid guidance for urgent home incidents',
    href: '/dashboard/emergency',
    icon: resolveToolIcon('ai', 'emergency'),
    emoji: '🚨',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/emergency(\/|$)/.test(pathname),
  },
  {
    key: 'view-all',
    title: 'View All',
    description: 'Explore all AI tools',
    href: '/dashboard/ai-tools',
    icon: resolveToolIcon('ai', 'view-all'),
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
    key: 'service-price-radar',
    name: 'Service Price Radar',
    hrefSuffix: 'tools/service-price-radar',
    navTarget: 'tool:service-price-radar',
    icon: resolveToolIcon('home', 'service-price-radar'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/service-price-radar(\/|$)/.test(pathname),
  },
  {
    key: 'property-tax',
    name: 'Property Tax',
    hrefSuffix: 'tools/property-tax',
    navTarget: 'tool:property-tax',
    icon: resolveToolIcon('home', 'property-tax'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/property-tax(\/|$)/.test(pathname),
  },
  {
    key: 'cost-growth',
    name: 'Cost Growth',
    hrefSuffix: 'tools/cost-growth',
    navTarget: 'tool:cost-growth',
    icon: resolveToolIcon('home', 'cost-growth'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-growth(\/|$)/.test(pathname),
  },
  {
    key: 'insurance-trend',
    name: 'Insurance Trend',
    hrefSuffix: 'tools/insurance-trend',
    navTarget: 'tool:insurance-trend',
    icon: resolveToolIcon('home', 'insurance-trend'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/insurance-trend(\/|$)/.test(pathname),
  },
  {
    key: 'negotiation-shield',
    name: 'Negotiation Shield',
    hrefSuffix: 'tools/negotiation-shield',
    navTarget: 'tool:negotiation-shield',
    icon: resolveToolIcon('home', 'negotiation-shield'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/negotiation-shield(\/|$)/.test(pathname),
  },
  {
    key: 'cost-explainer',
    name: 'Cost Explainer',
    hrefSuffix: 'tools/cost-explainer',
    navTarget: 'tool:cost-explainer',
    icon: resolveToolIcon('home', 'cost-explainer'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-explainer(\/|$)/.test(pathname),
  },
  {
    key: 'true-cost',
    name: 'True Cost',
    hrefSuffix: 'tools/true-cost',
    navTarget: 'tool:true-cost',
    icon: resolveToolIcon('home', 'true-cost'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/true-cost(\/|$)/.test(pathname),
  },
  {
    key: 'sell-hold-rent',
    name: 'Sell / Hold / Rent',
    hrefSuffix: 'tools/sell-hold-rent',
    navTarget: 'tool:sell-hold-rent',
    icon: resolveToolIcon('home', 'sell-hold-rent'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/sell-hold-rent(\/|$)/.test(pathname),
  },
  {
    key: 'cost-volatility',
    name: 'Volatility',
    hrefSuffix: 'tools/cost-volatility',
    navTarget: 'tool:cost-volatility',
    icon: resolveToolIcon('home', 'cost-volatility'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-volatility(\/|$)/.test(pathname),
  },
  {
    key: 'break-even',
    name: 'Break-Even',
    hrefSuffix: 'tools/break-even',
    navTarget: 'tool:break-even',
    icon: resolveToolIcon('home', 'break-even'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/break-even(\/|$)/.test(pathname),
  },
  {
    key: 'capital-timeline',
    name: 'Home Capital Timeline',
    hrefSuffix: 'tools/capital-timeline',
    navTarget: 'tool:capital-timeline',
    icon: resolveToolIcon('home', 'capital-timeline'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(\/|$)/.test(pathname),
  },
  {
    key: 'seller-prep',
    name: 'Seller Prep',
    hrefSuffix: 'seller-prep',
    navTarget: 'seller-prep',
    icon: resolveToolIcon('home', 'seller-prep'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/seller-prep(\/|$)/.test(pathname),
  },
  {
    key: 'home-timeline',
    name: 'Home Timeline',
    hrefSuffix: 'timeline',
    navTarget: 'home-timeline',
    icon: resolveToolIcon('home', 'home-timeline'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/timeline(\/|$)/.test(pathname),
  },
  {
    key: 'status-board',
    name: 'Status Board',
    hrefSuffix: 'status-board',
    navTarget: 'status-board',
    icon: resolveToolIcon('home', 'status-board'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/status-board(\/|$)/.test(pathname),
  },
];
