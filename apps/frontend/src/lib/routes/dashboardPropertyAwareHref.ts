type RouteResolver = {
  navTarget: string;
  toPropertyHref: (encodedPropertyId: string, query: URLSearchParams) => string;
};

type QueryReader = {
  get: (name: string) => string | null;
};

function buildHref(pathname: string, query: URLSearchParams): string {
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

function splitHref(href: string): { pathname: string; query: URLSearchParams } {
  const hashIndex = href.indexOf('#');
  const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = hrefWithoutHash.indexOf('?');
  if (queryIndex < 0) {
    return { pathname: hrefWithoutHash, query: new URLSearchParams() };
  }

  return {
    pathname: hrefWithoutHash.slice(0, queryIndex),
    query: new URLSearchParams(hrefWithoutHash.slice(queryIndex + 1)),
  };
}

function sanitizeQuery(query: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(query);
  next.delete('propertyId');
  return next;
}

function getItemId(query?: QueryReader | null): string | null {
  if (!query) return null;
  return query.get('itemId') ?? query.get('inventoryItemId');
}

const DASHBOARD_ROUTE_RESOLVERS: Record<string, RouteResolver> = {
  '/dashboard/health-score': {
    navTarget: 'health-score',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/health-score`, query),
  },
  '/dashboard/fix': {
    navTarget: 'fix',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/fix`, query),
  },
  '/dashboard/save': {
    navTarget: 'save',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/save`, query),
  },
  '/dashboard/vault': {
    navTarget: 'vault',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/vault`, query),
  },
  '/dashboard/coverage-intelligence': {
    navTarget: 'coverage-intelligence',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/coverage-intelligence`, query),
  },
  '/dashboard/risk-premium-optimizer': {
    navTarget: 'risk-premium-optimizer',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`, query),
  },
  '/dashboard/do-nothing-simulator': {
    navTarget: 'do-nothing',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/do-nothing`, query),
  },
  '/dashboard/home-savings': {
    navTarget: 'home-savings',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-savings`, query),
  },
  '/dashboard/home-event-radar': {
    navTarget: 'home-event-radar',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-event-radar`, query),
  },
  '/dashboard/home-renovation-risk-advisor': {
    navTarget: 'home-renovation-risk-advisor',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-renovation-risk-advisor`, query),
  },
  '/dashboard/replace-repair': {
    navTarget: 'replace-repair',
    toPropertyHref: (propertyId, query) => {
      const nextQuery = new URLSearchParams(query);
      const itemId = getItemId(nextQuery);

      if (itemId) {
        nextQuery.delete('itemId');
        nextQuery.delete('inventoryItemId');
        return buildHref(
          `/dashboard/properties/${propertyId}/inventory/items/${encodeURIComponent(itemId)}/replace-repair`,
          nextQuery,
        );
      }

      nextQuery.set('intent', 'replace-repair');
      return buildHref(`/dashboard/properties/${propertyId}/inventory`, nextQuery);
    },
  },
  '/dashboard/inventory': {
    navTarget: 'inventory',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/inventory`, query),
  },
  '/dashboard/risk-radar': {
    navTarget: 'risk-radar',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/risk-assessment`, query),
  },
  '/dashboard/inspection-report': {
    navTarget: 'inspection-report',
    toPropertyHref: (propertyId, query) => {
      const nextQuery = new URLSearchParams(query);
      nextQuery.set('report', 'inspection');
      return buildHref(`/dashboard/properties/${propertyId}/reports`, nextQuery);
    },
  },
  '/dashboard/property-tax': {
    navTarget: 'property-tax',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/property-tax`, query),
  },
  '/dashboard/insurance-trend': {
    navTarget: 'insurance-trend',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/insurance-trend`, query),
  },
  '/dashboard/cost-growth': {
    navTarget: 'cost-growth',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/cost-growth`, query),
  },
  '/dashboard/sell-hold-rent': {
    navTarget: 'sell-hold-rent',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/sell-hold-rent`, query),
  },
  '/dashboard/true-cost': {
    navTarget: 'true-cost',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/true-cost`, query),
  },
  '/dashboard/cost-explainer': {
    navTarget: 'cost-explainer',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/cost-explainer`, query),
  },
  '/dashboard/mortgage-refinance-radar': {
    navTarget: 'mortgage-refinance-radar',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`, query),
  },
  '/dashboard/neighborhood-change-radar': {
    navTarget: 'neighborhood-change-radar',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`, query),
  },
  '/dashboard/home-digital-twin': {
    navTarget: 'home-digital-twin',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-digital-twin`, query),
  },
  '/dashboard/hidden-asset-finder': {
    navTarget: 'hidden-asset-finder',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/hidden-asset-finder`, query),
  },
  '/dashboard/home-habit-coach': {
    navTarget: 'home-habit-coach',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-habit-coach`, query),
  },
  '/dashboard/break-even': {
    navTarget: 'break-even',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/break-even`, query),
  },
  '/dashboard/capital-timeline': {
    navTarget: 'capital-timeline',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/capital-timeline`, query),
  },
  '/dashboard/cost-volatility': {
    navTarget: 'cost-volatility',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/cost-volatility`, query),
  },
  '/dashboard/plant-advisor': {
    navTarget: 'plant-advisor',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/plant-advisor`, query),
  },
  '/dashboard/home-gazette': {
    navTarget: 'home-gazette',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-gazette`, query),
  },
  '/dashboard/home-digital-will': {
    navTarget: 'home-digital-will',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/home-digital-will`, query),
  },
  '/dashboard/price-finalization': {
    navTarget: 'price-finalization',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/price-finalization`, query),
  },
  '/dashboard/quote-comparison': {
    navTarget: 'quote-comparison',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/quote-comparison`, query),
  },
  '/dashboard/negotiation-shield': {
    navTarget: 'negotiation-shield',
    toPropertyHref: (propertyId, query) =>
      buildHref(`/dashboard/properties/${propertyId}/tools/negotiation-shield`, query),
  },
};

const NAV_TARGET_SUFFIXES: Record<string, string> = {
  'health-score': 'health-score',
  fix: 'fix',
  save: 'save',
  vault: 'vault',
  'coverage-intelligence': 'tools/coverage-intelligence',
  'risk-premium-optimizer': 'tools/risk-premium-optimizer',
  'do-nothing': 'tools/do-nothing',
  'home-savings': 'tools/home-savings',
  'home-event-radar': 'tools/home-event-radar',
  'home-renovation-risk-advisor': 'tools/home-renovation-risk-advisor',
  'replace-repair': 'inventory?intent=replace-repair',
  inventory: 'inventory',
  'risk-radar': 'risk-assessment',
  'inspection-report': 'reports?report=inspection',
  'property-tax': 'tools/property-tax',
  'insurance-trend': 'tools/insurance-trend',
  'cost-growth': 'tools/cost-growth',
  'sell-hold-rent': 'tools/sell-hold-rent',
  'true-cost': 'tools/true-cost',
  'cost-explainer': 'tools/cost-explainer',
  'mortgage-refinance-radar': 'tools/mortgage-refinance-radar',
  'neighborhood-change-radar': 'tools/neighborhood-change-radar',
  'home-digital-twin': 'tools/home-digital-twin',
  'hidden-asset-finder': 'tools/hidden-asset-finder',
  'home-habit-coach': 'tools/home-habit-coach',
  'break-even': 'tools/break-even',
  'capital-timeline': 'tools/capital-timeline',
  'cost-volatility': 'tools/cost-volatility',
  'plant-advisor': 'tools/plant-advisor',
  'home-gazette': 'tools/home-gazette',
  'home-digital-will': 'tools/home-digital-will',
  'price-finalization': 'tools/price-finalization',
  'quote-comparison': 'tools/quote-comparison',
  'negotiation-shield': 'tools/negotiation-shield',
};

export function buildPropertyAwareDashboardHref(
  propertyId: string | undefined | null,
  dashboardHref: string,
): string {
  const { pathname, query } = splitHref(dashboardHref);
  const resolver = DASHBOARD_ROUTE_RESOLVERS[pathname];
  const sanitizedQuery = sanitizeQuery(query);

  if (propertyId) {
    const encodedPropertyId = encodeURIComponent(propertyId);
    if (resolver) {
      return resolver.toPropertyHref(encodedPropertyId, sanitizedQuery);
    }
    const nextQuery = new URLSearchParams(sanitizedQuery);
    nextQuery.set('propertyId', propertyId);
    return buildHref(pathname, nextQuery);
  }

  if (resolver) {
    const nextQuery = new URLSearchParams(sanitizedQuery);
    nextQuery.set('navTarget', resolver.navTarget);
    return buildHref('/dashboard/properties', nextQuery);
  }

  return dashboardHref;
}

export function resolvePropertyHrefFromNavTarget(
  propertyId: string,
  navTarget: string,
  query?: QueryReader | null,
): string | undefined {
  const encodedPropertyId = encodeURIComponent(propertyId);
  if (navTarget === 'replace-repair') {
    const itemId = getItemId(query);
    if (itemId) {
      return `/dashboard/properties/${encodedPropertyId}/inventory/items/${encodeURIComponent(itemId)}/replace-repair`;
    }
  }

  const directSuffix = NAV_TARGET_SUFFIXES[navTarget];
  if (directSuffix) {
    return `/dashboard/properties/${encodedPropertyId}/${directSuffix}`;
  }

  if (navTarget.startsWith('tool:')) {
    const toolSlug = navTarget.slice('tool:'.length);
    return `/dashboard/properties/${encodedPropertyId}/tools/${encodeURIComponent(toolSlug)}`;
  }

  return undefined;
}
