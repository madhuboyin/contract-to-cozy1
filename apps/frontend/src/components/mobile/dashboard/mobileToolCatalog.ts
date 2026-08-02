import type { ElementType } from 'react';
import { Layers } from 'lucide-react';
import { AI_TOOL_ARTWORK, type AIToolArtworkKey } from './aiToolArtwork';
import { resolveToolIcon } from '@/lib/icons';

export type MobileAiToolKey =
  | 'replace-repair'
  | 'coverage-intelligence'
  | 'risk-premium-optimizer'
  | 'do-nothing-simulator'
  | 'savings-benefits'
  | 'emergency'
  | 'documents'
  | 'oracle'
  | 'budget'
  | 'appreciation'
  | 'energy'
  | 'visual-inspector'
  | 'property-tax'
  | 'insurance-trend'
  | 'ownership-costs'
  | 'sell-hold-rent'
  | 'mortgage-refinance-radar'
  | 'neighborhood-change-radar'
  | 'home-digital-twin'
  | 'home-habit-coach'
  | 'break-even'
  | 'capital-timeline'
  | 'guidance-overview'
  | 'plant-advisor'
  | 'home-event-radar'
  | 'home-briefing'
  | 'home-risk-replay'
  | 'property-brief'
  | 'service-price-radar'
  | 'price-finalization'
  | 'quote-comparison'
  | 'negotiation-shield'
  | 'home-renovation-risk-advisor'
  | 'home-digital-will'
  | 'material-specs'
  | 'financing'
  | 'diy'
  | 'project-tracker'
  | 'view-all';

