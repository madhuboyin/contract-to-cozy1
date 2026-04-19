type RouteResolver = {
  navTarget: string;
  toPropertyHref: (encodedPropertyId: string) => string;
};

const DASHBOARD_ROUTE_RESOLVERS: Record<string, RouteResolver> = {
  '/dashboard/coverage-intelligence': {
    navTarget: 'coverage-intelligence',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,
  },
  '/dashboard/risk-premium-optimizer': {
    navTarget: 'risk-premium-optimizer',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`,
  },
  '/dashboard/do-nothing-simulator': {
    navTarget: 'do-nothing',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/tools/do-nothing`,
  },
  '/dashboard/home-savings': {
    navTarget: 'home-savings',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/tools/home-savings`,
  },
  '/dashboard/home-event-radar': {
    navTarget: 'home-event-radar',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/tools/home-event-radar`,
  },
  '/dashboard/home-renovation-risk-advisor': {
    navTarget: 'home-renovation-risk-advisor',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/tools/home-renovation-risk-advisor`,
  },
  '/dashboard/replace-repair': {
    navTarget: 'replace-repair',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/inventory?intent=replace-repair`,
  },
  '/dashboard/inventory': {
    navTarget: 'inventory',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/inventory`,
  },
  '/dashboard/risk-radar': {
    navTarget: 'risk-radar',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/risk-assessment`,
  },
  '/dashboard/inspection-report': {
    navTarget: 'inspection-report',
    toPropertyHref: (propertyId) => `/dashboard/properties/${propertyId}/reports?report=inspection`,
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

function appendPropertyIdQuery(href: string, propertyId: string): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}propertyId=${encodeURIComponent(propertyId)}`;
}

export function buildPropertyAwareDashboardHref(
  propertyId: string | undefined | null,
  dashboardHref: string,
): string {
  const resolver = DASHBOARD_ROUTE_RESOLVERS[dashboardHref];

  if (propertyId) {
    const encodedPropertyId = encodeURIComponent(propertyId);
    if (resolver) {
      return resolver.toPropertyHref(encodedPropertyId);
    }
    return appendPropertyIdQuery(dashboardHref, propertyId);
  }

  if (resolver) {
    return `/dashboard/properties?navTarget=${encodeURIComponent(resolver.navTarget)}`;
  }

  return dashboardHref;
}

export function resolvePropertyHrefFromNavTarget(
  propertyId: string,
  navTarget: string,
): string | undefined {
  const encodedPropertyId = encodeURIComponent(propertyId);
  const directSuffix = NAV_TARGET_SUFFIXES[navTarget];
  if (directSuffix) {
    return `/dashboard/properties/${encodedPropertyId}/${directSuffix}`;
  }

  if (navTarget.startsWith('tool:')) {
    const toolSlug = navTarget.slice('tool:'.length);
    return `/dashboard/properties/${encodedPropertyId}/tools/${toolSlug}`;
  }

  return undefined;
}
