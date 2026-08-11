import type { AskCaptureRequest, AskConfirmation, AskExecutionStatus, AskPresentationBlock } from '../../productFramework/ask/ask.contract';

export type AskIntentFamily =
  | 'RECORD_QUERY'
  | 'STATUS_SUMMARY'
  | 'CAPABILITY_DISCOVERY'
  | 'WORKFLOW_GUIDANCE'
  | 'GENERAL_HOME_GUIDANCE'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE_OR_RESTRICTED';

export type AskOperationId =
  | 'MAINTENANCE_STATUS'
  | 'MAINTENANCE_TASK_CREATE'
  | 'COVERAGE_GAPS'
  | 'SAVINGS_OPPORTUNITIES'
  | 'OWNERSHIP_COSTS'
  | 'INVENTORY_LOOKUP'
  | 'PROPERTY_SUMMARY'
  | 'HOME_ACTIONS'
  | 'CAPABILITY_DISCOVERY'
  | 'REPLACEMENT_GUIDANCE'
  | 'REFINANCE_ANALYSIS'
  | 'REFINANCE_RATE_MONITOR'
  | 'SELL_HOLD_RENT_ANALYSIS'
  | 'HOUSEHOLD_INVITATION'
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
const maintenancePattern = /\b(maintenance|maintain|task|tasks|overdue|due soon|what(?:'s| is) due|completed work|pending work|service history|what did (?:i|we) complete|work (?:i |we )?(?:completed|finished)|what should (?:i|we) do before (?:winter|spring|summer|fall|autumn))\b/i;
const maintenanceCreatePattern = /\b(?:create|add|schedule|set up)\b.{0,80}\b(?:maintenance(?: task)?|tasks?|gutter (?:cleaning|inspection)|clean(?:ing)? (?:the )?gutters?|filter change|(?:hvac|furnace|boiler|roof|water heater) (?:service|inspection|cleaning|repair|replacement))\b|\b(?:remind me to|put on my maintenance list)\b/i;
const coveragePattern = /\b(missing coverage|coverage gaps?|uncovered|warranty coverage|insurance coverage|items? (?:without|missing) (?:a )?(?:warranty|coverage)|warrant(?:y|ies) (?:are )?(?:expire|expiring|expiry)|coverage (?:is )?(?:expire|expiring|expiry)|evidence (?:for|of) (?:my )?(?:expensive|high[ -]?value)? ?(?:appliances?|items?|systems?))\b/i;
const savingsOpportunitiesPattern = /\b(where|how|ways?|opportunities?)\b.{0,45}\b(save|saving|savings|lower|reduce)\b.{0,35}\b(money|costs?|bills?|expenses?|insurance|internet|utilities|energy|warranty)\b|\b(?:where|how) (?:can|could|do) (?:i|we) save\b|\b(?:saving|savings) opportunities\b|\blower (?:my |our )?(?:home |household )?(?:costs?|bills?|expenses?)\b|\bwhat savings\b.{0,35}\b(?:realized|received|saved)\b|\b(?:fastest|shortest|best) payback\b/i;
const ownershipCostsPattern = /\b(?:how much|what does|what is|what are|show|break down)\b.{0,45}\b(?:home|house|housing|property|ownership)\b.{0,45}\b(?:cost|costs|expense|expenses|outflow)\b|\b(?:how much am i|what am i)\b.{0,45}\b(?:paying|spending)\b.{0,45}\b(?:home|house|housing|property)\b|\b(?:monthly|annual|yearly|total|true|ownership|operating|cash)\s+(?:home |house |housing |property )?(?:cost|costs|expenses?|outflow)\b|\bcost of owning\b|\b(?:largest|biggest|highest|most expensive)\b.{0,35}\b(?:home |ownership )?(?:cost|expense|category)\b|\bwhich (?:cost |expense )?categor(?:y|ies)\b.{0,35}\b(?:most|highest|largest)\b/i;
const inventoryLookupPattern = /\b(?:what do you know about|tell me about|show|find|list|which|do i have)\b.{0,65}\b(?:inventory|appliances?|systems?|equipment|hvac|furnace|air conditioner|heat pump|boiler|refrigerator|fridge|water heater|roof|washer|dryer|dishwasher)\b|\b(?:inventory|appliance|system|equipment)\s+(?:record|records|details|items|list)\b|\b(?:incomplete|missing)\b.{0,35}\b(?:inventory|appliance|system)\s+(?:record|records|details|information)\b|\b(?:my|the|this)\s+(?:hvac|furnace|air conditioner|heat pump|boiler|refrigerator|fridge|water heater|roof|washer|dryer|dishwasher)\b.{0,45}\b(?:history|record|details|information|know)\b|\b(?:systems?|equipment|appliances?)\b.{0,45}\b(?:end of life|expiry|expire|incomplete)\b/i;
const propertySummaryPattern = /\b(?:summarize|summary of|overview of|what do you know about|tell me about|show me)\b.{0,60}\b(?:my|this|the)?\s*(?:home|house|property|home record|living home record)\b|\b(?:home|property|living home)\s+(?:record )?(?:summary|overview|profile)\b|\bhow complete\b.{0,45}\b(?:home record|property profile|home profile|living home record)\b/i;
const homeActionsPattern = /\b(?:what should i do next|what needs (?:my |our )?attention|next best action|highest priority|top priorit(?:y|ies)|home actions?|what can wait|what should i plan|anything urgent|urgent home action|where should i start)\b/i;
const replacementPattern = /\b(when should i (?:replace|upgrade)|replace (?:my|the)|repair or replace|how (?:old|long).*(?:refrigerator|fridge)|(?:refrigerator|fridge).*(?:replace|replacement|lifespan|life expectancy))\b/i;
const refinanceAnalysisPattern = /\b(is (?:it )?(?:a )?good (?:time|option).*refinanc(?:e|ing)|should i refinanc(?:e|ing)|is refinanc(?:ing|e) (?:now )?(?:worth|good|right)|ideal (?:interest )?rate.*refinanc(?:e|ing)|what rate.*refinanc(?:e|ing)|refinanc(?:e|ing).*(?:worth it|make sense|good option))\b/i;
const refinanceMonitorPattern = /\b(?:notify|alert|let me know|monitor|tell me).*(?:mortgage |refinanc(?:e|ing) )?rates?.*(?:below|under|drop|reach)|\brates?.*(?:below|under|drop|reach).*(?:notify|alert|let me know|monitor|tell me)\b/i;
const sellHoldRentAnalysisPattern = /\b(?:should|could|would|will|is|when|benefit|better|compare|decide|planning|plan)\b.{0,55}\b(?:sell|selling|hold|holding|rent(?:ing)?(?: out)?|landlord)\b|\b(?:sell|selling)\b.{0,55}\b(?:hold|holding|rent(?:ing)?(?: out)?|landlord|good time|worth|benefit|better)\b|\b(?:hold|holding|rent(?:ing)?(?: out)?)\b.{0,55}\b(?:sell|selling|better|benefit)\b/i;
const householdInvitationPattern = /\b(?:invite|add|share (?:my|the) home with)\b.{0,50}\b(?:wife|husband|spouse|partner|family member|household member|someone|person)\b|\bhousehold\b.{0,40}\b(?:invite|invitation|add (?:a )?member)\b/i;
const explicitCapabilityPattern = /\b(?:tool|something (?:available|to help)|anything (?:available|to help)|what can help|do you have|feature available)\b/i;
const capabilityPattern = /\b(tool|something available|what can help|do you have|help me (?:with|plan)|refinanc|sell.*rent|compare.*quote|savings?|rebates?|monitor)\b/i;

export function resolveAskOperation(message: string): AskOperationResolution {
  if (emergencyPattern.test(message)) {
    return { operationId: 'EMERGENCY_BOUNDARY', version: '1.0', family: 'UNSAFE_OR_RESTRICTED', confidence: 1, requiresProperty: false };
  }
  if (outOfScopePattern.test(message)) {
    return { operationId: 'OUT_OF_SCOPE_BOUNDARY', version: '1.0', family: 'OUT_OF_SCOPE', confidence: 0.99, requiresProperty: false };
  }
  if (maintenanceCreatePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return { operationId: 'MAINTENANCE_TASK_CREATE', version: '1.0', family: 'WORKFLOW_GUIDANCE', confidence: 0.97, requiresProperty: true };
  }
  if (coveragePattern.test(message)) {
    return { operationId: 'COVERAGE_GAPS', version: '1.0', family: 'STATUS_SUMMARY', confidence: 0.96, requiresProperty: true };
  }
  if (savingsOpportunitiesPattern.test(message)) {
    return { operationId: 'SAVINGS_OPPORTUNITIES', version: '1.0', family: 'STATUS_SUMMARY', confidence: 0.97, requiresProperty: true };
  }
  if (ownershipCostsPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return { operationId: 'OWNERSHIP_COSTS', version: '1.0', family: 'STATUS_SUMMARY', confidence: 0.97, requiresProperty: true };
  }
  if (inventoryLookupPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return { operationId: 'INVENTORY_LOOKUP', version: '1.0', family: 'RECORD_QUERY', confidence: 0.96, requiresProperty: true };
  }
  if (propertySummaryPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return { operationId: 'PROPERTY_SUMMARY', version: '1.0', family: 'STATUS_SUMMARY', confidence: 0.96, requiresProperty: true };
  }
  if (homeActionsPattern.test(message) && !explicitCapabilityPattern.test(message) && !maintenancePattern.test(message)) {
    return { operationId: 'HOME_ACTIONS', version: '1.0', family: 'STATUS_SUMMARY', confidence: 0.96, requiresProperty: true };
  }
  if (maintenancePattern.test(message) && !explicitCapabilityPattern.test(message)) {
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
  if (sellHoldRentAnalysisPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return { operationId: 'SELL_HOLD_RENT_ANALYSIS', version: '1.0', family: 'GENERAL_HOME_GUIDANCE', confidence: 0.96, requiresProperty: true };
  }
  if (householdInvitationPattern.test(message)) {
    return { operationId: 'HOUSEHOLD_INVITATION', version: '1.0', family: 'WORKFLOW_GUIDANCE', confidence: 0.98, requiresProperty: true };
  }
  if (explicitCapabilityPattern.test(message) || capabilityPattern.test(message)) {
    return { operationId: 'CAPABILITY_DISCOVERY', version: '1.0', family: 'CAPABILITY_DISCOVERY', confidence: 0.88, requiresProperty: false };
  }
  return { operationId: 'GROUNDED_GUIDANCE', version: '1.0', family: 'GENERAL_HOME_GUIDANCE', confidence: 0.55, requiresProperty: false };
}