export type MobileAiToolGroup = 'core' | 'wealth' | 'monitoring' | 'planning';

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
  // --- CORE DECISION TOOLS ---
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
    key: 'sell-hold-rent',
    title: 'Sell / Hold / Rent',
    description: 'Compare ROI scenarios for your home',
    href: '/dashboard/sell-hold-rent',
    icon: resolveToolIcon('home', 'sell-hold-rent'),
    emoji: '🏠',
    group: 'core',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/sell-hold-rent(\/|$)/.test(pathname),
  },
  {
    key: 'negotiation-shield',
    title: 'Negotiation Shield',
    description: 'Review quotes and inspection asks',
    href: '/dashboard/negotiation-shield',
    icon: resolveToolIcon('home', 'negotiation-shield'),
    emoji: '🛡️',
    group: 'core',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/negotiation-shield(\/|$)/.test(pathname),
  },
  {
    key: 'break-even',
    title: 'Break-Even',
    description: 'Estimate decision break-even timeline',
    href: '/dashboard/break-even',
    icon: resolveToolIcon('home', 'break-even'),
    emoji: '⚖️',
    group: 'core',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/break-even(\/|$)/.test(pathname),
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
    key: 'home-renovation-risk-advisor',
    title: 'Renovations',
    description: 'Plan and execute one governed renovation journey',
    href: '/dashboard/home-renovation-risk-advisor',
    icon: resolveToolIcon('home', 'home-renovation-risk-advisor'),
    emoji: '🏗️',
    group: 'core',
    isActive: (pathname) => /^\/dashboard\/(properties\/[^/]+\/renovations|home-renovation-risk-advisor)(\/|$)/.test(pathname),
  },

  // --- WEALTH & SAVINGS ---
  {
    key: 'savings-benefits',
    title: 'Savings and Benefits',
    description: 'Find rebates, credits, and recurring savings for this home',
    href: '/dashboard/savings-benefits',
    icon: resolveToolIcon('home', 'savings-benefits'),
    emoji: '💸',
    group: 'wealth',
    artworkKey: 'home-savings-check',
    isActive: (pathname) =>
      /^\/dashboard\/savings-benefits(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/(?:savings-benefits|hidden-asset-finder|home-savings)(\/|$)/.test(pathname),
  },
  {
    key: 'property-tax',
    title: 'Property Tax Center',
    description: 'Verify tax facts and prepare next steps',
    href: '/dashboard/property-tax',
    icon: resolveToolIcon('home', 'property-tax'),
    emoji: '🏛️',
    group: 'wealth',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/property-tax(\/|$)/.test(pathname),
  },
  {
    key: 'mortgage-refinance-radar',
    title: 'Refi Radar',
    description: 'Track mortgage optimization windows',
    href: '/dashboard/mortgage-refinance-radar',
    icon: resolveToolIcon('home', 'mortgage-refinance-radar'),
    emoji: '📉',
    group: 'wealth',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/mortgage-refinance-radar(\/|$)/.test(pathname),
  },
  {
    key: 'coverage-intelligence',
    title: 'Coverage & Premium Review',
    description: 'Compare protection choices and record a coverage decision',
    href: '/dashboard/coverage-intelligence',
    icon: resolveToolIcon('ai', 'coverage-intelligence'),
    emoji: '🧾',
    group: 'core',
    artworkKey: 'coverage-intelligence',
    isActive: (pathname) =>
      /^\/dashboard\/coverage-intelligence(\/|$)/.test(pathname) ||
      /^\/dashboard\/properties\/[^/]+\/tools\/(?:coverage-intelligence|coverage-options|insurance-trend|risk-premium-optimizer)(\/|$)/.test(pathname),
  },

  // --- CONTINUOUS INTELLIGENCE ---
  {
    key: 'home-event-radar',
    title: 'Event Radar',
    description: 'Track real-time signals affecting your home',
    href: '/dashboard/home-event-radar',
    icon: resolveToolIcon('home', 'home-event-radar'),
    emoji: '📡',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/(properties\/[^/]+\/tools\/home-event-radar|home-event-radar)(\/|$)/.test(pathname),
  },
  {
    key: 'neighborhood-change-radar',
    title: 'Around Your Home',
    description: 'Review sourced planning, infrastructure, and local changes',
    href: '/dashboard/neighborhood-change-radar',
    icon: resolveToolIcon('home', 'neighborhood-change-radar'),
    emoji: '🏘️',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/neighborhood-change-radar(\/|$)/.test(pathname),
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
    key: 'home-risk-replay',
    title: 'Past Hazard Exposure',
    description: 'Review sourced historical hazards near this property',
    href: '/dashboard/home-risk-replay',
    icon: resolveToolIcon('home', 'home-risk-replay'),
    emoji: '⏪',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-risk-replay(\/|$)/.test(pathname),
  },
  {
    key: 'service-price-radar',
    title: 'Price Radar',
    description: 'Know if a quote is fair for your home',
    href: '/dashboard/service-price-radar',
    icon: resolveToolIcon('home', 'service-price-radar'),
    emoji: '🎯',
    group: 'monitoring',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/service-price-radar(\/|$)/.test(pathname),
  },

  // --- FUTURE READINESS ---
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
    key: 'ownership-costs',
    title: 'Ownership Costs',
    description: 'Current cost, changes, forecasts, and buffer planning',
    href: '/dashboard/ownership-costs',
    icon: resolveToolIcon('home', 'ownership-costs'),
    emoji: '📊',
    group: 'planning',
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/ownership-costs(\/|$)/.test(pathname),
  },
  {
    key: 'capital-timeline',
    title: 'Capital Timeline',
    description: 'Plan major home capital events',
    href: '/dashboard/capital-timeline',
    icon: resolveToolIcon('home', 'capital-timeline'),
    emoji: '📅',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(\/|$)/.test(pathname),
  },
  {
    key: 'home-habit-coach',
    title: 'Habit Coach',
    description: 'Tailored seasonal care routines',
    href: '/dashboard/home-habit-coach',
    icon: resolveToolIcon('home', 'home-habit-coach'),
    emoji: '🧠',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-habit-coach(\/|$)/.test(pathname),
  },
  {
    key: 'home-briefing',
    title: 'Home Briefing',
    description: 'Meaningful changes since your last review',
    href: '/dashboard/home-briefing',
    icon: resolveToolIcon('home', 'home-briefing'),
    emoji: '📰',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-briefing(\/|$)/.test(pathname),
  },
  {
    key: 'home-digital-will',
    title: 'Home Continuity Plan',
    description: 'Prepare selected home knowledge for a trusted recipient',
    href: '/dashboard/home-digital-will',
    icon: resolveToolIcon('home', 'home-digital-will'),
    emoji: '📜',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-will(\/|$)/.test(pathname),
  },
  {
    key: 'guidance-overview',
    title: 'Guidance Overview',
    description: 'Work through an active home decision step by step',
    href: '/dashboard/guidance-overview',
    icon: resolveToolIcon('home', 'guidance-overview'),
    emoji: '🧭',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/guidance-overview(\/|$)/.test(pathname),
  },
  {
    key: 'plant-advisor',
    title: 'Plant Advisor',
    description: 'Room-aware plant recommendations',
    href: '/dashboard/plant-advisor',
    icon: resolveToolIcon('home', 'plant-advisor'),
    emoji: '🌿',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/plant-advisor(\/|$)/.test(pathname),
  },
  {
    key: 'price-finalization',
    title: 'Price Finalizer',
    description: 'Lock accepted terms before booking',
    href: '/dashboard/price-finalization',
    icon: resolveToolIcon('home', 'price-finalization'),
    emoji: '🔒',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/price-finalization(\/|$)/.test(pathname),
  },
  {
    key: 'quote-comparison',
    title: 'Service Quote Decision',
    description: 'Review scope, compare proposals, and track your decision',
    href: '/dashboard/quote-comparison',
    icon: resolveToolIcon('home', 'quote-comparison'),
    emoji: '⚖️',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/quote-comparison(\/|$)/.test(pathname),
  },
  {
    key: 'oracle',
    title: 'Appliance Oracle',
    description: 'Lifespan and replacement intelligence',
    href: '/dashboard/oracle',
    icon: resolveToolIcon('ai', 'oracle'),
    emoji: '🔮',
    group: 'planning',
    isActive: (pathname) => /^\/dashboard\/oracle(\/|$)/.test(pathname),
  },
  {
    key: 'documents',
    title: 'Home Records',
    description: 'Organize property files as reviewable evidence',
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
    summary: 'High-impact decision support for your home',
  },
  {
    key: 'wealth',
    title: 'Wealth & Savings',
    summary: 'Financial optimization and equity growth',
  },
  {
    key: 'monitoring',
    title: 'Continuous Intelligence',
    summary: 'Real-time risk and condition monitoring',
  },
  {
    key: 'planning',
    title: 'Future Readiness',
    summary: 'Budgeting, upgrades, and long-term planning',
  },
];

