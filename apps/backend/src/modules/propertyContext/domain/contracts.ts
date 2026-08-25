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
  // Sale Readiness Value-Maximization Checklist plan §4.6: the 6 curated
  // self-reported cosmetic-condition facts (§4.5) — no existing scope fits
  // (STRUCTURE covers types, not current condition; EXTERIOR covers feature
  // presence, not condition).
  'SALE_PREP',
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

export interface PropertyFactConflictEvidence {
  id: string;
  entityType: string;
  entityId: string;
  fieldKey: string | null;
  value: unknown;
  source: PropertyFactSource;
  observedAt: string;
  confidence: number | null;
  verified: boolean;
}

export interface PropertyFactConflict {
  id: string;
  kind: 'COMPETING_FACT' | 'COMPETING_RECORD';
  affectedEntityIds: string[];
  evidence: PropertyFactConflictEvidence[];
  resolutionPath: string;
}

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
  /** Present only when state is CONFLICTED; never discard either candidate. */
  conflicts?: PropertyFactConflict[];
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

export type CaptureDatePrecision = 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE' | 'UNKNOWN';

export type ScalarCaptureInputSchema =
  | { type: 'BOOLEAN'; trueLabel: string; falseLabel: string }
  | { type: 'SINGLE_SELECT'; options: Array<{ label: string; value: string }> }
  | { type: 'MULTI_SELECT'; options: Array<{ label: string; value: string }>; maxItems?: number }
  | { type: 'INTEGER'; min?: number; max?: number; unit?: string }
  | { type: 'DECIMAL'; min?: number; max?: number; unit?: string }
  | { type: 'SHORT_TEXT'; maxLength: number }
  | { type: 'APPROXIMATE_DATE'; allowedPrecisions?: CaptureDatePrecision[]; allowFuture?: boolean };

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

export interface RelationalCaptureOption {
  id: string;
  label: string;
  description?: string;
}

export interface RelationalSelectCreateInputSchema {
  type: 'RELATIONAL_SELECT_CREATE';
  entityType: 'INVENTORY_ITEM' | 'INSURANCE_POLICY' | 'WARRANTY';
  selectLabel: string;
  createLabel: string;
  options: RelationalCaptureOption[];
  createFields: StructuredCaptureField[];
}

export interface RelationalUpdateInputSchema {
  type: 'RELATIONAL_UPDATE';
  entityType: 'INVENTORY_ITEM';
  entityId: string;
  updateLabel: string;
  fields: StructuredCaptureField[];
  currentValues: Record<string, unknown>;
}

export type RelationalCaptureInputSchema = RelationalSelectCreateInputSchema | RelationalUpdateInputSchema;

export type CaptureInputSchema = ScalarCaptureInputSchema | {
  type: 'GROUP';
  fields: StructuredCaptureField[];
} | RelationalCaptureInputSchema;

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
  /** Backend-only allowlisted relational command. */
  relationalAdapterKey?:
    | 'INVENTORY_ITEM'
    | 'INVENTORY_ITEM_LIFECYCLE'
    | 'INVENTORY_ITEM_CONFIRMATION'
    | 'INVENTORY_ITEM_COVERAGE_LIFECYCLE'
    | 'INVENTORY_ITEM_VALUE'
    | 'INVENTORY_ITEM_COVERAGE_EVIDENCE'
    | 'INSURANCE_POLICY'
    | 'WARRANTY';
  /** Backend-only operation-input key that scopes a relational update to an explicit entity. */
  relationalEntityInputKey?: string;
}

export interface EvaluatedContextRequirement {
  requirementId: string;
  factKeys: string[];
  classification: ContextRequirementClassification;
  state: PropertyFactState;
  reasonCode: string;
  capture: Omit<ContextCaptureDefinition, 'canonicalOwner' | 'answerBindings' | 'relationalAdapterKey' | 'relationalEntityInputKey'>;
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
