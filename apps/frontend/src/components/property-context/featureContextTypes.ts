export type FeatureContextReadiness =
  | 'READY'
  | 'READY_WITH_LIMITATIONS'
  | 'NEEDS_REQUIRED_CONTEXT'
  | 'CONFLICT_REVIEW_REQUIRED'
  | 'NOT_APPLICABLE'
  | 'PERMISSION_REQUIRED';

export type ScalarCaptureInputSchema =
  | { type: 'BOOLEAN'; trueLabel: string; falseLabel: string }
  | { type: 'SINGLE_SELECT'; options: Array<{ label: string; value: string }> }
  | { type: 'MULTI_SELECT'; options: Array<{ label: string; value: string }>; maxItems?: number }
  | { type: 'INTEGER' | 'DECIMAL'; min?: number; max?: number; unit?: string }
  | { type: 'SHORT_TEXT'; maxLength: number };

export type StructuredCaptureField = {
  key: string;
  label: string;
  helpText?: string;
  required: boolean;
  inputSchema: ScalarCaptureInputSchema;
  when?: { fieldKey: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string | number | boolean };
};

export type CaptureInputSchema = ScalarCaptureInputSchema | {
  type: 'GROUP';
  fields: StructuredCaptureField[];
} | {
  type: 'RELATIONAL_SELECT_CREATE';
  entityType: 'INVENTORY_ITEM' | 'INSURANCE_POLICY' | 'WARRANTY';
  selectLabel: string;
  createLabel: string;
  options: Array<{ id: string; label: string; description?: string }>;
  createFields: StructuredCaptureField[];
} | {
  type: 'RELATIONAL_UPDATE';
  entityType: 'INVENTORY_ITEM';
  entityId: string;
  updateLabel: string;
  fields: StructuredCaptureField[];
  currentValues: Record<string, unknown>;
};

export interface FeatureContextCapture {
  captureKey: string;
  factKeys: string[];
  mode: 'SCALAR' | 'STRUCTURED' | 'RELATIONAL';
  title: string;
  question: string;
  helpText?: string;
  inputSchema: CaptureInputSchema;
  allowNotSure: boolean;
  actionKey: string;
  sensitivity: 'STANDARD' | 'FINANCIAL' | 'SECURITY';
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
  requirements: Array<{
    requirementId: string;
    factKeys: string[];
    classification: 'REQUIRED_APPLICABILITY' | 'REQUIRED_SAFETY' | 'REQUIRED_CALCULATION' | 'ENHANCEMENT_ACCURACY';
    state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
    reasonCode: string;
    capture: FeatureContextCapture;
    currentAnswer?: unknown;
  }>;
  canExecute: boolean;
}

export interface FeatureContextCaptureResult {
  captureId: string;
  contextVersion: string;
  updatedFactKeys: string[];
  evidenceIds: string[];
  selection?: { entityType: 'INVENTORY_ITEM' | 'INSURANCE_POLICY' | 'WARRANTY'; entityId: string; created: boolean };
  evaluation: FeatureContextEvaluation;
}