export const MOBILE_HOME_AI_TILE_KEYS: MobileAiToolKey[] = [
  'replace-repair',
  'coverage-intelligence',
  'view-all',
];

export type MobileHomeToolGroupKey =
  | 'intelligence'
  | 'monitoring'
  | 'history'
  | 'negotiation'
  | 'ownership'
  | 'renovation'
  | 'timeline'
  | 'habits'
  | 'records';

export type MobilePropertyToolLink = {
  key: string;
  group: MobileHomeToolGroupKey;
  name: string;
  description: string;
  desktopDescription?: string;
  workflowOnly?: boolean;
  hrefSuffix: string;
  navTarget: string;
  icon: ElementType;
  isActive: (pathname: string) => boolean;
};

export const MOBILE_HOME_TOOL_GROUPS: Array<{
  key: MobileHomeToolGroupKey;
  title: string;
  summary: string;
}> = [
  {
    key: 'intelligence',
    title: 'Property Intelligence',
    summary: 'Understand meaningful changes, source context, verified history, and selective sharing',
  },
  {
    key: 'monitoring',
    title: 'Monitoring + Awareness',
    summary: 'Live events, signals, and a living model of your home',
  },
  {
    key: 'history',
    title: 'Property History',
    summary: 'Separate durable home history from external hazard context',
  },
  {
    key: 'negotiation',
    title: 'Negotiation + Review',
    summary: 'Quote and premium review with response-ready guidance',
  },
  {
    key: 'ownership',
    title: 'Ownership Strategy',
    summary: 'Tax, cost, coverage, and hold/sell/rent planning',
  },
  {
    key: 'renovation',
    title: 'Renovation Planning',
    summary: 'Understand permit, tax, and contractor requirements before starting a project.',
  },
  {
    key: 'timeline',
    title: 'Readiness + Timeline',
    summary: 'Capital planning, prep, and timeline execution',
  },
  {
    key: 'habits',
    title: 'Home Habits',
    summary: 'Seasonal care routines, safety checks, and maintenance habits',
  },
  {
    key: 'records',
    title: 'Property Records',
    summary: 'Materials, specs, and critical home knowledge',
  },
];

