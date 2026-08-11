import type { AskCaptureRequest, AskConfirmation, AskExecutionStatus, AskPresentationBlock } from '../../productFramework/ask/ask.contract';

export type AskIntentFamily =
  | 'RECORD_QUERY'
  | 'STATUS_SUMMARY'
  | 'CAPABILITY_DISCOVERY'
  | 'GENERAL_HOME_GUIDANCE'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE_OR_RESTRICTED';

export type AskOperationId =
  | 'MAINTENANCE_STATUS'
  | 'COVERAGE_GAPS'
  | 'CAPABILITY_DISCOVERY'
  | 'REPLACEMENT_GUIDANCE'
  | 'REFINANCE_ANALYSIS'
  | 'REFINANCE_RATE_MONITOR'
  | 'EMERGENCY_BOUNDARY'
  | 'OUT_OF_SCOPE_BOUNDARY'
  | 'GROUNDED_GUIDANCE';

export interface AskOperationResolution {
  operationId: AskOperationId;
  version: string;
  family: AskIntentFamily;
  confidence: number;
  requiresProperty: boolean;
}

export interface AskOperationResult {
  status: AskExecutionStatus;
  reasonCode?: string;
  contextVersion?: string | null;
  blocks: AskPresentationBlock[];
  captureRequests?: AskCaptureRequest[];
  confirmation?: AskConfirmation | null;
  suggestions: string[];
  parameters?: Record<string, unknown>;
}

const emergencyPattern = /\b(smell(?:ing)? gas|gas leak|carbon monoxide|\bco alarm|sparks? (?:from|at)|electrical fire|actively flooding.*electric|fire now)\b/i;
const outOfScopePattern = /\b(python|javascript|typescript|coding interview|write (?:me )?(?:a )?program|never[- ]ending loop|system prompt|celebrity news|school essay)\b/i;
const maintenancePattern = /\b(maintenance|maintain|task|tasks|overdue|due soon|completed work|pending work|service history)\b/i;
const coveragePattern = /\b(missing coverage|coverage gaps?|uncovered|warranty coverage|insurance coverage|items? (?:without|missing) (?:a )?(?:warranty|coverage))\b/i;
const replacementPattern = /\b(when should i (?:replace|upgrade)|replace (?:my|the)|repair or replace|how (?:old|long).*(?:refrigerator|fridge)|(?:refrigerator|fridge).*(?:replace|replacement|lifespan|life expectancy))\b/i;
const refinanceAnalysisPattern = /\b(is (?:it )?(?:a )?good (?:time|option).*refinanc(?:e|ing)|should i refinanc(?:e|ing)|is refinanc(?:ing|e) (?:now )?(?:worth|good|right)|ideal (?:interest )?rate.*refinanc(?:e|ing)|what rate.*refinanc(?:e|ing)|refinanc(?:e|ing).*(?:worth it|make sense|good option))\b/i;
const refinanceMonitorPattern = /\b(?:notify|alert|let me know|monitor|tell me).*(?:mortgage |refinanc(?:e|ing) )?rates?.*(?:below|under|drop|reach)|\brates?.*(?:below|under|drop|reach).*(?:notify|alert|let me know|monitor|tell me)\b/i;
const capabilityPattern = /\b(tool|something available|what can help|do you have|help me (?:with|plan)|refinanc|sell.*rent|compare.*quote|savings?|rebates?|monitor)\b/i;

export function resolveAskOperation(message: string): AskOperationResolution {
  if (emergencyPattern.test(message)) {
    return { operationId: 'EMERGENCY_BOUNDARY', version: '1.0', family: 'UNSAFE_OR_RESTRICTED', confidence: 1, requiresProperty: false };
  }
  if (outOfScopePattern.test(message)) {
    return { operationId: 'OUT_OF_SCOPE_BOUNDARY', version: '1.0', family: 'OUT_OF_SCOPE', confidence: 0.99, requiresProperty: false };
  }
  if (coveragePattern.test(message)) {
    return { operationId: 'COVERAGE_GAPS', version: '1.0', family: 'STATUS_SUMMARY', confidence: 0.96, requiresProperty: true };
  }
  if (maintenancePattern.test(message)) {
    return { operationId: 'MAINTENANCE_STATUS', version: '1.0', family: 'RECORD_QUERY', confidence: 0.94, requiresProperty: true };
  }
  if (replacementPattern.test(message)) {
    return { operationId: 'REPLACEMENT_GUIDANCE', version: '1.0', family: 'GENERAL_HOME_GUIDANCE', confidence: 0.96, requiresProperty: true };
  }
  if (refinanceMonitorPattern.test(message)) {
    return { operationId: 'REFINANCE_RATE_MONITOR', version: '1.0', family: 'GENERAL_HOME_GUIDANCE', confidence: 0.98, requiresProperty: true };
  }
  if (refinanceAnalysisPattern.test(message)) {
    return { operationId: 'REFINANCE_ANALYSIS', version: '1.0', family: 'GENERAL_HOME_GUIDANCE', confidence: 0.97, requiresProperty: true };
  }
  if (capabilityPattern.test(message)) {
    return { operationId: 'CAPABILITY_DISCOVERY', version: '1.0', family: 'CAPABILITY_DISCOVERY', confidence: 0.88, requiresProperty: false };
  }
  return { operationId: 'GROUNDED_GUIDANCE', version: '1.0', family: 'GENERAL_HOME_GUIDANCE', confidence: 0.55, requiresProperty: false };
}
