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
};

const NAV_TARGET_SUFFIXES: Record<string, string> = {
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
