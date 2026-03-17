import type { CanonicalIconToken } from './featureIconMap';

type ToolIconDefinition = {
  concept: string;
  icon: CanonicalIconToken;
  category: 'ai' | 'home' | 'insight';
};

export const TOOL_ICON_MAP = {
  ai: {
    'replace-repair': { concept: 'maintenance', icon: 'wrench', category: 'ai' },
    'coverage-intelligence': { concept: 'coverage', icon: 'shield-check', category: 'ai' },
    'risk-premium-optimizer': { concept: 'risk', icon: 'shield-alert', category: 'ai' },
    'do-nothing-simulator': { concept: 'risk', icon: 'shield-alert', category: 'ai' },
    'home-savings': { concept: 'expenses', icon: 'dollar-sign', category: 'ai' },
    climate: { concept: 'weather', icon: 'cloud', category: 'ai' },
    energy: { concept: 'appliances', icon: 'zap', category: 'ai' },
    'visual-inspector': { concept: 'review', icon: 'eye', category: 'ai' },
    appreciation: { concept: 'expenses', icon: 'dollar-sign', category: 'ai' },
    budget: { concept: 'expenses', icon: 'dollar-sign', category: 'ai' },
    'tax-appeal': { concept: 'taxes', icon: 'landmark', category: 'ai' },
    modifications: { concept: 'property', icon: 'building-2', category: 'ai' },
    oracle: { concept: 'appliances', icon: 'zap', category: 'ai' },
    documents: { concept: 'documents', icon: 'file-text', category: 'ai' },
    emergency: { concept: 'alerts', icon: 'alert-triangle', category: 'ai' },
    'view-all': { concept: 'ai-tools', icon: 'sparkles', category: 'ai' },
  },
  home: {
    'home-risk-replay': { concept: 'weather', icon: 'cloud', category: 'home' },
    'property-tax': { concept: 'taxes', icon: 'landmark', category: 'home' },
    'cost-growth': { concept: 'expenses', icon: 'dollar-sign', category: 'home' },
    'insurance-trend': { concept: 'insurance', icon: 'shield', category: 'home' },
    'service-price-radar': { concept: 'expenses', icon: 'dollar-sign', category: 'home' },
    'negotiation-shield': { concept: 'coverage', icon: 'shield-check', category: 'home' },
    'cost-explainer': { concept: 'recommendations', icon: 'lightbulb', category: 'home' },
    'true-cost': { concept: 'expenses', icon: 'dollar-sign', category: 'home' },
    'sell-hold-rent': { concept: 'recommendations', icon: 'lightbulb', category: 'home' },
    'cost-volatility': { concept: 'risk', icon: 'shield-alert', category: 'home' },
    'break-even': { concept: 'recommendations', icon: 'lightbulb', category: 'home' },
    'capital-timeline': { concept: 'calendar', icon: 'calendar', category: 'home' },
    'seller-prep': { concept: 'tasks', icon: 'list-checks', category: 'home' },
    'home-timeline': { concept: 'calendar', icon: 'calendar', category: 'home' },
    'status-board': { concept: 'status-board', icon: 'layout-grid', category: 'home' },
    'hidden-asset-finder': { concept: 'recommendations', icon: 'sparkles', category: 'home' },
    'home-digital-twin': { concept: 'property', icon: 'building-2', category: 'home' },
    'home-gazette': { concept: 'documents', icon: 'file-text', category: 'home' },
  },
  insights: {
    'daily-snapshot': { concept: 'calendar', icon: 'calendar-days', category: 'insight' },
    'risk-radar': { concept: 'risk', icon: 'shield-alert', category: 'insight' },
  },
} as const satisfies Record<string, Record<string, ToolIconDefinition>>;

export type ToolIconMap = typeof TOOL_ICON_MAP;
