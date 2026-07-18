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
  correctionPaths?: string[];
}

export type FeatureContextReadiness =
  | 'READY'
  | 'READY_WITH_LIMITATIONS'
  | 'NEEDS_REQUIRED_CONTEXT'
  | 'CONFLICT_REVIEW_REQUIRED'
  | 'NOT_APPLICABLE'
  | 'PERMISSION_REQUIRED';

export type ContextRequirementClassification =
  | 'REQUIRED_APPLICABILITY'
  | 'REQUIRED_SAFETY'
  | 'REQUIRED_CALCULATION'
  | 'ENHANCEMENT_ACCURACY';

export type ScalarCaptureInputSchema =
  | { type: 'BOOLEAN'; trueLabel: string; falseLabel: string }
  | { type: 'SINGLE_SELECT'; options: Array<{ label: string; value: string }> }
  | { type: 'MULTI_SELECT'; options: Array<{ label: string; value: string }>; maxItems?: number }
  | { type: 'INTEGER'; min?: number; max?: number; unit?: string }
  | { type: 'DECIMAL'; min?: number; max?: number; unit?: string }
  | { type: 'SHORT_TEXT'; maxLength: number };

export interface CaptureFieldCondition {
  fieldKey: string;
  operator: 'EQUALS' | 'NOT_EQUALS';
  value: string | number | boolean;
}

export interface StructuredCaptureField {
  key: string;
  label: string;
  helpText?: string;
  required: boolean;
  inputSchema: ScalarCaptureInputSchema;
  when?: CaptureFieldCondition;
}

export type CaptureInputSchema = ScalarCaptureInputSchema | {
  type: 'GROUP';
  fields: StructuredCaptureField[];
};

export interface ContextCaptureDefinition {
  captureKey: string;
  factKeys: string[];
  mode: 'SCALAR' | 'STRUCTURED' | 'RELATIONAL';
  title: string;
  question: string;
  helpText?: string;
  inputSchema: CaptureInputSchema;
  allowNotSure: boolean;
  canonicalOwner: string;
  actionKey: string;
  sensitivity: 'STANDARD' | 'FINANCIAL' | 'SECURITY';
  /** Backend-only mapping. It is removed from evaluator/API responses. */
  answerBindings?: Record<string, string>;
}

export interface EvaluatedContextRequirement {
  requirementId: string;
  factKeys: string[];
  classification: ContextRequirementClassification;
  state: PropertyFactState;
  reasonCode: string;
  capture: Omit<ContextCaptureDefinition, 'canonicalOwner' | 'answerBindings'>;
  currentAnswer?: unknown;
}

export interface FeatureContextEvaluation {
  propertyId: string;
  contextVersion: string;
  featureKey: string;
  operationKey: string;
  policyVersion: string;
  readiness: FeatureContextReadiness;
  reasonCodes: string[];
  usedFactKeys: string[];
  requirements: EvaluatedContextRequirement[];
  canExecute: boolean;
}