export const MOBILE_HOME_TOOL_LINKS: MobilePropertyToolLink[] = [
  {
    key: 'home-event-radar',
    group: 'monitoring',
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
    group: 'intelligence',
    name: 'Past Hazard Exposure',
    description: "Review sourced historical hazards near this property",
    desktopDescription: "See which reviewed historical hazard records matched the property while keeping proximity separate from confirmed damage.",
    hrefSuffix: 'tools/home-risk-replay?launchSurface=home_tools',
    navTarget: 'tool:home-risk-replay',
    icon: resolveToolIcon('home', 'home-risk-replay'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-risk-replay(\/|$)/.test(pathname),
  },
  {
    key: 'service-price-radar',
    group: 'negotiation',
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
    group: 'ownership',
    name: 'Property Tax Center',
    description: "Verify tax facts and next steps",
    desktopDescription: "Review a planning estimate, verify official property-tax facts, and prepare a jurisdiction-qualified next step.",
    hrefSuffix: 'tools/property-tax',
    navTarget: 'tool:property-tax',
    icon: resolveToolIcon('home', 'property-tax'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/property-tax(\/|$)/.test(pathname),
  },
  {
    key: 'ownership-costs',
    group: 'ownership',
    name: 'Ownership Costs',
    description: "Understand what this home costs",
    desktopDescription: "See current operating costs, evidence completeness, verified changes, planning scenarios, and buffer readiness.",
    hrefSuffix: 'ownership-costs',
    navTarget: 'ownership-costs',
    icon: resolveToolIcon('home', 'ownership-costs'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/ownership-costs(\/|$)/.test(pathname),
  },
  {
    key: 'negotiation-shield',
    group: 'negotiation',
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
    group: 'negotiation',
    name: 'Service Quote Decision',
    description: "Review scope, compare proposals, and decide",
    desktopDescription: "Upload or enter proposals, identify missing scope, ask questions, record your choice, and keep final terms and booking linked.",
    workflowOnly: true,
    hrefSuffix: 'tools/quote-comparison',
    navTarget: 'tool:quote-comparison',
    icon: resolveToolIcon('home', 'quote-comparison'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/quote-comparison(\/|$)/.test(pathname),
  },
  {
    key: 'price-finalization',
    group: 'negotiation',
    name: 'Price Finalization',
    description: "Capture accepted terms before booking",
    desktopDescription: "Lock accepted pricing and key terms so your booking flow starts with clear scope and cost.",
    hrefSuffix: 'tools/price-finalization',
    navTarget: 'tool:price-finalization',
    icon: resolveToolIcon('home', 'price-finalization'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/price-finalization(\/|$)/.test(pathname),
  },
  {
    key: 'sell-hold-rent',
    group: 'ownership',
    name: 'Sell / Hold / Rent',
    description: "Compare next-step scenarios",
    desktopDescription: "Compare sell, hold, and rent paths with projected returns, costs, and tradeoffs.",
    hrefSuffix: 'tools/sell-hold-rent',
    navTarget: 'tool:sell-hold-rent',
    icon: resolveToolIcon('home', 'sell-hold-rent'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/sell-hold-rent(\/|$)/.test(pathname),
  },
  {
    key: 'break-even',
    group: 'ownership',
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
    group: 'timeline',
    name: 'Home Capital Timeline',
    description: "Plan major capital events",
    desktopDescription: "Plan major capital events, from replacements to upgrades, on a long-range timeline.",
    hrefSuffix: 'tools/capital-timeline',
    navTarget: 'tool:capital-timeline',
    icon: resolveToolIcon('home', 'capital-timeline'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(\/|$)/.test(pathname),
  },
  {
    key: 'reserve-fund',
    group: 'timeline',
    name: 'Reserve Fund Planner',
    description: "Save for upcoming capital costs",
    desktopDescription: "Turn your Capital Timeline into a monthly savings target, so you're never caught short.",
    hrefSuffix: 'tools/reserve-fund',
    navTarget: 'tool:reserve-fund',
    icon: resolveToolIcon('home', 'reserve-fund'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/reserve-fund(\/|$)/.test(pathname),
  },
  {
    key: 'seller-prep',
    group: 'timeline',
    name: 'Sale Readiness & Handoff',
    description: "Prepare verified work and selected records for sale",
    desktopDescription: "Advance one sale case through verified readiness milestones and an expressly selected property handoff.",
    hrefSuffix: 'seller-prep',
    navTarget: 'seller-prep',
    icon: resolveToolIcon('home', 'seller-prep'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/seller-prep(\/|$)/.test(pathname),
  },
  {
    key: 'home-timeline',
    group: 'intelligence',
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
    group: 'timeline',
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
    group: 'records',
    name: 'Home Continuity Plan',
    description: "Prepare selected home knowledge for a trusted recipient",
    desktopDescription: "Assemble a scoped home-information handoff and verify recipient access before relying on it.",
    hrefSuffix: 'tools/home-digital-will',
    navTarget: 'tool:home-digital-will',
    icon: resolveToolIcon('home', 'home-digital-will'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-will(\/|$)/.test(pathname),
  },
  {
    key: 'property-brief',
    group: 'intelligence',
    name: 'Property Brief',
    description: "Prepare a selective evidence-backed property summary",
    desktopDescription: "Create a purpose-specific brief from selected verified facts, history, evidence, and explicit unknowns.",
    hrefSuffix: 'property-brief',
    navTarget: 'property-brief',
    icon: resolveToolIcon('home', 'property-brief'),
    isActive: (pathname) => /^\/dashboard\/properties\/[^/]+\/property-brief(\/|$)/.test(pathname),
  },
  {
    key: 'savings-benefits',
    group: 'ownership',
    name: 'Savings and Benefits',
    description: "Find rebates, credits, and recurring savings for this home",
    desktopDescription: "Identify likely rebates, credits, grants, and recurring-cost savings tied to your property and systems.",
    hrefSuffix: 'tools/savings-benefits',
    navTarget: 'tool:savings-benefits',
    icon: resolveToolIcon('home', 'savings-benefits'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/(?:savings-benefits|hidden-asset-finder|home-savings)(\/|$)/.test(pathname),
  },
  {
    key: 'home-digital-twin',
    group: 'monitoring',
    name: 'Home Upgrade Planner',
    description: "See what we know about your home's systems, then compare the cost, timing, and savings of a repair or upgrade",
    desktopDescription: "Review what we know about your home's systems, then compare the cost, timing, savings, and risk trade-offs of a specific repair or upgrade decision.",
    hrefSuffix: 'tools/home-digital-twin',
    navTarget: 'tool:home-digital-twin',
    icon: resolveToolIcon('home', 'home-digital-twin'),
    workflowOnly: true,
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-twin(\/|$)/.test(pathname),
  },
  {
    key: 'neighborhood-change-radar',
    group: 'intelligence',
    name: 'Around Your Home',
    description: "Review sourced planning, infrastructure, land-use, and other local changes.",
    desktopDescription: "Review factual local changes and their lifecycle while keeping possible relevance separate from unsupported value predictions.",
    hrefSuffix: 'tools/neighborhood-change-radar',
    navTarget: 'tool:neighborhood-change-radar',
    icon: resolveToolIcon('home', 'neighborhood-change-radar'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/neighborhood-change-radar(\/|$)/.test(pathname),
  },
  {
    key: 'home-habit-coach',
    group: 'habits',
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
    group: 'habits',
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
    group: 'renovation',
    name: 'Renovations',
    description: "Plan and advance one renovation journey",
    desktopDescription: "Explore, scope, approve, execute, and close out renovations with specialist records kept together.",
    hrefSuffix: 'renovations',
    navTarget: 'tool:home-renovation-risk-advisor',
    icon: resolveToolIcon('home', 'home-renovation-risk-advisor'),
    isActive: (pathname) => /^\/dashboard\/(properties\/[^/]+\/renovations|home-renovation-risk-advisor)(\/|$)/.test(pathname),
  },
  {
    key: 'mortgage-refinance-radar',
    group: 'ownership',
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
    key: 'financing',
    group: 'ownership',
    name: 'Financing Center',
    description: 'Equity position and payment options for home projects',
    desktopDescription: 'See your live equity position and compare HELOC, loan, and cash options for any home project.',
    hrefSuffix: 'tools/financing',
    navTarget: 'tool:financing',
    icon: resolveToolIcon('home', 'financing'),
    isActive: (pathname) =>
      /^\/dashboard\/(properties\/[^/]+\/tools\/financing|financing)(\/|$)/.test(pathname),
  },
  {
    key: 'home-briefing',
    group: 'intelligence',
    name: 'Home Briefing',
    description: "See what changed in your home records and what to review next.",
    desktopDescription: "See clear updates from your home records, why they matter, and where to review the details.",
    hrefSuffix: 'tools/home-briefing',
    navTarget: 'tool:home-briefing',
    icon: resolveToolIcon('home', 'home-briefing'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/home-briefing(\/|$)/.test(pathname),
  },
  {
    key: 'guidance-overview',
    group: 'monitoring',
    name: 'Guidance Overview',
    description: "Review active guidance signals and your next recommended steps",
    desktopDescription: "See all active guidance signals across your property and track recommended resolution steps.",
    hrefSuffix: 'tools/guidance-overview',
    navTarget: 'tool:guidance-overview',
    icon: resolveToolIcon('home', 'guidance-overview'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/tools\/guidance-overview(\/|$)/.test(pathname),
  },
  {
    key: 'material-specs',
    group: 'records',
    name: 'Material Specs',
    description: "Track finishes, colors & products used across your home",
    desktopDescription: "A searchable registry of every paint color, tile, flooring, and material used in your home — with supplier details and export to PDF.",
    hrefSuffix: 'materials',
    navTarget: 'tool:material-specs',
    icon: Layers,
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/materials(\/|$)/.test(pathname),
  },
  {
    key: 'diy',
    group: 'renovation',
    name: 'DIY Project Center',
    description: 'Step-by-step guides for projects you can do yourself',
    desktopDescription: 'Skill-matched DIY guides with step-by-step instructions, materials lists, and cost estimates — with a clear hire-or-DIY verdict before you start.',
    hrefSuffix: 'tools/diy',
    navTarget: 'tool:diy',
    icon: resolveToolIcon('home', 'diy'),
    isActive: (pathname) =>
      /^\/dashboard\/(properties\/[^/]+\/tools\/diy|diy)(\/|$)/.test(pathname),
  },
  {
    key: 'permits',
    group: 'renovation',
    name: 'Permit Tracker',
    description: 'Permit history, inspection readiness checks, and disclosure export',
    desktopDescription: 'Pull permit records from municipal open data, track active inspection milestones, run an AI photo-based readiness check before you call for an inspection, detect potential unpermitted work, and generate a disclosure PDF for resale.',
    hrefSuffix: 'tools/permits',
    navTarget: 'tool:permits',
    icon: resolveToolIcon('home', 'permits'),
    isActive: (pathname) =>
      /^\/dashboard\/(properties\/[^/]+\/tools\/permits|permits)(\/|$)/.test(pathname),
  },
  {
    key: 'hoa-compliance',
    group: 'renovation',
    name: 'HOA Compliance',
    description: 'Track HOA approvals and violations before they turn into fines',
    desktopDescription: 'Track your HOA/association details and dues, submit and track architectural-review approvals for renovations, and log violation notices so they surface as guided next steps.',
    hrefSuffix: 'tools/hoa',
    navTarget: 'tool:hoa-compliance',
    icon: resolveToolIcon('home', 'hoa-compliance'),
    isActive: (pathname) =>
      /^\/dashboard\/(properties\/[^/]+\/tools\/hoa|hoa)(\/|$)/.test(pathname),
  },
  {
    key: 'inspection-hub',
    group: 'renovation',
    name: 'Inspection Hub',
    description: 'Upload inspection reports and track open findings',
    desktopDescription: 'Upload inspection PDFs and let AI extract every finding into structured, trackable records — with write-back to your Digital Twin, Permit Tracker, and Coverage Intelligence.',
    hrefSuffix: 'inspection-hub',
    navTarget: 'tool:inspection-hub',
    icon: resolveToolIcon('home', 'inspection-hub'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/inspection-hub(\/|$)/.test(pathname),
  },
  {
    key: 'project-tracker',
    group: 'renovation',
    name: 'Project Tracker',
    description: 'Track contractor projects from contract to completion',
    desktopDescription: 'Manage every active renovation or repair project — milestone timeline, payment gating, change order log, progress photos, and issue tracking — with completion write-back to your home record.',
    hrefSuffix: 'projects',
    navTarget: 'tool:project-tracker',
    icon: resolveToolIcon('home', 'project-tracker'),
    isActive: (pathname) =>
      /^\/dashboard\/properties\/[^/]+\/projects(\/|$)/.test(pathname),
  },
];
