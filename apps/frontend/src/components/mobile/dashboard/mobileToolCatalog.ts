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
  description: string;
  desktopDescription?: string;
  workflowOnly?: boolean;
  hrefSuffix: string;
  navTarget: string;
  icon: ElementType;
  isActive: (pathname: string) => boolean;
};

export const MOBILE_HOME_TOOL_LINKS: MobilePropertyToolLink[] = [
  {
    key: 'home-event-radar',
    name: 'Home Event Radar',
    description: "Track current signals affecting your home",
    desktopDescription: "Events that may affect your property, matched to your specific home.",
    hrefSuffix: 'tools/home-event-radar',
    navTarget: 'tool:home-event-radar',
    icon: resolveToolIcon('home', 'home-event-radar'),
    isActive: (pathname) => /^\/dashboard\/(properties\/[^/]+\/tools\/home-event-radar|home-event-radar)(\/|$)/.test(pathname),
  },
  {
    key: 'home-risk-replay',
    name: 'Home Risk Replay',
    description: "See what your home has already been through",
    desktopDescription: "Replay major events your home has already been through and understand impact over time.",
    hrefSuffix: 'tools/home-risk-replay?launchSurface=home_tools',
    navTarget: 'tool:home-risk-replay',
    icon: resolveToolIcon('home', 'home-risk-replay'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-risk-replay(\/|$)/.test(pathname),
  },
  {
    key: 'service-price-radar',
    name: 'Service Price Radar',
    description: "Know if a quote is fair for your home",
    desktopDescription: "Compare local service pricing so you can judge whether a quote is fair for your home.",
    hrefSuffix: 'tools/service-price-radar?launchSurface=home_tools',
    navTarget: 'tool:service-price-radar',
    icon: resolveToolIcon('home', 'service-price-radar'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/service-price-radar(\/|$)/.test(pathname),
  },
  {
    key: 'property-tax',
    name: 'Property Tax',
    description: "Forecast annual tax drag",
    desktopDescription: "Forecast annual property tax burden and monitor drivers of future tax increases.",
    hrefSuffix: 'tools/property-tax',
    navTarget: 'tool:property-tax',
    icon: resolveToolIcon('home', 'property-tax'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/property-tax(\/|$)/.test(pathname),
  },
  {
    key: 'cost-growth',
    name: 'Cost Growth',
    description: "Model ownership cost trend",
    desktopDescription: "Model how ownership costs may grow across taxes, insurance, utilities, and upkeep.",
    hrefSuffix: 'tools/cost-growth',
    navTarget: 'tool:cost-growth',
    icon: resolveToolIcon('home', 'cost-growth'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-growth(\/|$)/.test(pathname),
  },
  {
    key: 'insurance-trend',
    name: 'Insurance Trend',
    description: "Track premium pressure",
    desktopDescription: "Track premium pressure and renewal risk based on your property profile and trends.",
    hrefSuffix: 'tools/insurance-trend',
    navTarget: 'tool:insurance-trend',
    icon: resolveToolIcon('home', 'insurance-trend'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/insurance-trend(\/|$)/.test(pathname),
  },
  {
    key: 'negotiation-shield',
    name: 'Negotiation Shield',
    description: "Review quotes, claims, and inspection asks",
    desktopDescription: "Build stronger responses for quotes, claims, and inspection requests with clear leverage points.",
    hrefSuffix: 'tools/negotiation-shield',
    navTarget: 'tool:negotiation-shield',
    icon: resolveToolIcon('home', 'negotiation-shield'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/negotiation-shield(\/|$)/.test(pathname),
  },
  {
    key: 'quote-comparison',
    name: 'Quote Comparison',
    description: "Compare vendor quotes side by side",
    desktopDescription: "Review multiple vendor quotes together so you can shortlist the best option with context.",
    workflowOnly: true,
    hrefSuffix: 'tools/quote-comparison',
    navTarget: 'tool:quote-comparison',
    icon: resolveToolIcon('home', 'quote-comparison'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/quote-comparison(\/|$)/.test(pathname),
  },
  {
    key: 'price-finalization',
    name: 'Price Finalization',
    description: "Capture accepted terms before booking",
    desktopDescription: "Lock accepted pricing and key terms so your booking flow starts with clear scope and cost.",
    hrefSuffix: 'tools/price-finalization',
    navTarget: 'tool:price-finalization',
    icon: resolveToolIcon('home', 'price-finalization'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/price-finalization(\/|$)/.test(pathname),
  },
  {
    key: 'cost-explainer',
    name: 'Cost Explainer',
    description: "Understand what drives costs",
    desktopDescription: "Break down what is driving your home costs and where increases are coming from.",
    hrefSuffix: 'tools/cost-explainer',
    navTarget: 'tool:cost-explainer',
    icon: resolveToolIcon('home', 'cost-explainer'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-explainer(\/|$)/.test(pathname),
  },
  {
    key: 'true-cost',
    name: 'True Cost',
    description: "View full ownership cost",
    desktopDescription: "See your all-in ownership cost, including recurring spend, risk, and long-term obligations.",
    hrefSuffix: 'tools/true-cost',
    navTarget: 'tool:true-cost',
    icon: resolveToolIcon('home', 'true-cost'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/true-cost(\/|$)/.test(pathname),
  },
  {
    key: 'sell-hold-rent',
    name: 'Sell / Hold / Rent',
    description: "Compare next-step scenarios",
    desktopDescription: "Compare sell, hold, and rent paths with projected returns, costs, and tradeoffs.",
    hrefSuffix: 'tools/sell-hold-rent',
    navTarget: 'tool:sell-hold-rent',
    icon: resolveToolIcon('home', 'sell-hold-rent'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/sell-hold-rent(\/|$)/.test(pathname),
  },
  {
    key: 'cost-volatility',
    name: 'Volatility',
    description: "Measure cost variability",
    desktopDescription: "Measure cost variability and identify where future expense swings are most likely.",
    hrefSuffix: 'tools/cost-volatility',
    navTarget: 'tool:cost-volatility',
    icon: resolveToolIcon('home', 'cost-volatility'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/cost-volatility(\/|$)/.test(pathname),
  },
  {
    key: 'break-even',
    name: 'Break-Even',
    description: "Estimate decision break-even",
    desktopDescription: "Estimate when appreciation is projected to outweigh cumulative ownership costs.",
    hrefSuffix: 'tools/break-even',
    navTarget: 'tool:break-even',
    icon: resolveToolIcon('home', 'break-even'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/break-even(\/|$)/.test(pathname),
  },
  {
    key: 'capital-timeline',
    name: 'Home Capital Timeline',
    description: "Plan major capital events",
    desktopDescription: "Plan major capital events, from replacements to upgrades, on a long-range timeline.",
    hrefSuffix: 'tools/capital-timeline',
    navTarget: 'tool:capital-timeline',
    icon: resolveToolIcon('home', 'capital-timeline'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(\/|$)/.test(pathname),
  },
  {
    key: 'seller-prep',
    name: 'Seller Prep',
    description: "Prep high-ROI improvements",
    desktopDescription: "Prioritize pre-sale improvements based on expected ROI, effort, and buyer impact.",
    hrefSuffix: 'seller-prep',
    navTarget: 'seller-prep',
    icon: resolveToolIcon('home', 'seller-prep'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/seller-prep(\/|$)/.test(pathname),
  },
  {
    key: 'home-timeline',
    name: 'Home Timeline',
    description: "Track milestones over time",
    desktopDescription: "Track key milestones, major work, and ownership events over your home timeline.",
    hrefSuffix: 'timeline',
    navTarget: 'home-timeline',
    icon: resolveToolIcon('home', 'home-timeline'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/timeline(\/|$)/.test(pathname),
  },
  {
    key: 'status-board',
    name: 'Status Board',
    description: "Monitor home status signals",
    desktopDescription: "See your home's current health, risk posture, and readiness status at a glance.",
    hrefSuffix: 'status-board',
    navTarget: 'status-board',
    icon: resolveToolIcon('home', 'status-board'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/status-board(\/|$)/.test(pathname),
  },
  {
    key: 'home-digital-will',
    name: 'Home Digital Will',
    description: "Store critical home knowledge for trusted parties",
    desktopDescription: "Store trusted contacts, access details, and critical home instructions for handoff or emergencies.",
    hrefSuffix: 'tools/home-digital-will',
    navTarget: 'tool:home-digital-will',
    icon: resolveToolIcon('home', 'home-digital-will'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-will(\/|$)/.test(pathname),
  },
  {
    key: 'hidden-asset-finder',
    name: 'Hidden Asset Finder',
    description: "Find potential rebates, credits, and benefits for your home",
    desktopDescription: "Identify likely rebates, credits, grants, and benefits tied to your property and systems.",
    hrefSuffix: 'tools/hidden-asset-finder',
    navTarget: 'tool:hidden-asset-finder',
    icon: resolveToolIcon('home', 'hidden-asset-finder'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/hidden-asset-finder(\/|$)/.test(pathname),
  },
  {
    key: 'home-digital-twin',
    name: 'Home Digital Twin',
    description: "A living model of your home — systems, age, risk, and what-if scenarios",
    desktopDescription: "Use a living digital model of your home to evaluate systems, risk, and what-if scenarios.",
    hrefSuffix: 'tools/home-digital-twin',
    navTarget: 'tool:home-digital-twin',
    icon: resolveToolIcon('home', 'home-digital-twin'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-twin(\/|$)/.test(pathname),
  },
  {
    key: 'neighborhood-change-radar',
    name: 'Neighborhood Change Radar',
    description: "Track major external changes near your home and understand how they may affect value, demand, and livability.",
    desktopDescription: "Track major nearby changes and understand potential effects on value, demand, and livability.",
    hrefSuffix: 'tools/neighborhood-change-radar',
    navTarget: 'tool:neighborhood-change-radar',
    icon: resolveToolIcon('home', 'neighborhood-change-radar'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/neighborhood-change-radar(\/|$)/.test(pathname),
  },
  {
    key: 'home-habit-coach',
    name: 'Home Habit Coach',
    description: "Seasonal care routines and safety checks for your home",
    desktopDescription: "Get seasonal care routines and safety habits tailored to your home's needs.",
    hrefSuffix: 'tools/home-habit-coach',
    navTarget: 'tool:home-habit-coach',
    icon: resolveToolIcon('home', 'home-habit-coach'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/home-habit-coach(\/|$)/.test(pathname),
  },
  {
    key: 'plant-advisor',
    name: 'Plant Advisor',
    description: "Room-aware plant recommendations tailored to your home's spaces",
    desktopDescription: "Get deterministic, room-aware plant recommendations with fit signals and care guidance.",
    hrefSuffix: 'tools/plant-advisor',
    navTarget: 'tool:plant-advisor',
    icon: resolveToolIcon('home', 'plant-advisor'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/plant-advisor(\/|$)/.test(pathname),
  },
  {
    key: 'home-renovation-risk-advisor',
    name: 'Renovation Risk Advisor',
    description: "Check permit rules, tax impact, and contractor requirements before a major renovation.",
    desktopDescription: "Check permits, tax impact, and contractor requirements before committing to major renovations.",
    hrefSuffix: 'tools/home-renovation-risk-advisor',
    navTarget: 'tool:home-renovation-risk-advisor',
    icon: resolveToolIcon('home', 'home-renovation-risk-advisor'),
    isActive: (pathname) => /^\/dashboard\/(properties\/[^/]+\/tools\/home-renovation-risk-advisor|home-renovation-risk-advisor)(\/|$)/.test(pathname),
  },
  {
    key: 'mortgage-refinance-radar',
    name: 'Mortgage Refinance Radar',
    description: "Monitor the market and know when refinancing makes financial sense.",
    desktopDescription: "Monitor refinance signals and know when refinancing is more likely to make financial sense.",
    hrefSuffix: 'tools/mortgage-refinance-radar',
    navTarget: 'tool:mortgage-refinance-radar',
    icon: resolveToolIcon('home', 'mortgage-refinance-radar'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/mortgage-refinance-radar(\/|$)/.test(pathname),
  },
  {
    key: 'home-gazette',
    name: 'Home Gazette',
    description: "Your weekly home intelligence briefing — risks, maintenance, finances, and more.",
    desktopDescription: "Your weekly home intelligence briefing covering risk, maintenance priorities, and financial signals.",
    hrefSuffix: 'tools/home-gazette',
    navTarget: 'tool:home-gazette',
    icon: resolveToolIcon('home', 'home-gazette'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/home-gazette(\/|$)/.test(pathname),
  },
  {
    key: 'coverage-options',
    name: 'Coverage Options',
    description: "Compare policy and warranty options for your coverage gaps",
    desktopDescription: "Compare available home warranty and insurance policy options to close identified coverage gaps.",
    hrefSuffix: 'tools/coverage-options',
    navTarget: 'tool:coverage-options',
    icon: resolveToolIcon('home', 'coverage-options'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/coverage-options(\/|$)/.test(pathname),
  },
  {
    key: 'guidance-overview',
    name: 'Guidance Overview',
    description: "Review active guidance signals and your next recommended steps",
    desktopDescription: "See all active guidance signals across your property and track recommended resolution steps.",
    hrefSuffix: 'tools/guidance-overview',
    navTarget: 'tool:guidance-overview',
    icon: resolveToolIcon('home', 'guidance-overview'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/guidance-overview(\/|$)/.test(pathname),
  },
];
