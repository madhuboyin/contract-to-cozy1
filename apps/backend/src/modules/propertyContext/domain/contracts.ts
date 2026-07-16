export const PROPERTY_CONTEXT_SCOPES = [
  'CORE',
  'LOCATION',
  'STRUCTURE',
  'EXTERIOR',
  'RESPONSIBILITY',
  'SYSTEMS',
  'SAFETY',
  'ROOMS',
  'INVENTORY',
  'MAINTENANCE',
  'RECALLS',
  'INSPECTION',
  'COVERAGE',
  'RISK',
  'FINANCIAL',
  'COMPLIANCE',
  'PROJECTS',
  'EVENTS',
  'ENVIRONMENT',
  'GUIDANCE_STATE',
  'PRODUCT_CONTEXT',
  'OPTIONAL_HOUSEHOLD',
] as const;

export type PropertyContextScope = typeof PROPERTY_CONTEXT_SCOPES[number];
export type PropertyFactState = 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
export type PropertyFactSource =
  | 'USER_REPORTED'
  | 'DOCUMENT'
  | 'INSPECTION'
  | 'PUBLIC_RECORD'
  | 'INTEGRATION'
  | 'SYSTEM_DERIVED';

export interface PropertyFact<T = unknown> {
  key: string;
  value: T | null;
  state: PropertyFactState;
  source: PropertyFactSource | null;
  verified: boolean;
  confidence: number | null;
  observedAt: string | null;
  validUntil: string | null;
  correctionPath: string | null;
}
export interface PropertyContextWarning {
  code: 'CONFLICT' | 'STALE_SOURCE' | 'PARTIAL_SCOPE';
  factKeys: string[];
}

export interface PropertyContextSnapshot {
  propertyId: string;
  contextVersion: string;
  generatedAt: string;
  scopes: PropertyContextScope[];
  facts: Record<string, PropertyFact>;
  warnings: PropertyContextWarning[];
}

export interface PropertyContextActor {
  userId: string;
}

export interface PropertyContextRequest {
  scopes: PropertyContextScope[];
}

export type ApplicabilityStatus = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export interface FeatureDecision {
  status: ApplicabilityStatus;
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  validUntil: string | null;
}
