import type { PageContextId } from './contextToolMappings';

export type ResolvePageContextInput = {
  pathname?: string;
  explicitContext?: PageContextId | null;
};

const ROUTE_CONTEXT_PATTERNS: Array<{ context: PageContextId; pattern: RegExp }> = [
  { context: 'service-price-radar', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/service-price-radar(?:\/|$)/ },
  { context: 'negotiation-shield', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/negotiation-shield(?:\/|$)/ },
  { context: 'property-tax', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/property-tax(?:\/|$)/ },
  { context: 'cost-growth', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/cost-growth(?:\/|$)/ },
  { context: 'cost-explainer', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/cost-explainer(?:\/|$)/ },
  { context: 'true-cost', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/true-cost(?:\/|$)/ },
  { context: 'sell-hold-rent', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/sell-hold-rent(?:\/|$)/ },
  { context: 'break-even', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/break-even(?:\/|$)/ },
  { context: 'cost-volatility', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/cost-volatility(?:\/|$)/ },
  { context: 'capital-timeline', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline(?:\/|$)/ },
  { context: 'insurance-trend', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/insurance-trend(?:\/|$)/ },
  { context: 'home-risk-replay', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/home-risk-replay(?:\/|$)/ },
  { context: 'home-digital-will', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-will(?:\/|$)/ },
  { context: 'hidden-asset-finder', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/hidden-asset-finder(?:\/|$)/ },
  { context: 'home-digital-twin', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/home-digital-twin(?:\/|$)/ },
  { context: 'home-gazette', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/home-gazette(?:\/|$)/ },
  { context: 'home-habit-coach', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/home-habit-coach(?:\/|$)/ },
  { context: 'home-renovation-risk-advisor', pattern: /^\/dashboard\/(?:properties\/[^/]+\/tools\/home-renovation-risk-advisor|home-renovation-risk-advisor)(?:\/|$)/ },
  { context: 'mortgage-refinance-radar', pattern: /^\/dashboard\/properties\/[^/]+\/tools\/mortgage-refinance-radar(?:\/|$)/ },
  { context: 'home-event-radar', pattern: /^\/dashboard\/(?:home-event-radar|properties\/[^/]+\/tools\/home-event-radar)(?:\/|$)/ },
  { context: 'status-board', pattern: /^\/dashboard\/properties\/[^/]+\/status-board(?:\/|$)/ },
  { context: 'seller-prep', pattern: /^\/dashboard\/properties\/[^/]+\/seller-prep(?:\/|$)/ },
  { context: 'home-timeline', pattern: /^\/dashboard\/properties\/[^/]+\/timeline(?:\/|$)/ },
  { context: 'room-detail', pattern: /^\/dashboard\/properties\/[^/]+\/(?:inventory\/)?rooms\/[^/]+(?:\/|$)/ },
  { context: 'rooms', pattern: /^\/dashboard\/properties\/[^/]+\/(?:inventory\/)?rooms(?:\/|$)/ },
  { context: 'claims', pattern: /^\/dashboard\/properties\/[^/]+\/claims(?:\/|$)/ },
  { context: 'find-services', pattern: /^\/dashboard\/providers(?:\/|$)/ },
  { context: 'maintenance', pattern: /^\/dashboard\/maintenance(?:\/|$)/ },
  { context: 'insurance', pattern: /^\/dashboard\/insurance(?:\/|$)/ },
  { context: 'property-hub', pattern: /^\/dashboard\/properties\/[^/]+$/ },
  { context: 'dashboard', pattern: /^\/dashboard$/ },
];

function normalizePathname(pathname?: string): string | null {
  if (!pathname) return null;
  const withoutQuery = pathname.split('?')[0] ?? pathname;
  const normalized = withoutQuery.replace(/\/+$/, '');
  return normalized || '/';
}

export function resolvePageContext({
  pathname,
  explicitContext,
}: ResolvePageContextInput): PageContextId | null {
  if (explicitContext) return explicitContext;

  const normalizedPathname = normalizePathname(pathname);
  if (!normalizedPathname) return null;

  for (const route of ROUTE_CONTEXT_PATTERNS) {
    if (route.pattern.test(normalizedPathname)) {
      return route.context;
    }
  }

  return null;
}
