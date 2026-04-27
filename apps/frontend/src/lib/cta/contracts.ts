/**
 * CTA Contract System
 * 
 * Ensures every CTA promise is fulfilled by its destination page.
 * Provides compile-time and runtime validation for CTA navigation.
 */

export type CTAPriority = 'critical' | 'high' | 'medium' | 'low';

export type CTAMetricType = 
  | 'count'
  | 'amount'
  | 'percentage'
  | 'score'
  | 'delta'
  | 'range';

export interface CTAMetric {
  type: CTAMetricType;
  value: number | string;
  unit?: string;
  label: string;
}

export interface CTAPromise {
  /** What the CTA visually promises to the user */
  action: string;
  
  /** Specific metrics shown (e.g., "3 gaps", "$12,450") */
  metrics?: CTAMetric[];
  
  /** Context that should be preserved */
  context?: Record<string, any>;
  
  /** Priority level for validation */
  priority: CTAPriority;
}

export interface CTADestination {
  /** Route path */
  route: string;
  
  /** URL parameters */
  params: Record<string, string>;
  
  /** Features the destination page must support */
  requiredFeatures: string[];
  
  /** Optional features that enhance the experience */
  optionalFeatures?: string[];
}

export interface CTAContract {
  /** Unique identifier for this CTA */
  id: string;
  
  /** Component/file where CTA is defined */
  source: string;
  
  /** What the CTA promises */
  promise: CTAPromise;
  
  /** Where the CTA navigates */
  destination: CTADestination;
  
  /** Timestamp when contract was created */
  createdAt?: Date;
}

export interface PageContract {
  /** Route path this contract applies to */
  route: string;
  
  /** Features this page supports */
  features: string[];
  
  /** URL parameters this page accepts */
  params: string[];
  
  /** Metrics this page can display/validate */
  metrics: CTAMetricType[];
  
  /** Optional description */
  description?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  severity: 'error';
  code: string;
  message: string;
  ctaId: string;
  source: string;
}

export interface ValidationWarning {
  severity: 'warning';
  code: string;
  message: string;
  ctaId: string;
  source: string;
}

/**
 * Registry of all page contracts
 */
export const PAGE_CONTRACTS: Record<string, PageContract> = {
  '/dashboard/properties/:id/fix': {
    route: '/dashboard/properties/:id/fix',
    features: [
      'filter-urgent',
      'filter-maintenance',
      'sort-priority',
      'expected-count-validation',
      'highlight-items',
      'decision-engine',
      'provider-search',
      'booking-management',
    ],
    params: ['filter', 'sort', 'priority', 'expectedCount', 'focus', 'highlight'],
    metrics: ['count'],
    description: 'Resolution hub with decision engine, provider search, and booking management',
  },
  
  '/dashboard/resolution-center': {
    route: '/dashboard/resolution-center',
    features: ['redirect-to-fix'],
    params: ['propertyId'],
    metrics: [],
    description: 'DEPRECATED: Redirects to /dashboard/properties/:id/fix',
  },
  
  '/dashboard/properties/:id/health-score': {
    route: '/dashboard/properties/:id/health-score',
    features: [
      'view-trends',
      'maintenance-breakdown',
      'weekly-change-chart',
      'score-history',
    ],
    params: ['view', 'focus', 'highlight'],
    metrics: ['score', 'count', 'delta'],
    description: 'Property health score with trends and breakdown',
  },
  
  '/dashboard/properties/:id/risk-assessment': {
    route: '/dashboard/properties/:id/risk-assessment',
    features: [
      'focus-exposure',
      'view-trends',
      'gap-breakdown',
      'coverage-analysis',
      'amount-validation',
    ],
    params: ['focus', 'amount', 'view'],
    metrics: ['amount', 'percentage', 'delta'],
    description: 'Risk assessment with exposure details',
  },
  
  '/dashboard/properties/:id/financial-efficiency': {
    route: '/dashboard/properties/:id/financial-efficiency',
    features: [
      'focus-breakdown',
      'view-trends',
      'cost-breakdown',
      'expected-cost-validation',
    ],
    params: ['focus', 'expectedCost', 'view'],
    metrics: ['amount', 'delta'],
    description: 'Financial efficiency with cost breakdown',
  },
  
  '/dashboard/properties/:id/tools/home-savings': {
    route: '/dashboard/properties/:id/tools/home-savings',
    features: [
      'expected-amount-validation',
      'highlight-opportunities',
      'category-breakdown',
    ],
    params: ['expectedMonthly', 'expectedAnnual', 'highlight', 'action'],
    metrics: ['amount'],
    description: 'Home savings tool with opportunity breakdown',
  },
  
  '/dashboard/properties/:id/tools/coverage-analysis': {
    route: '/dashboard/properties/:id/tools/coverage-analysis',
    features: [
      'filter-gaps',
      'highlight-items',
      'expected-count-validation',
    ],
    params: ['filter', 'highlight', 'expectedCount', 'source'],
    metrics: ['count', 'amount'],
    description: 'Coverage analysis with gap filtering',
  },
  
  '/dashboard/properties/:id/inventory': {
    route: '/dashboard/properties/:id/inventory',
    features: [
      'action-add-item',
      'action-scan-room',
      'filter-missing-age',
      'filter-missing-warranty',
      'highlight-fields',
    ],
    params: ['action', 'filter', 'highlight', 'category', 'source', 'context', 'mode'],
    metrics: ['count'],
    description: 'Inventory management with actions and filters',
  },
  
  '/dashboard/properties/:id/vault': {
    route: '/dashboard/properties/:id/vault',
    features: [
      'action-upload',
      'view-missing',
      'action-organize',
      'category-filter',
    ],
    params: ['action', 'category', 'type', 'view', 'source'],
    metrics: ['count'],
    description: 'Document vault with upload and organization',
  },
  
  '/dashboard/warranties': {
    route: '/dashboard/warranties',
    features: [
      'action-add-warranty',
      'property-filter',
    ],
    params: ['propertyId', 'action'],
    metrics: ['count'],
    description: 'Warranty management',
  },
  
  '/dashboard/maintenance': {
    route: '/dashboard/maintenance',
    features: [
      'action-schedule',
      'property-filter',
    ],
    params: ['propertyId', 'action', 'source'],
    metrics: ['count'],
    description: 'Maintenance scheduling',
  },
  
  '/dashboard/properties/:id/rooms': {
    route: '/dashboard/properties/:id/rooms',
    features: [
      'action-add-room',
    ],
    params: ['action', 'source'],
    metrics: ['count'],
    description: 'Room management',
  },
  
  '/dashboard/properties/:id/protect': {
    route: '/dashboard/properties/:id/protect',
    features: [
      'focus-renewals',
    ],
    params: ['focus'],
    metrics: ['count'],
    description: 'Protection overview with renewals',
  },
};

/**
 * Validate a CTA contract against its destination page contract
 */
export function validateCTAContract(cta: CTAContract): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Extract route pattern from destination
  const routePattern = extractRoutePattern(cta.destination.route);
  const pageContract = PAGE_CONTRACTS[routePattern];
  
  if (!pageContract) {
    errors.push({
      severity: 'error',
      code: 'MISSING_PAGE_CONTRACT',
      message: `No page contract found for route: ${routePattern}`,
      ctaId: cta.id,
      source: cta.source,
    });
    return { valid: false, errors, warnings };
  }
  
  // Validate required features
  for (const feature of cta.destination.requiredFeatures) {
    if (!pageContract.features.includes(feature)) {
      errors.push({
        severity: 'error',
        code: 'MISSING_FEATURE',
        message: `Page ${routePattern} does not support required feature: ${feature}`,
        ctaId: cta.id,
        source: cta.source,
      });
    }
  }
  
  // Validate parameters
  for (const param of Object.keys(cta.destination.params)) {
    if (!pageContract.params.includes(param)) {
      warnings.push({
        severity: 'warning',
        code: 'UNKNOWN_PARAMETER',
        message: `Page ${routePattern} may not support parameter: ${param}`,
        ctaId: cta.id,
        source: cta.source,
      });
    }
  }
  
  // Validate metrics
  if (cta.promise.metrics) {
    for (const metric of cta.promise.metrics) {
      if (!pageContract.metrics.includes(metric.type)) {
        warnings.push({
          severity: 'warning',
          code: 'UNSUPPORTED_METRIC',
          message: `Page ${routePattern} may not support metric type: ${metric.type}`,
          ctaId: cta.id,
          source: cta.source,
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract route pattern from full route (e.g., /dashboard/properties/123/health-score -> /dashboard/properties/:id/health-score)
 */
function extractRoutePattern(route: string): string {
  // Replace UUIDs and numeric IDs with :id
  return route
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .split('?')[0]; // Remove query params
}

/**
 * Create a CTA contract
 */
export function createCTAContract(
  id: string,
  source: string,
  promise: CTAPromise,
  destination: CTADestination
): CTAContract {
  return {
    id,
    source,
    promise,
    destination,
    createdAt: new Date(),
  };
}

/**
 * Validate all CTA contracts
 */
export function validateAllContracts(contracts: CTAContract[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];
  
  for (const contract of contracts) {
    const result = validateCTAContract(contract);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Runtime validation hook for CTA navigation
 */
export function useCtaValidation(contract: CTAContract) {
  if (process.env.NODE_ENV === 'development') {
    const result = validateCTAContract(contract);
    
    if (!result.valid) {
      console.error(`[CTA Validation] Errors in ${contract.id}:`, result.errors);
    }
    
    if (result.warnings.length > 0) {
      console.warn(`[CTA Validation] Warnings in ${contract.id}:`, result.warnings);
    }
  }
}
